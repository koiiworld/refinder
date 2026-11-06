import "server-only";
import { q, q1, newId, j } from "./db";
import { addEvent, getDocument, getProject, updateProject } from "./repo";
import { enqueue } from "./jobs";
import type { PostExtras, PostPlan } from "./posts-types";

export class WorkflowError extends Error {}

/** ② 고른 키워드(1개 또는 여러 개)로 글 1개를 만들고 ③ 제목 후보만 뽑음 — 글쓰기는 사용자가 버튼으로 시작 */
export async function createPosts(blogId: string, pickIds: string[], brief?: import("./posts-types").PostBrief) {
  if (!pickIds.length) throw new WorkflowError("키워드를 하나 이상 선택하세요.");
  const rows = await q<{ id: string; keyword: string; status: string }>("SELECT id, keyword, status FROM keyword_picks WHERE blog_id=$1 AND id = ANY($2)", [blogId, pickIds]);
  // 고른 순서대로 (첫 번째가 메인 키워드)
  const picks = pickIds.map((pid) => rows.find((r) => r.id === pid)).filter((p): p is (typeof rows)[number] => !!p && p.status !== "used");
  if (!picks.length) return [];
  const keywords = Array.from(new Set(picks.map((p) => p.keyword)));
  const id = newId("prj_");
  await q(`INSERT INTO projects (id, blog_id, title, topic, stage, status) VALUES ($1,$2,$3,$4,'titles','running')`, [id, blogId, keywords[0], keywords.join(", ")]);
  await q("UPDATE keyword_picks SET status='used', project_id=$2 WHERE id = ANY($1)", [picks.map((p) => p.id), id]);
  await addEvent(id, "create", `② 키워드 선택: ${keywords.join(", ")}`);
  await enqueue("titles", { projectId: id, payload: brief ? { brief } : {} });
  return [id];
}

/** ③ 고른 제목으로 ④ 글 작성 시작 (사용자가 버튼을 눌러야 시작) → 끝나면 ⑥ 검수까지 자동 */
export async function startWriting(projectId: string, input: { index?: number; title?: string } = {}) {
  const p = await getProject(projectId);
  if (!p?.plan) throw new WorkflowError("제목 후보가 아직 없습니다.");
  await noRunningJob(projectId);
  if (input.index !== undefined || input.title) await selectTitle(projectId, input);
  await updateProject(projectId, { stage: "writing", status: "running", status_message: "" });
  await enqueue("write", { projectId });
  const fresh = await getProject(projectId);
  await addEvent(projectId, "approve", `③ 제목 확정 → ④ 글 작성 시작: ${fresh?.title ?? ""}`);
}

/** ③-2 기획안 만들기 (제목 확정 → 목차·근거 → 승인 대기) */
export async function requestOutline(projectId: string, input: { index?: number; title?: string } = {}) {
  const p = await getProject(projectId);
  if (!p?.plan) throw new WorkflowError("제목 후보가 아직 없습니다.");
  await noRunningJob(projectId);
  if (input.index !== undefined || input.title) await selectTitle(projectId, input);
  await updateProject(projectId, { status: "running", status_message: "" });
  await enqueue("outline", { projectId });
  await addEvent(projectId, "approve", `③ 제목 확정 → 기획안 요청`);
}

/** ③-2 기획안 승인(고친 내용 반영) → ④ 글 작성 시작 */
export async function approveOutline(projectId: string, edited?: Partial<import("./posts-types").PostOutline>) {
  const p = await getProject(projectId);
  const plan = p?.plan as unknown as import("./posts-types").PostPlan | null;
  if (!plan?.outline) throw new WorkflowError("승인할 기획안이 없습니다.");
  const o = plan.outline;
  const outline = {
    ...o,
    sections: Array.isArray(edited?.sections) ? edited!.sections.map((s) => ({ heading: String(s.heading ?? "").slice(0, 120), points: (s.points ?? []).map(String).slice(0, 4) })).filter((s) => s.heading).slice(0, 8) : o.sections,
    claims: Array.isArray(edited?.claims) ? edited!.claims.map((c) => ({ claim: String(c.claim ?? "").slice(0, 200), evidence: String(c.evidence ?? "").slice(0, 200), source: String(c.source ?? "").slice(0, 200), check: !!c.check })).filter((c) => c.claim).slice(0, 8) : o.claims,
    images: Array.isArray(edited?.images) ? edited!.images.map((m, i) => ({ n: Number(m.n) || i + 1, what: String(m.what ?? "").slice(0, 160) })).filter((m) => m.what).slice(0, 5) : o.images,
    approved: true,
  };
  await updateProject(projectId, { plan: { ...plan, outline } });
  await addEvent(projectId, "approve", "③-2 기획안 승인");
  await startWriting(projectId);
}

