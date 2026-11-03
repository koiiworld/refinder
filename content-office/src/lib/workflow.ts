import "server-only";
import { q, q1, newId, j } from "./db";
import { addEvent, getDocument, getProject, updateProject } from "./repo";
import { enqueue } from "./jobs";
import type { PostExtras, PostPlan } from "./posts-types";

export class WorkflowError extends Error {}

/** ② 선택한 키워드마다 글을 만들고 ③→④→⑥ 을 자동으로 시작 */
export async function createPosts(blogId: string, pickIds: string[]) {
  if (!pickIds.length) throw new WorkflowError("키워드를 하나 이상 선택하세요.");
  const picks = await q<{ id: string; keyword: string; status: string }>("SELECT id, keyword, status FROM keyword_picks WHERE blog_id=$1 AND id = ANY($2)", [blogId, pickIds]);
  const ids: string[] = [];
  for (const p of picks) {
    if (p.status === "used") continue;
    const id = newId("prj_");
    await q(
      `INSERT INTO projects (id, blog_id, title, topic, stage, status) VALUES ($1,$2,$3,$3,'titles','running')`,
      [id, blogId, p.keyword],
    );
    await q("UPDATE keyword_picks SET status='used', project_id=$2 WHERE id=$1", [p.id, id]);
    await addEvent(id, "create", `② 키워드 선택: ${p.keyword}`);
    await enqueue("titles", { projectId: id });
    ids.push(id);
  }
  return ids;
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
  const tag = `<img src="${im.url}" alt="${im.alt.replace(/"/g, "&quot;")}">`;
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

export async function cancelJobs(projectId: string) {
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id=$1 AND status='queued'", [projectId]);
  const running = await q1("SELECT id FROM jobs WHERE project_id=$1 AND status='running'", [projectId]);
  if (!running) await updateProject(projectId, { status: "error", status_message: "작업을 취소했습니다. '다시 실행'으로 이어서 할 수 있습니다." });
}

void j;
