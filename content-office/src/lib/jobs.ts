import "server-only";
import { q, q1, newId, j } from "./db";
import type { Blog, Job, Plan, Project, ReviewResult, RoleAssignment } from "./types";
import { addEvent, createVersion, getBlog, getBlogForAi, getDocument, getProject, getVersion, updateProject, writeAiDraft } from "./repo";
import { runAI, extractJson, sanitizeHtml } from "./ai/run";
import { AiError } from "./ai/providers";
import {
  draftPrompt,
  draftTemplate,
  ideasPrompt,
  planPrompt,
  planTemplate,
  revisePrompt,
  reviewPrompt,
  reviewTemplate,
} from "./ai/prompts";
import { buildPackage } from "./exporter";
import { stageDef } from "./stages";

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
    [id, opts.projectId ?? null, opts.blogId ?? null, type, j(opts.payload ?? {}), opts.maxAttempts ?? 3],
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
  try {
    await HANDLERS[job.type]?.(job);
    await q("UPDATE jobs SET status='succeeded', finished_at=NOW(), error=NULL WHERE id=$1", [job.id]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retryable = e instanceof AiError ? e.retryable : false;
    if (retryable && job.attempts < job.max_attempts) {
      const delay = 5 * 2 ** (job.attempts - 1);
      await q(
        `UPDATE jobs SET status='queued', error=$2, run_after=NOW() + ($3 || ' seconds')::interval WHERE id=$1`,
        [job.id, msg, String(delay)],
      );
      if (job.project_id) {
        await updateProject(job.project_id, { status_message: `오류로 ${delay}초 후 재시도 (${job.attempts}/${job.max_attempts}): ${msg}` });
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
  return (
    { plan: "기획안 작성", draft: "원고 작성", review: "AI 교차 검수", package: "발행 패키지 생성", suggest_ideas: "AI 글감 추천" } as Record<string, string>
  )[type] ?? type;
}

async function load(job: Job): Promise<{ project: Project; blog: Blog }> {
  const project = await getProject(job.project_id!);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const blog = await getBlogForAi(project.blog_id);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  return { project, blog };
}

function override(job: Job): RoleAssignment | null {
  return (job.payload.override as RoleAssignment | undefined) ?? null;
}

const HANDLERS: Record<string, (job: Job) => Promise<void>> = {
  // 기획안 작성
  async plan(job) {
    const { project, blog } = await load(job);
    const feedback = job.payload.feedback as string | undefined;
    const { system, prompt } = planPrompt(blog, project, feedback, project.plan);
    const res = await runAI({
      purpose: "plan",
      role: "planner",
      blog,
      projectId: project.id,
      jobId: job.id,
      system,
      prompt,
      json: true,
      template: () => JSON.stringify(planTemplate(blog, project)),
      override: override(job),
    });
    const raw = extractJson<Partial<Plan>>(res.text);
    const plan = normalizePlan(raw, project);
    const ver = await createVersion({
      projectId: project.id,
      kind: "plan",
      title: plan.selectedTitle,
      content: JSON.stringify(plan),
      source: res.fallback ? "template" : "ai",
      label: feedback ? "수정 요청 반영" : "AI 기획안",
      provider: res.provider,
      model: res.model,
    });
    await updateProject(project.id, {
      plan,
      stage: "plan_approval",
      status: "waiting",
      status_message: res.fallback ? "AI 미연결: 템플릿 기획안이 생성되었습니다." : "",
    });
    await addEvent(project.id, "ai", `기획안 v${ver.number} 작성 완료 (${res.provider}/${res.model})`);
  },

  // 원고 작성 또는 수정 요청 반영
  async draft(job) {
    const { project, blog } = await load(job);
    if (!project.plan) throw new Error("승인된 기획안이 없습니다.");
    const feedback = job.payload.feedback as string | undefined;
    const doc = await getDocument(project.id);
    const revise = !!feedback && !!doc?.content_html;
    const { system, prompt } = revise
      ? revisePrompt(blog, project.plan, doc!.content_html, feedback!, project.review)
      : draftPrompt(blog, project, project.plan);
    const res = await runAI({
      purpose: revise ? "revise" : "draft",
      role: "writer",
      blog,
      projectId: project.id,
      jobId: job.id,
      system,
      prompt,
      maxTokens: 12000,
      template: () => (revise ? doc!.content_html : draftTemplate(blog, project.plan!)),
      override: override(job),
    });
    const html = sanitizeHtml(res.text);
    const { version, applied } = await writeAiDraft(project.id, html, {
      provider: res.provider,
      model: res.model,
      label: revise ? "수정 요청 반영" : res.fallback ? "템플릿 원고" : "AI 원고",
    });
    await addEvent(
      project.id,
      "ai",
      `원고 v${version.number} 작성 완료 (${res.provider}/${res.model})${applied ? "" : " · 사용자 수정 보호로 제안 보관"}`,
    );
    await updateProject(project.id, { stage: "reviewing", status: "running", status_message: "" });
    await enqueue("review", { projectId: project.id, payload: { versionId: version.id, advance: true } });
  },

  // AI 교차 검수
  async review(job) {
    const { project, blog } = await load(job);
    const versionId = job.payload.versionId as string | undefined;
    const ver = versionId ? await getVersion(versionId) : null;
    const doc = await getDocument(project.id);
    const html = ver?.content ?? doc?.content_html ?? "";
    if (!html.trim()) throw new Error("검수할 원고가 없습니다.");
    const { system, prompt } = reviewPrompt(blog, project, project.plan, html);
    const res = await runAI({
      purpose: "review",
      role: "reviewer",
      blog,
      projectId: project.id,
      jobId: job.id,
      system,
      prompt,
      json: true,
      template: () => JSON.stringify(reviewTemplate(blog, html)),
      override: override(job),
    });
    const raw = extractJson<Partial<ReviewResult>>(res.text);
    const result: ReviewResult = {
      summary: String(raw.summary ?? ""),
      score: typeof raw.score === "number" ? raw.score : null,
      issues: Array.isArray(raw.issues) ? raw.issues : [],
      factChecks: Array.isArray(raw.factChecks) ? raw.factChecks : [],
      ruleChecks: Array.isArray(raw.ruleChecks) ? raw.ruleChecks : [],
      provider: res.provider,
      model: res.model,
      reviewedAt: new Date().toISOString(),
    };
    await q("INSERT INTO reviews (id, project_id, version_id, provider, model, result) VALUES ($1,$2,$3,$4,$5,$6)", [
      newId("rev_"),
      project.id,
      ver?.id ?? null,
      res.provider,
      res.model,
      j(result),
    ]);
    const patch: Partial<Record<keyof Project, unknown>> = { review: result, status: "waiting", status_message: "" };
    if (project.stage === "reviewing") patch.stage = "draft_approval";
    // 승인 이후 수정분을 재검수했다면 '재검수 필요' 해제 (최종 승인은 여전히 사용자 몫)
    if (project.needs_rereview && !ver) patch.needs_rereview = false;
    await updateProject(project.id, patch);
    await addEvent(project.id, "review", `AI 교차 검수 완료 (${res.provider}/${res.model}) · 이슈 ${result.issues.length}건`);
  },

  // 발행 패키지
  async package(job) {
    const { project, blog } = await load(job);
    const doc = await getDocument(project.id);
    const ver = await createVersion({
      projectId: project.id,
      kind: "draft",
      title: doc?.title ?? project.title,
      content: doc?.content_html ?? "",
      source: "user",
      label: "발행 패키지 기준본",
    });
    const pkg = buildPackage(blog, project, doc, ver.id);
    await updateProject(project.id, { package: pkg, stage: "carousel", status: "waiting", status_message: "" });
    await addEvent(project.id, "package", "발행 패키지 생성 완료");
  },

  // AI 글감 추천 (검색량 등 지표 없이 제목·키워드·이유만)
  async suggest_ideas(job) {
    const blog = await getBlog(job.blog_id!);
    if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
    const existing = await q<{ title: string }>("SELECT title FROM ideas WHERE blog_id=$1", [blog.id]);
    const { creatorTrendContext } = await import("./creator");
    const { system, prompt } = ideasPrompt(blog, existing.map((e) => e.title), String(job.payload.hint ?? ""), await creatorTrendContext(blog.id));
    const res = await runAI({
      purpose: "ideas",
      role: "ideas",
      blog,
      jobId: job.id,
      system,
      prompt,
      json: true,
      template: () => {
        throw new AiError("AI 글감 추천은 AI 연결이 필요합니다. (템플릿 모드에서는 글감을 만들어내지 않습니다)", false);
      },
    });
    const data = extractJson<{ ideas?: { title: string; keywords?: string[]; reason?: string }[] }>(res.text);
    for (const idea of data.ideas ?? []) {
      if (!idea.title) continue;
      await q(
        `INSERT INTO ideas (id, blog_id, title, memo, keywords, origin, origin_detail) VALUES ($1,$2,$3,$4,$5,'ai',$6)`,
        [newId("idea_"), blog.id, idea.title, idea.reason ?? "", j(idea.keywords ?? []), `${res.provider}/${res.model} 제안 · 검색량 데이터 없음`],
      );
    }
  },
};

function normalizePlan(raw: Partial<Plan>, project: Project): Plan {
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const titles = arr<string>(raw.titleCandidates).map(String);
  return {
    titleCandidates: titles.length ? titles : [project.title],
    selectedTitle: String(raw.selectedTitle || titles[0] || project.title),
    mainKeyword: String(raw.mainKeyword ?? ""),
    subKeywords: arr<string>(raw.subKeywords).map(String),
    searchIntent: String(raw.searchIntent ?? ""),
    targetReader: String(raw.targetReader ?? ""),
    direction: String(raw.direction ?? ""),
    outline: arr<{ heading: string; points: string[] }>(raw.outline).map((o) => ({
      heading: String(o?.heading ?? ""),
      points: arr<string>(o?.points).map(String),
    })),
    // 사용자가 제공한 출처의 URL만 유지 (AI가 만든 URL 차단)
    sources: arr<{ title: string; url: string; note: string }>(raw.sources).filter((s) =>
      project.sources.some((ps) => ps.url === s?.url),
    ),
    imagePlan: arr<{ position: string; description: string }>(raw.imagePlan).map((i) => ({
      position: String(i?.position ?? ""),
      description: String(i?.description ?? ""),
    })),
    notes: String(raw.notes ?? ""),
  };
}

export { stageDef };