async function noRunningJob(projectId: string) {
  const r = await q("SELECT id FROM jobs WHERE project_id=$1 AND status IN ('queued','running')", [projectId]);
  if (r.length) throw new WorkflowError("AI가 작업 중입니다. 끝난 뒤 다시 시도하세요.");
}

/** 다시 실행: titles(제목부터 전부) | write(글부터) | review(검수만) */
export async function rerun(projectId: string, step: "titles" | "write" | "review", feedback?: string) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("글을 찾을 수 없습니다.");
  await noRunningJob(projectId);
  if (step !== "titles" && !p.plan) throw new WorkflowError("제목이 먼저 필요합니다.");
  const stage = { titles: "titles", write: "writing", review: p.stage === "published" ? "published" : "reviewing" }[step];
  await updateProject(projectId, { stage, status: "running", status_message: "" });
  await enqueue(step, { projectId, payload: feedback ? { feedback } : {} });
  await addEvent(projectId, "rerun", `${{ titles: "③ 제목", write: "④ 글", review: "⑥ 검수" }[step]} 다시 실행${feedback ? `: ${feedback}` : ""}`);
}

/** 제목 바꾸기 (후보 번호 또는 직접 입력) — 본문은 그대로, 제목만 변경 */
export async function selectTitle(projectId: string, input: { index?: number; title?: string }) {
  const p = await getProject(projectId);
  const plan = p?.plan as unknown as PostPlan | null;
  if (!p || !plan) throw new WorkflowError("제목 후보가 없습니다.");
  const title = (input.title?.trim() || plan.candidates[Number(input.index)]?.title || "").trim();
  if (!title) throw new WorkflowError("제목을 선택하세요.");
  const next: PostPlan = { ...plan, selectedTitle: title, userPicked: true };
  await updateProject(projectId, { plan: next, title });
  await q("UPDATE documents SET title=$2, revision=revision+1, updated_at=NOW() WHERE project_id=$1", [projectId, title]);
  await addEvent(projectId, "edit", `제목 변경: ${title}`);
}

export async function setHashtags(projectId: string, hashtags: string[]) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("글을 찾을 수 없습니다.");
  const extras = ((p.package as unknown as PostExtras) ?? { hashtags: [], images: [] }) as PostExtras;
  extras.hashtags = Array.from(new Set(hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))).slice(0, 30);
  await updateProject(projectId, { package: extras });
}

export async function setImage(projectId: string, index: number, patch: Partial<PostExtras["images"][number]>) {
  const p = await getProject(projectId);
  const extras = (p?.package as unknown as PostExtras) ?? null;
  if (!p || !extras?.images?.[index]) throw new WorkflowError("이미지를 찾을 수 없습니다.");
  extras.images[index] = { ...extras.images[index], ...patch };
  await updateProject(projectId, { package: extras });
  return extras.images[index];
}

/** 생성된 이미지를 본문의 [이미지 N] 자리에 넣기 (자리가 없으면 맨 끝) */
export async function insertImage(projectId: string, index: number) {
  const p = await getProject(projectId);
  const extras = (p?.package as unknown as PostExtras) ?? null;
  const im = extras?.images?.[index];
  if (!p || !im?.url) throw new WorkflowError("먼저 이미지를 생성하세요.");
  const doc = await getDocument(projectId);
  const html = doc?.content_html ?? "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const tag = `<img src="${esc(im.url)}" alt="${esc(im.alt)}">${im.credit ? `<p>${esc(im.credit)}</p>` : ""}`;
  const marker = new RegExp(`<p>\\s*\\[이미지\\s*${index + 1}(?:[^\\]]*)\\]\\s*</p>`);
  const next = marker.test(html) ? html.replace(marker, tag) : `${html}\n${tag}`;
  await q("UPDATE documents SET content_html=$2, last_editor='user', user_edited_at=NOW(), revision=revision+1, updated_at=NOW() WHERE project_id=$1", [projectId, next]);
  await setImage(projectId, index, { inserted: true });
  await addEvent(projectId, "image", `⑤ 이미지 ${index + 1} 본문에 넣음`);
}

