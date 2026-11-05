import "server-only";
import { q, q1, newId, j } from "./db";
import type { Blog, Job, Project, ReviewResult } from "./types";
import { addEvent, getBlogForAi, getDocument, getProject, updateProject, writeAiDraft } from "./repo";
import { extractJson, runStep, sanitizeHtml } from "./ai/run";
import { AiError } from "./ai/providers";
import { reviewTemplate } from "./ai/prompts";
import { fixPrompt, postReviewPrompt, titlesPrompt, writePrompt } from "./ai/step-prompts";
import { keywordStats, naverAdConnected } from "./searchad";
import type { PostExtras, PostPlan } from "./posts-types";
import { recentPosts, writtenTitles } from "./blog-posts";

const postKeywords = (topic: string) => topic.split(/\s*,\s*/).map((k) => k.trim()).filter(Boolean);

/**
 * 서버 측 작업 큐
 * - 작업은 DB(jobs 테이블)에 저장되므로 서버가 재시작돼도 상태가 유지됩니다.
 * - 재시작 시 'running' 상태로 남은 작업은 다시 대기열로 돌립니다.
 * - 재시도 가능한 오류(429, 5xx, 네트워크)는 지수 백오프로 자동 재시도합니다.
 */

const CONCURRENCY = 2;
const TICK_MS = 1500;

const g = globalThis as unknown as {
  __worker?: { started: boolean; running: number; timer?: NodeJS.Timeout };
};

export async function enqueue(
  type: string,
  opts: { projectId?: string | null; blogId?: string | null; payload?: Record<string, unknown>; maxAttempts?: number },
): Promise<string> {
  const id = newId("job_");
  await q(
    `INSERT INTO jobs (id, project_id, blog_id, type, payload, max_attempts) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, opts.projectId ?? null, opts.blogId ?? null, type, j(opts.payload ?? {}), opts.maxAttempts ?? 6],
  );
  ensureWorker();
  setTimeout(() => void tick(), 10);
  return id;
}

export function ensureWorker() {
  if (!g.__worker) g.__worker = { started: false, running: 0 };
  const w = g.__worker;
  if (w.started) return;
  w.started = true;
  void q(
    `UPDATE jobs SET status='queued', error=COALESCE(error,'') || ' (서버 재시작으로 재시도)' WHERE status='running'`,
  ).catch(() => {});
  w.timer = setInterval(() => void tick(), TICK_MS);
  w.timer.unref?.();
}

async function tick() {
  const w = g.__worker!;
  while (w.running < CONCURRENCY) {
    let job: Job | null = null;
    try {
      job = await q1<Job>(
        `UPDATE jobs SET status='running', attempts=attempts+1, started_at=NOW()
         WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= NOW()
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
      );
    } catch {
      return;
    }
    if (!job) return;
    w.running++;
    void runJob(job).finally(() => {
      w.running--;
    });
  }
}

