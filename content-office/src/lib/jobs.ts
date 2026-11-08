import {cleanTitleCandidate,forbiddenInTitle} from "./title-rules";
import { htmlForAi, shrinkHtml } from "./ai/html-for-ai";
import "server-only";
import { q, q1, newId, j } from "./db";
import type { Blog, Job, Project, ReviewResult } from "./types";
import { addEvent, getBlogForAi, getDocument, getProject, updateProject, writeAiDraft } from "./repo";
import { extractJson, runStep, sanitizeHtml } from "./ai/run";
import { AiError } from "./ai/providers";
import { reviewTemplate } from "./ai/prompts";
import { fixPrompt, hashtagsPrompt, outlinePrompt, postReviewPrompt, titlesPrompt, writePrompt } from "./ai/step-prompts";
import { keywordStats, naverAdConnected } from "./searchad";
import type { PostExtras, PostPlan } from "./posts-types";
import { recentPosts, writtenTitles } from "./blog-posts";
import { collectVisits } from "./visits";

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
  opts: { projectId?: string | null; blogId?: string | null; payload?: Record<string, unknown>; maxAttempts?: number; runAfter?: Date },
): Promise<string> {
  const id = newId("job_");
  await q(
    `INSERT INTO jobs (id, project_id, blog_id, type, payload, max_attempts, run_after) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))`,
    [id, opts.projectId ?? null, opts.blogId ?? null, type, j(opts.payload ?? {}), opts.maxAttempts ?? 6, opts.runAfter ? opts.runAfter.toISOString() : null],
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
  // 맥 앱과 Render 서버가 같은 DB를 쓰므로, 다른 서버가 지금 하고 있는 작업은 건드리지 않음
  // (30분 넘게 '진행 중'으로 멈춘 작업만 다시 대기열로)
  const recover = () =>
    q(`UPDATE jobs SET status='queued', error=COALESCE(error,'') || ' (오래 멈춰 재시도)' WHERE status='running' AND started_at < NOW() - interval '30 minutes'`).catch(() => {});
  void recover();
  setInterval(() => void recover(), 5 * 60 * 1000).unref?.();
  w.timer = setInterval(() => void tick(), TICK_MS);
  w.timer.unref?.();
  // 블로그 방문자 수: 시작 30초 뒤 한 번, 이후 1시간마다 (맥이 켜져 있는 동안)
  setTimeout(() => void collectVisits().catch(() => {}), 30_000).unref?.();
  setInterval(() => void collectVisits().catch(() => {}), 10 * 60 * 1000).unref?.();
  // 🔁 루틴: 오늘 실행 만들기 · 마감 처리 · 알림 발송 · 텔레그램 버튼 (1분마다, 브라우저를 닫아도)
  const rt = () => void import("./routines").then((m) => m.routineTick()).catch(() => {});
  setTimeout(rt, 15_000).unref?.();
  setInterval(rt, 60_000).unref?.();
  // 🗑 휴지통 30일 지난 것 자동 완전 삭제 (1시간마다)
  const tp = () => void import("./trash").then((m) => m.purgeExpired()).catch(() => {});
  setTimeout(tp, 90_000).unref?.();
  setInterval(tp, 60 * 60 * 1000).unref?.();
  // 영상 받기 도구: 켜질 때 한 번, 이후 하루마다 확인(실제 업데이트는 일주일에 한 번)
  const yt = () => void import("./videos").then((v) => v.updateYtdlp()).catch(() => {});
  setTimeout(yt, 60_000).unref?.();
  setInterval(yt, 24 * 60 * 60 * 1000).unref?.();
}

/** 영상 작업(다운로드·인코딩): 맥이 켜져 있으면 맥이 먼저 맡음 (Render 무료 서버는 CPU가 아주 약함) */
export const VIDEO_JOBS = ["video_fetch", "video_edit", "studio_plan", "studio_character", "studio_scene", "studio_render"];
const ON_RENDER = !!process.env.RENDER;
export const MAC_ONLY_JOBS = ["reel_analyze", "reel_render", "reel_study", "edit_render", "edit_captions", "edit_reverse", "edit_fx", "edit_tts", "doc_convert"];
const hb = globalThis as unknown as { __macAlive?: { at: number; alive: boolean }; __macBeat?: number };
/** 맥이 켜져 있고, 영상을 같은 저장소(Supabase)에 넣을 수 있을 때만 맥에 영상 작업을 맡김 */
async function macAlive() {
  if (!ON_RENDER) return true;
  if (hb.__macAlive && Date.now() - hb.__macAlive.at < 30_000) return hb.__macAlive.alive;
  const r = await q1<{ value: { at?: string; storage?: string } }>("SELECT value FROM settings WHERE key='worker_mac'").catch(() => null);
  const { storageKind } = await import("./video-store");
  const alive = !!r?.value?.at && Date.now() - new Date(r.value.at).getTime() < 90_000 && (r.value.storage ?? "db") === storageKind();
  hb.__macAlive = { at: Date.now(), alive };
  return alive;
}
async function macHeartbeat() {
  if (ON_RENDER || (hb.__macBeat && Date.now() - hb.__macBeat < 30_000)) return;
  hb.__macBeat = Date.now();
  const { storageKind } = await import("./video-store");
  await q(`INSERT INTO settings (key, value) VALUES ('worker_mac', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j({ at: new Date().toISOString(), storage: storageKind() })]).catch(() => {});
}

/** Render 쪽 저장소 종류를 기록 → 맥은 저장소가 다르면 영상 작업을 가져가지 않음 */
async function renderStorageBeat() {
  if (!ON_RENDER || (hb.__macBeat && Date.now() - hb.__macBeat < 60_000)) return;
  hb.__macBeat = Date.now();
  const { storageKind } = await import("./video-store");
  await q(`INSERT INTO settings (key, value) VALUES ('worker_render', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j({ at: new Date().toISOString(), storage: storageKind(), url: process.env.RENDER_EXTERNAL_URL ?? null })]).catch(() => {});
}
const hr = globalThis as unknown as { __renderStorage?: { at: number; storage: string | null } };
async function renderStorage() {
  // 모를 때(null)는 기억하지 않고 매번 다시 확인 (재시작 직후 놓치지 않게)
  if (hr.__renderStorage?.storage && Date.now() - hr.__renderStorage.at < 60_000) return hr.__renderStorage.storage;
  const r = await q1<{ value: { storage?: string } }>("SELECT value FROM settings WHERE key='worker_render'").catch(() => null);
  hr.__renderStorage = { at: Date.now(), storage: r?.value?.storage ?? null };
  return hr.__renderStorage.storage;
}

async function tick() {
  const w = g.__worker!;
  void macHeartbeat();
  void renderStorageBeat();
  // 이 서버가 처리할 수 있는 작업만 가져감 (버전이 다른 서버가 모르는 작업을 '완료'로 처리하는 일 방지)
  let known = Object.keys(HANDLERS);
  // 맥 전용 작업(받아쓰기·Remotion 내보내기)은 Render가 절대 가져가지 않음 → 맥이 켜지면 처리
  if (ON_RENDER) known = known.filter((t) => !MAC_ONLY_JOBS.includes(t));
  // 맥에 저장소 키가 없는데 Render는 Supabase를 쓰면, 영상 작업은 Render에 맡김 (영상이 다른 곳에 저장되지 않게)
  if (!ON_RENDER) {
    const { storageKind } = await import("./video-store");
    if (storageKind() === "db" && (await renderStorage()) === "supabase") known = known.filter((t) => !VIDEO_JOBS.includes(t));
  }
  const deferVideo = ON_RENDER && (await macAlive());
  while (w.running < CONCURRENCY) {
    let job: Job | null = null;
    try {
      job = await q1<Job>(
        `UPDATE jobs SET status='running', attempts=attempts+1, started_at=NOW()
         WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= NOW() AND type = ANY($1)
                       AND (NOT $2 OR type <> ALL($3) OR created_at < NOW() - interval '3 minutes')
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [known, deferVideo, VIDEO_JOBS],
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
  return ({ titles: "③ SEO 제목 추천", outline: "③-2 기획안", write: "④ 글 작성", review: "⑥ 검수", fix: "⑥ 지적 사항 AI 수정" } as Record<string, string>)[type] ?? type;
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
  async radar_collect(){/* 이전 버전의 대기 작업: 수집하지 않고 종료 */},
  async radar_learn(){/* 이전 버전의 대기 작업: AI 호출 없이 종료 */},
  // 🔔 할 일 텔레그램 알림 (예약 시각에 실행, 중복 발송 방지)
  async todo_notify(job) {
    const { sendTodoNotification } = await import("./todos");
    await sendTodoNotification(String(job.payload.notificationId));
  },
  // 🩺 블로그 진단 (화면을 떠나도 서버에서 계속)
  async diagnose(job) {
    const { diagnoseBlog, setDiagnoseState } = await import("./diagnose");
    const blogId = String(job.payload.blogId);
    try {
      await diagnoseBlog(blogId);
      await setDiagnoseState(blogId, null);
    } catch (e) {
      await setDiagnoseState(blogId, { status: "error", error: (e as Error).message, at: new Date().toISOString() });
    }
  },
  // 🎬 영상 스튜디오: 장면 합치기
  async studio_render(job) {
    const { runStudioRender } = await import("./studio");
    await runStudioRender(String(job.payload.studioId));
  },
  // 🎬 영상공장: 링크에서 받기 · 편집본 만들기
  async video_fetch(job) {
    const { runVideoFetch } = await import("./videos");
    await runVideoFetch(String(job.payload.videoId), job.payload.removeSubs !== false);
  },
  // ✂️ 릴스 편집기 (맥 전용: 받아쓰기·Remotion)
  async reel_analyze(job) {
    const { runReelAnalyze } = await import("./reels");
    await runReelAnalyze(String(job.payload.reelId));
  },
  // 📺 시리즈: 한 화 → 영상 스튜디오 기획 (밤에 걸어두기)
  async series_episode(job) {
    const { runSeriesEpisode } = await import("./series");
    await runSeriesEpisode(String(job.payload.seriesId), Number(job.payload.n));
  },
  // 🎞 영상 편집 (맥 전용)
  async edit_render(job) {
    const { runEditRender } = await import("./edit");
    await runEditRender(String(job.payload.editId), String(job.payload.resolution ?? "1080p"));
  },
  async edit_captions(job) {
    const { runCaptions } = await import("./edit");
    await runCaptions(String(job.payload.editId));
  },
  // 📄 문서 → 마크다운 (맥 전용)
  async doc_convert(job) {
    const { runConversion } = await import("./convert");
    await runConversion(String(job.payload.id));
  },
  async edit_fx(job) {
    const { runClipFx } = await import("./edit");
    await runClipFx(String(job.payload.editId), String(job.payload.itemId), job.payload.fx as import("./edit").FxKind);
  },
  async edit_tts(job) {
    const { runTts } = await import("./edit");
    const p = job.payload as { editId: string; text: string; voice: string; rate: number; start: number; captions: boolean };
    await runTts(p.editId, p);
  },
  async edit_reverse(job) {
    const { runReverse } = await import("./edit");
    await runReverse(String(job.payload.editId), String(job.payload.clipId));
  },
  async reel_study(job) {
    const { runReelStudy } = await import("./reel-study");
    await runReelStudy(String(job.payload.studyId));
  },
  async reel_render(job) {
    const { runReelRender } = await import("./reels");
    await runReelRender(String(job.payload.reelId));
  },
  async video_edit(job) {
    const { runVideoEdit } = await import("./videos");
    await runVideoEdit(String(job.payload.videoId), String(job.payload.parentId), (job.payload.opts ?? {}) as import("./videos").EditOptions);
  },

  // ⑥ 검수에서 고른 지적 사항을 AI가 반영 (본문 일부만 수정) → '다시 검수' 권장
  async fix(job) {
    const { project, blog } = await load(job);
    const review = project.review as unknown as (ReviewResult & { issues: { type: string; severity: string; quote: string; comment: string; suggestion: string; fixed?: boolean; userNote?: string }[] }) | null;
    const doc = await getDocument(project.id);
    const indexes = arr(job.payload.indexes).map(Number);
    const note = String(job.payload.note ?? "").trim();
    const general = note ? "" : String(job.payload.general ?? "").trim();
    // 검수 지적 수정 또는 사용자가 직접 적은 '수정 요청사항'
    const issues = note
      ? [{ type: "user", severity: "high", quote: "", comment: `사용자 수정 요청: ${note}`, suggestion: "" }]
      : (review?.issues ?? []).filter((_, i) => indexes.includes(i));
    if (!doc?.content_html || (!issues.length && !general)) throw new Error("고칠 지적 사항이나 본문이 없습니다.");
    // 직접 올린 사진(base64)은 짧은 표시로 보내고 돌아온 HTML 에서 되살림 (AI 한도 초과 방지)
    const shrunk = shrinkHtml(doc.content_html);
    const { system, prompt } = fixPrompt(blog, { title: doc.title || project.title, html: shrunk.html, issues, general });
    const res = await runStep({ step: "writing", role: "writer", purpose: "fix", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000, template: () => JSON.stringify({ html: doc.content_html, changes: [] }) });
    const raw = extractJson<{ html?: string; changes?: string[] }>(res.text);
    const html = sanitizeHtml(shrunk.restore(String(raw.html ?? "")));
    if (!html) throw new AiError("AI가 고친 본문을 돌려주지 않았습니다.", true);
    // 사용자가 직접 요청한 수정이므로 바로 적용 (이전 글은 버전 기록에 남음)
    await writeAiDraft(project.id, html, { provider: res.provider, model: res.model, label: note ? "수정 요청사항 반영" : `⑥ ${issues.length ? `지적 ${issues.length}건` : ""}${issues.length && general ? " + " : ""}${general ? "글 전체 수정사항" : ""} AI 수정`, force: true });
    const changes = arr(raw.changes).map(String).slice(0, 20);
    if (note) {
      await updateProject(project.id, { status: project.stage === "published" ? "done" : "waiting", status_message: "", needs_rereview: !!review, package: { ...((project.package as unknown as PostExtras) ?? { hashtags: [], images: [] }), lastEdit: { at: new Date().toISOString(), note, changes } } });
      await addEvent(project.id, "ai", `수정 요청사항 반영 (${res.provider}/${res.model}): ${note}${changes.length ? ` · ${changes.join(" / ")}` : ""}`);
      return;
    }
    const next = { ...review!, issues: review!.issues.map((it, i) => (indexes.includes(i) ? { ...it, fixed: true } : it)), generalNote: general ? "" : (review as unknown as { generalNote?: string })?.generalNote ?? "", lastFix: { at: new Date().toISOString(), changes, provider: res.provider, model: res.model, ...(general ? { general } : {}) } };
    await updateProject(project.id, { review: next, status: project.stage === "published" ? "done" : "waiting", status_message: "", needs_rereview: true });
    await addEvent(project.id, "ai", `⑥ ${issues.length ? `지적 ${issues.length}건` : ""}${general ? `${issues.length ? " + " : ""}글 전체 수정사항(${general})` : ""} AI 수정 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""})${changes.length ? ` · ${changes.join(" / ")}` : ""}`);
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
    const brief = (job.payload?.brief as PostPlan["brief"]) ?? (project.plan as unknown as PostPlan | null)?.brief;
    const { system, prompt } = titlesPrompt(blog, keywords, related, await writtenTitles(blog, project.id), brief);
    const res = await runStep({
      step: "titles", role: "planner", purpose: "titles", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 6000,
      template: () => JSON.stringify({ candidates: [{ title: `${keyword} 총정리`, reason: "템플릿" }, { title: `${keyword} 알아보기`, reason: "템플릿" }], best: 0, bestReason: "⚠ AI 미연결: 템플릿 제목", subKeywords: [] }),
    });
    const raw = extractJson<{ candidates?: { title?: string; reason?: string }[]; best?: number; bestReason?: string; subKeywords?: string[] }>(res.text);
    const candidates = arr(raw.candidates).map((c: { title?: string; reason?: string }) => ({ title: cleanTitleCandidate(String(c?.title ?? "").trim(),blog), reason: String(c?.reason ?? "") })).filter((c) => c.title);
    if (!candidates.length) throw new AiError("제목 규칙을 통과한 후보가 없어요. 금지 표현·규칙을 확인한 뒤 직접 다시 요청해 주세요. 자동 재호출하지 않아요.", false);
    const originalBest=arr(raw.candidates)[Math.max(0,Math.floor(Number(raw.best)||0))];
    const best = Math.max(0,candidates.findIndex(c=>c.title===cleanTitleCandidate(String(originalBest?.title??""),blog)));
    const plan: PostPlan = {
      ...(brief ? { brief } : {}),
      keyword,
      candidates,
      best,
      selectedTitle: candidates[best].title,
      bestReason: candidates[best].reason || String(raw.bestReason ?? ""),
      subKeywords: Array.from(new Set([...keywords.slice(1), ...arr(raw.subKeywords).map(String)])).slice(0, 8),
      related,
      ai: { provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null },
    };
    await updateProject(project.id, { plan, title: plan.selectedTitle, stage: "titles", status: "waiting", status_message: "" });
    await addEvent(project.id, "ai", `③ 제목 후보 ${candidates.length}개 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""}) · 제목을 고르고 '글 쓰기'를 눌러 주세요`);
  },

  // ③-2 기획안: 목차·핵심 주장·근거·이미지 계획 → 사용자가 승인할 때까지 대기
  async outline(job) {
    const { project, blog } = await load(job);
    const plan = project.plan as unknown as PostPlan | null;
    if (!plan) throw new Error("제목이 아직 없습니다.");
    const { system, prompt } = outlinePrompt(blog, { title: plan.selectedTitle, keyword: plan.keyword, subKeywords: plan.subKeywords, brief: plan.brief });
    const res = await runStep({ step: "titles", role: "planner", purpose: "outline", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 3000 });
    const raw = extractJson<{ sections?: { heading?: string; points?: string[] }[]; claims?: { claim?: string; evidence?: string; source?: string; check?: boolean }[]; images?: { n?: number; what?: string }[] }>(res.text);
    const outline = {
      sections: arr(raw.sections).map((s: { heading?: string; points?: string[] }) => ({ heading: String(s.heading ?? "").slice(0, 120), points: arr(s.points).map(String).slice(0, 4) })).filter((s) => s.heading).slice(0, 8),
      claims: arr(raw.claims).map((c: { claim?: string; evidence?: string; source?: string; check?: boolean }) => ({ claim: String(c.claim ?? "").slice(0, 200), evidence: String(c.evidence ?? "").slice(0, 200), source: String(c.source ?? "").slice(0, 200), check: !!c.check })).filter((c) => c.claim).slice(0, 8),
      images: arr(raw.images).map((m: { n?: number; what?: string }, i: number) => ({ n: Number(m.n) || i + 1, what: String(m.what ?? "").slice(0, 160) })).filter((m) => m.what).slice(0, 5),
      approved: false,
      ai: { provider: res.provider, model: res.model },
    };
    if (!outline.sections.length) throw new AiError("AI가 기획안을 만들지 못했습니다.", true);
    await updateProject(project.id, { plan: { ...plan, outline }, stage: "titles", status: "waiting", status_message: "" });
    await addEvent(project.id, "ai", `③-2 기획안 (${res.provider}/${res.model}) · 목차·근거를 확인하고 승인해 주세요`);
  },

  // ④ 글 작성 (해시태그·이미지 프롬프트 포함)
  async write(job) {
    const { project, blog } = await load(job);
    const plan = project.plan as unknown as PostPlan | null;
    if (!plan) throw new Error("제목이 아직 없습니다.");
    const feedback = job.payload.feedback as string | undefined;
    const doc = await getDocument(project.id);
    const myPosts = await recentPosts(blog);
    const prevShrunk = shrinkHtml(feedback ? doc?.content_html ?? "" : "");
    const { system, prompt } = writePrompt(blog, { title: plan.selectedTitle, keyword: plan.keyword, subKeywords: plan.subKeywords, feedback, previousHtml: feedback ? prevShrunk.html : undefined, myPosts, titleByUser: !plan.candidates.some((c) => c.title.trim() === plan.selectedTitle.trim()), brief: plan.brief, outline: plan.outline });
    const res = await runStep({
      step: "writing", role: "writer", purpose: "write", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000,
      template: () => JSON.stringify({ html: `<p><strong>⚠ AI 미연결: 템플릿 원고입니다.</strong></p><h2>${esc(plan.keyword)}</h2><p>[작성 필요]</p><p>[이미지 1]</p><h2>정리</h2><p>[작성 필요]</p>`, hashtags: [plan.keyword.replace(/\s+/g, "")], images: [{ prompt: plan.keyword, alt: plan.keyword, aspect: "4:3" }] }),
    });
    type RawImage = { prompt?: string; alt?: string; aspect?: string; product?: string; pageUrl?: string; credit?: string };
    const raw = extractJson<{ html?: string; hashtags?: string[]; images?: RawImage[] }>(res.text);
    const official = blog.image_source === "official";
    const html = sanitizeHtml(prevShrunk.restore(String(raw.html ?? "")));
    if (!html) throw new AiError("AI가 본문을 돌려주지 않았습니다.", true);
    const prevExtras = (project.package as unknown as PostExtras | null) ?? null;
    // 해시태그는 글쓰기(유료)와 따로, 가벼운 무료 모델이 뽑음. 실패하면 키워드로 대신
    let tags: unknown[] = arr(raw.hashtags);
    try {
      const hp = hashtagsPrompt(blog, { title: plan.selectedTitle, keyword: plan.keyword, subKeywords: plan.subKeywords, html });
      const hr = await runStep({ step: "hashtags", role: "ideas", purpose: "hashtags", blog, projectId: project.id, jobId: job.id, system: hp.system, prompt: hp.prompt, json: true, maxTokens: 800, retries: 0 });
      const got = arr(extractJson<{ hashtags?: string[] }>(hr.text).hashtags);
      if (got.length) tags = got;
    } catch {
      /* 아래 키워드 대체 */
    }
    if (!tags.length) tags = [plan.keyword, ...plan.subKeywords];
    const extras: PostExtras = {
      hashtags: Array.from(new Set(tags.map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))).slice(0, 20),
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
    // 🎨 이미지 기획: 글 전체 컨셉 → 레시피 재료·순서 → 같은 컨셉으로 이미지마다 프롬프트 (실패하면 작가가 쓴 프롬프트 그대로)
    if (!official && extras.images.length) {
      try {
        await updateProject(project.id, { status_message: "이미지 컨셉·재료 정리 중" });
        const { planImages } = await import("./image-plan");
        const plan = await planImages(project.id, { html, images: extras.images });
        if (plan) {
          extras.images = plan.images;
          extras.imageConcept = plan.concept;
        }
      } catch {
        /* 이미지 기획 실패해도 글은 그대로 */
      }
    }
    const { applied } = await writeAiDraft(project.id, html, { provider: res.provider, model: res.model, label: feedback ? "수정 요청 반영" : "④ AI 원고" });
    // 검수는 자동으로 하지 않음: 사용자가 글·이미지를 읽고 고친 뒤 직접 '검수 시작'을 누름
    await updateProject(project.id, { package: extras, stage: "reviewing", status: "waiting", status_message: "글과 이미지를 확인·수정한 뒤 '검수 시작'을 눌러 주세요." });
    await addEvent(project.id, "ai", `④ 글 작성 완료 (${res.provider}/${res.model}${res.substitutedFor ? ` · ${res.substitutedFor} 대신` : ""})${applied ? "" : " · 직접 고친 원고 보호: AI 원고는 제안으로 보관"} · 검수는 직접 시작`);
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
    // 직접 올린 사진(base64)은 짧은 표시로 (640만 토큰 → 한도 초과 방지)
    const { system, prompt } = postReviewPrompt(blog, { title: doc?.title || plan?.selectedTitle || project.title, keyword: plan?.keyword ?? project.topic, html: htmlForAi(html), hashtags: extras.hashtags ?? [], images });
    const res = await runStep({
      step: "review", role: "reviewer", purpose: "review", blog, projectId: project.id, jobId: job.id, system, prompt, json: true, maxTokens: 12000,
      images: images.map((i) => i.url).filter((u): u is string => !!u && !u.startsWith("data:")),
      template: () => JSON.stringify(reviewTemplate(blog, html)),
    });
    const raw = extractJson<Partial<ReviewResult> & { imageChecks?: { index: number; ok: boolean; note: string }[] }>(res.text);
    const titleBans=forbiddenInTitle(doc?.title || plan?.selectedTitle || project.title,blog);
    const result = {
      summary: String(raw.summary ?? ""),
      score: typeof raw.score === "number" ? raw.score : null,
      issues: [...titleBans.map(term=>({type:"rule",severity:"medium",quote:term,comment:`제목에 저장된 금지 문자·표현 ${JSON.stringify(term)}이 포함되어 있어요.`,suggestion:"제목 규칙에 맞게 자연스러운 문장으로 고쳐 주세요."})),...arr(raw.issues)],
      factChecks: arr(raw.factChecks),
      ruleChecks: [...titleBans.map(term=>({rule:`제목 금지: ${term}`,passed:false,note:"앱에서 제목 포함 여부를 직접 확인했어요."})),...arr(raw.ruleChecks)],
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