/** ⑦ 발행 완료 표시 (외부 블로그에 자동 발행하지 않음 — 사용자가 직접 게시) */
export async function markPublished(projectId: string, url: string | null, published = true) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("글을 찾을 수 없습니다.");
  const extras = ((p.package as unknown as PostExtras) ?? { hashtags: [], images: [] }) as PostExtras;
  extras.publishedUrl = published ? url?.trim() || null : null;
  extras.publishedAt = published ? new Date().toISOString() : null;
  await updateProject(projectId, { package: extras, stage: published ? "published" : "ready", status: published ? "done" : "waiting" });
  await addEvent(projectId, "publish", published ? `⑦ 발행 완료${url ? `: ${url}` : ""}` : "발행 완료 취소");
}

/** ⑥ 검수 지적 사항을 AI로 고치기 */
export async function requestFix(projectId: string, indexes: number[], notes: Record<string, string> = {}, general = "") {
  const p = await getProject(projectId);
  const issues = (p?.review as unknown as { issues?: unknown[] } | null)?.issues ?? [];
  const valid = Array.from(new Set(indexes.map(Number))).filter((i) => Number.isInteger(i) && i >= 0 && i < issues.length);
  const g = String(general ?? "").trim().slice(0, 3000);
  if (!p?.review) throw new WorkflowError("검수 결과가 없습니다.");
  if (!valid.length && !g) throw new WorkflowError("고칠 지적 사항을 고르거나 글 전체 수정사항을 적어 주세요.");
  await noRunningJob(projectId);
  if (Object.keys(notes).length) await saveIssueNotes(projectId, notes);
  if (g) await updateProject(projectId, { review: { ...((await getProject(projectId))!.review as object), generalNote: g } });
  await updateProject(projectId, { status: "running", status_message: "" });
  await enqueue("fix", { projectId, payload: { indexes: valid, general: g } });
  await addEvent(projectId, "rerun", `⑥ ${valid.length ? `지적 ${valid.length}건` : ""}${valid.length && g ? " + " : ""}${g ? `글 전체 수정사항: ${g}` : ""} AI 수정 요청`);
}

/** ⑥ 검수 지적마다 사용자가 단 코멘트 저장 (AI 수정 때 함께 반영) */
export async function saveIssueNotes(projectId: string, notes: Record<string, string>) {
  const p = await getProject(projectId);
  const review = p?.review as unknown as { issues?: Record<string, unknown>[] } | null;
  if (!p || !review?.issues) throw new WorkflowError("검수 결과가 없습니다.");
  const issues = review.issues.map((it, i) => (String(i) in notes ? { ...it, userNote: String(notes[String(i)] ?? "").slice(0, 2000) } : it));
  await updateProject(projectId, { review: { ...review, issues } });
}

/** ④ 사용자가 직접 적은 수정 요청사항을 AI가 해당 부분만 반영 */
export async function requestEdit(projectId: string, note: string) {
  const p = await getProject(projectId);
  const text = note.trim().slice(0, 3000);
  if (!p) throw new WorkflowError("글을 찾을 수 없습니다.");
  if (!text) throw new WorkflowError("수정 요청사항을 적어 주세요.");
  if (!(await getDocument(projectId))?.content_html) throw new WorkflowError("먼저 글이 있어야 합니다.");
  await noRunningJob(projectId);
  await updateProject(projectId, { status: "running", status_message: "" });
  await enqueue("fix", { projectId, payload: { note: text } });
  await addEvent(projectId, "rerun", `수정 요청사항: ${text}`);
}

export async function cancelJobs(projectId: string) {
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id=$1 AND status='queued'", [projectId]);
  const running = await q1("SELECT id FROM jobs WHERE project_id=$1 AND status='running'", [projectId]);
  if (!running) await updateProject(projectId, { status: "error", status_message: "작업을 취소했습니다. '다시 실행'으로 이어서 할 수 있습니다." });
}

void j;