async function runJob(job: Job) {
  // 휴지통에 있는 글의 작업은 실행하지 않음 (크레딧 낭비 방지)
  if (job.project_id) {
    const p = await q1<{ deleted_at: string | null }>("SELECT deleted_at FROM projects WHERE id=$1", [job.project_id]);
    if (!p || p.deleted_at) {
      await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE id=$1", [job.id]);
      return;
    }
  }
  try {
    await HANDLERS[job.type]?.(job);
    await q("UPDATE jobs SET status='succeeded', finished_at=NOW(), error=NULL WHERE id=$1", [job.id]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retryable = e instanceof AiError ? e.retryable : false;
    if (retryable && job.attempts < job.max_attempts) {
      // AI 서버 혼잡(503)·요청 한도(429)는 길게 기다렸다 재시도: 15초 → 30초 → 1분 → 2분 → 4분 (총 약 8분)
      const busy = e instanceof AiError && (e.status === 503 || e.status === 429);
      const delay = busy ? 15 * 2 ** (job.attempts - 1) : 5 * 2 ** (job.attempts - 1);
      await q(
        `UPDATE jobs SET status='queued', error=$2, run_after=NOW() + ($3 || ' seconds')::interval WHERE id=$1`,
        [job.id, msg, String(delay)],
      );
      if (job.project_id) {
        await updateProject(job.project_id, {
          status_message: busy
            ? `AI 서버가 혼잡해 ${delay >= 60 ? `${Math.round(delay / 60)}분` : `${delay}초`} 후 자동으로 다시 시도합니다 (${job.attempts}/${job.max_attempts}). 기다리시거나 이 화면을 닫아도 계속 진행됩니다.`
            : `오류로 ${delay}초 후 재시도 (${job.attempts}/${job.max_attempts}): ${msg}`,
        });
      }
    } else {
      await q("UPDATE jobs SET status='failed', error=$2, finished_at=NOW() WHERE id=$1", [job.id, msg]);
      if (job.project_id) {
        await updateProject(job.project_id, { status: "error", status_message: `${jobLabel(job.type)} 실패: ${msg}` });
        await addEvent(job.project_id, "error", `${jobLabel(job.type)} 실패: ${msg}`);
      }
    }
  }
}

export function jobLabel(type: string) {
  return ({ titles: "③ SEO 제목 추천", write: "④ 글 작성", review: "⑥ 검수", fix: "⑥ 지적 사항 AI 수정" } as Record<string, string>)[type] ?? type;
}

async function load(job: Job): Promise<{ project: Project; blog: Blog }> {
  const project = await getProject(job.project_id!);
  if (!project) throw new Error("글을 찾을 수 없습니다.");
  const blog = await getBlogForAi(project.blog_id);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  return { project, blog };
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

const HANDLERS: Record<string, (job: Job) => Promise<void>> = {
  // ⑥ 검수에서 고른 지적 사항을 AI가 반영 (본문 일부만 수정) → '다시 검수' 권장
  async fix(job) {
    const { project, blog } = await load(job);
    const review = project.review as unknown as (ReviewResult & { issues: { type: string; severity: string; quote: string; comment: string; suggestion: string; fixed?: boolean }[] }) | null;
    const doc = await getDocument(project.id);
    const indexes = arr(job.payload.indexes).map(Number);
    const note = String(job.payload.note ?? "").trim();
    // 검수 지적 수정 또는 사용자가 직접 적은 '수정 요청사항'
    const issues = note
      ? [{ type: "user", severity: "high", quote: "", comment: `사용자 수정 요청: ${note}`, suggestion: "" }]
      : (review?.issues ?? []).filter((_, i) => indexes.includes(i));
    if (!doc?.content_html || !issues.length) throw new Error("고칠 지적 사항이나 본문이 없습니다.");
    const { system, prompt } = fixPrompt(blog, { title: doc.title || project.title, html: doc.content_html, issues });
    const res = await runStep({ step: "writing", role: "writer", purpose: "fix", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000, template: () => JSON.stringify({ html: doc.content_html, changes: [] }) });
    const raw = extractJson<{ html?: string; changes?: string[] }>(res.text);
    const html = sanitizeHtml(String(raw.html ?? ""));
    if (!html) throw new AiError("AI가 고친 본문을 돌려주지 않았습니다.", true);
    // 사용자가 직접 요청한 수정이므로 바로 적용 (이전 글은 버전 기록에 남음)
    await writeAiDraft(project.id, html, { provider: res.provider, model: res.model, label: note ? "수정 요청사항 반영" : `⑥ 지적 ${issues.length}건 AI 수정`, force: true });
    const changes = arr(raw.changes).map(String).slice(0, 20);
    if (note) {
      await updateProject(project.id, { status: project.stage === "published" ? "done" : "waiting", status_message: "", needs_rereview: !!review, package: { ...((project.package as unknown as PostExtras) ?? { hashtags: [], images: [] }), lastEdit: { at: new Date().toISOString(), note, changes } } });
      await addEvent(project.id, "ai", `수정 요청사항 반영 (${res.provider}/${res.model}): ${note}${changes.length ? ` · ${changes.join(" / ")}` : ""}`);
      return;
    }
    const next = { ...review!, issues: review!.issues.map((it, i) => (indexes.includes(i) ? { ...it, fixed: true } : it)), lastFix: { at: new Date().toISOString(), changes, provider: res.provider, model: res.model } };
    await updateProject(project.id, { review: next, status: project.stage === "published" ? "done" : "waiting", status_message: "", needs_rereview: true });
    await addEvent(project.id, "ai", `⑥ 지적 ${issues.length}건 AI 수정 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""})${changes.length ? ` · ${changes.join(" / ")}` : ""}`);
  },

  // ③ SEO 제목 후보 추천 → 사용자가 고르고 '글 쓰기'를 누를 때까지 대기
  async titles(job) {
    const { project, blog } = await load(job);
    const keywords = postKeywords(project.topic || project.title);
    const keyword = keywords[0] ?? project.title;
    let related: { keyword: string; total: number }[] = [];
    if (naverAdConnected()) {
      try {
        const r = await keywordStats(keywords.slice(0, 5), { withRelated: true });
        const mains = keywords.map((k) => r.stats[k]).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ keyword: s.keyword, total: s.total }));
        related = [...mains, ...r.related.slice(0, 12).map((x) => ({ keyword: x.keyword, total: x.total }))];
      } catch {
        /* 검색량은 선택 데이터 */
      }
    }
    const { system, prompt } = titlesPrompt(blog, keywords, related, await writtenTitles(blog, project.id));
    const res = await runStep({
      step: "titles", role: "planner", purpose: "titles", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 6000,
      template: () => JSON.stringify({ candidates: [{ title: `${keyword} 총정리`, reason: "템플릿" }, { title: `${keyword} 알아보기`, reason: "템플릿" }], best: 0, bestReason: "⚠ AI 미연결: 템플릿 제목", subKeywords: [] }),
    });
    const raw = extractJson<{ candidates?: { title?: string; reason?: string }[]; best?: number; bestReason?: string; subKeywords?: string[] }>(res.text);
    const candidates = arr(raw.candidates).map((c: { title?: string; reason?: string }) => ({ title: String(c?.title ?? "").trim(), reason: String(c?.reason ?? "") })).filter((c) => c.title);
    if (!candidates.length) throw new AiError("AI가 제목 후보를 돌려주지 않았습니다.", true);
    const best = Math.min(Math.max(0, Number(raw.best) || 0), candidates.length - 1);
    const plan: PostPlan = {
      keyword,
      candidates,
      best,
      selectedTitle: candidates[best].title,
      bestReason: String(raw.bestReason ?? ""),
      subKeywords: Array.from(new Set([...keywords.slice(1), ...arr(raw.subKeywords).map(String)])).slice(0, 8),
      related,
      ai: { provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null },
    };
    await updateProject(project.id, { plan, title: plan.selectedTitle, stage: "titles", status: "waiting", status_message: "" });
    await addEvent(project.id, "ai", `③ 제목 후보 ${candidates.length}개 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""}) · 제목을 고르고 '글 쓰기'를 눌러 주세요`);
  },

  // ④ 글 작성 (해시태그·이미지 프롬프트 포함)
  async write(job) {
    const { project, blog } = await load(job);
    const plan = project.plan as unknown as PostPlan | null;
    if (!plan) throw new Error("제목이 아직 없습니다.");
    const feedback = job.payload.feedback as string | undefined;
    const doc = await getDocument(project.id);
    const myPosts = await recentPosts(blog);
    const { system, prompt } = writePrompt(blog, { title: plan.selectedTitle, keyword: plan.keyword, subKeywords: plan.subKeywords, feedback, previousHtml: feedback ? doc?.content_html : undefined, myPosts, titleByUser: !plan.candidates.some((c) => c.title.trim() === plan.selectedTitle.trim()) });
    const res = await runStep({
      step: "writing", role: "writer", purpose: "write", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000,
      template: () => JSON.stringify({ html: `<p><strong>⚠ AI 미연결: 템플릿 원고입니다.</strong></p><h2>${esc(plan.keyword)}</h2><p>[작성 필요]</p><p>[이미지 1]</p><h2>정리</h2><p>[작성 필요]</p>`, hashtags: [plan.keyword.replace(/\s+/g, "")], images: [{ prompt: plan.keyword, alt: plan.keyword, aspect: "4:3" }] }),
    });
    type RawImage = { prompt?: string; alt?: string; aspect?: string; product?: string; pageUrl?: string; credit?: string };
    const raw = extractJson<{ html?: string; hashtags?: string[]; images?: RawImage[] }>(res.text);
    const official = blog.image_source === "official";
    const html = sanitizeHtml(String(raw.html ?? ""));
    if (!html) throw new AiError("AI가 본문을 돌려주지 않았습니다.", true);
    const prevExtras = (project.package as unknown as PostExtras | null) ?? null;
    const extras: PostExtras = {
      hashtags: Array.from(new Set(arr(raw.hashtags).map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))).slice(0, 20),
      images: arr(raw.images)
        .map((im: RawImage) => {
          const base = { prompt: String(im?.prompt ?? ""), alt: String(im?.alt ?? ""), aspect: ["1:1", "4:3", "3:4", "2:3", "3:2", "16:9", "9:16"].includes(String(im?.aspect)) ? String(im?.aspect) : "4:3" };
          if (!official) return base;
          const pageUrl = /^https?:\/\//.test(String(im?.pageUrl ?? "")) ? String(im.pageUrl) : "";
          return { ...base, kind: "official" as const, product: String(im?.product ?? ""), pageUrl, credit: String(im?.credit ?? "") };
        })
        .filter((i) => (official ? i.alt || ("product" in i && i.product) : i.prompt))
        .slice(0, 4),
      writer: { provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null },
      publishedUrl: prevExtras?.publishedUrl ?? null,
      publishedAt: prevExtras?.publishedAt ?? null,
    };
    const { applied } = await writeAiDraft(project.id, html, { provider: res.provider, model: res.model, label: feedback ? "수정 요청 반영" : "④ AI 원고" });
    await updateProject(project.id, { package: extras, stage: "reviewing", status: "running", status_message: "" });
    await addEvent(project.id, "ai", `④ 글 작성 완료 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""})${applied ? "" : " · 직접 고친 원고 보호: AI 원고는 제안으로 보관"}`);
    await enqueue("review", { projectId: project.id });
  },

  // ⑥ 글·이미지 검수
  async review(job) {
    const { project, blog } = await load(job);
    const plan = project.plan as unknown as PostPlan | null;
    const extras = (project.package as unknown as PostExtras | null) ?? { hashtags: [], images: [] };
    const doc = await getDocument(project.id);
    const html = doc?.content_html ?? "";
    if (!html.trim()) throw new Error("검수할 글이 없습니다.");
    const startRevision = doc?.revision ?? 0;
    const images = extras.images ?? [];
    const { system, prompt } = postReviewPrompt(blog, { title: doc?.title || plan?.selectedTitle || project.title, keyword: plan?.keyword ?? project.topic, html, hashtags: extras.hashtags ?? [], images });
    const res = await runStep({
      step: "review", role: "reviewer", purpose: "review", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000,
      images: images.map((i) => i.url).filter((u): u is string => !!u),
      template: () => JSON.stringify(reviewTemplate(blog, html)),
    });
    const raw = extractJson<Partial<ReviewResult> & { imageChecks?: { index: number; ok: boolean; note: string }[] }>(res.text);
    const result = {
      summary: String(raw.summary ?? ""),
      score: typeof raw.score === "number" ? raw.score : null,
      issues: arr(raw.issues),
      factChecks: arr(raw.factChecks),
      ruleChecks: arr(raw.ruleChecks),
      imageChecks: arr(raw.imageChecks),
      provider: res.provider,
      model: res.model,
      substitutedFor: res.substitutedFor ?? null,
      reviewedAt: new Date().toISOString(),
      imagesSeen: images.filter((i) => i.url).length,
    };
    await q("INSERT INTO reviews (id, project_id, version_id, provider, model, result) VALUES ($1,$2,NULL,$3,$4,$5)", [newId("rev_"), project.id, res.provider, res.model, j(result)]);
    // 검수하는 동안 사용자가 글을 고쳤으면 '다시 검수 권장' 유지
    const editedDuring = ((await getDocument(project.id))?.revision ?? 0) !== startRevision;
    await updateProject(project.id, { review: result, stage: project.stage === "published" ? "published" : "ready", status: project.stage === "published" ? "done" : "waiting", status_message: "", needs_rereview: editedDuring });
    await addEvent(project.id, "review", `⑥ 검수 완료 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""}) · 지적 ${result.issues.length}건`);
  },
};
