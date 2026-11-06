import "server-only";
import { q } from "./db";
import { placeholderNumbers, readiness, READY_LABEL } from "./readiness";
import { stageLabel, stageStep, STEP_NAMES } from "./steps";

/**
 * 📊 전체 작업 현황: 블로그 글·캐러셀·영상 스튜디오·영상공장을 공통 5단계로 모아 보기
 * plan 기획 → make 제작 중 → review 검토 → ready 발행 대기 → done 완료
 * - 캐러셀·영상은 '게시함'을 직접 눌러야 완료 (posted_at)
 */
export type WorkType = "blog" | "carousel" | "studio" | "video";
export type WorkCol = "plan" | "make" | "review" | "ready" | "done";
export type WorkItem = {
  key: string; type: WorkType; id: string; title: string; sub: string; color: string | null; blogId: string | null;
  col: WorkCol; steps: string[]; current: number; error: boolean; running: boolean; stuck: boolean;
  badge: string; note: string; href: string; updated_at: string; due: string | null; posted: boolean; postedAt: string | null;
};

export const WORK_COLS: { id: WorkCol; label: string }[] = [
  { id: "plan", label: "기획" },
  { id: "make", label: "제작 중" },
  { id: "review", label: "검토" },
  { id: "ready", label: "발행 대기" },
  { id: "done", label: "완료" },
];
export const WORK_TYPES: Record<WorkType, { label: string; icon: string }> = {
  blog: { label: "블로그", icon: "📝" },
  carousel: { label: "캐러셀", icon: "📱" },
  studio: { label: "영상 스튜디오", icon: "🎬" },
  video: { label: "영상공장", icon: "🎞" },
};

const STUCK_MS = 3 * 86400_000;
const DONE_DAYS = 30; // 완료는 최근 30일만

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export async function workItems(): Promise<WorkItem[]> {
  const out: WorkItem[] = [];
  const since = new Date(Date.now() - DONE_DAYS * 86400_000).toISOString();

  // 📝 블로그 글
  type P = { id: string; title: string; topic: string; stage: string; status: string; status_message: string; updated_at: string; needs_rereview: boolean; review: Parameters<typeof readiness>[0]["review"]; package: { images?: { url?: string | null; manual?: boolean }[]; publishedAt?: string } | null; plan: { outline?: { approved?: boolean } } | null; html: string | null; blog_id: string; blog_name: string; blog_color: string; publish_date: string | null };
  const posts = await q<P>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.status_message, p.updated_at, p.needs_rereview, p.review, p.package, p.plan, p.publish_date,
            d.content_html AS html, b.id AS blog_id, b.name AS blog_name, b.color AS blog_color
       FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id
      WHERE p.deleted_at IS NULL AND p.stage IN ('titles','writing','reviewing','ready','published')
        AND (p.stage <> 'published' OR p.updated_at >= $1) ORDER BY p.updated_at DESC LIMIT 300`,
    [since],
  );
  for (const p of posts) {
    const rd = readiness({ stage: p.stage, status: p.status, needsRereview: p.needs_rereview, review: p.review, images: p.package?.images ?? [], placeholders: placeholderNumbers(p.html ?? ""), outlinePending: !!p.plan?.outline && !p.plan.outline.approved });
    const col: WorkCol = p.stage === "published" ? "done" : p.stage === "titles" ? "plan" : p.stage === "writing" ? "make" : p.stage === "ready" && ["ready", "manual"].includes(rd.state) ? "ready" : "review";
    const notes = [p.status_message, rd.score != null ? `검수 ${rd.score}점 · 남은 지적 ${rd.openIssues}건` : "", ...rd.reasons].filter(Boolean);
    out.push({
      key: `blog:${p.id}`, type: "blog", id: p.id, title: p.title || p.topic, sub: p.blog_name, color: p.blog_color, blogId: p.blog_id,
      col, steps: STEP_NAMES, current: p.stage === "published" ? STEP_NAMES.length + 1 : stageStep(p.stage), error: p.status === "error", running: p.status === "running",
      stuck: false, badge: p.status === "error" ? "오류" : col === "review" || col === "ready" ? READY_LABEL[rd.state].label : stageLabel(p.stage, p.status),
      note: notes.join(" · "), href: `/posts/${p.id}`, updated_at: iso(p.updated_at), due: p.publish_date, posted: p.stage === "published", postedAt: null,
    });
  }

  // 📱 캐러셀
  const cars = await q<{ id: string; title: string; topic: string; slides: unknown[]; blog_id: string | null; blog_name: string | null; blog_color: string | null; posted_at: string | null; updated_at: string }>(
    `SELECT c.id, c.title, c.topic, c.slides, c.blog_id, b.name AS blog_name, b.color AS blog_color, c.posted_at, c.updated_at
       FROM carousels c LEFT JOIN blogs b ON b.id=c.blog_id WHERE c.posted_at IS NULL OR c.posted_at >= $1 ORDER BY c.updated_at DESC LIMIT 200`,
    [since],
  );
  const CAR_STEPS = ["주제", "문구·슬라이드", "확인·저장", "게시"];
  for (const c of cars) {
    const has = Array.isArray(c.slides) && c.slides.length > 0;
    const col: WorkCol = c.posted_at ? "done" : has ? "ready" : "make";
    out.push({
      key: `carousel:${c.id}`, type: "carousel", id: c.id, title: c.title || c.topic, sub: c.blog_name ?? "주제로 만든 캐러셀", color: c.blog_color, blogId: c.blog_id,
      col, steps: CAR_STEPS, current: c.posted_at ? 5 : has ? 3 : 2, error: false, running: false, stuck: false,
      badge: c.posted_at ? "게시함" : has ? "게시 대기" : "만드는 중", note: has ? `슬라이드 ${c.slides.length}장` : "", href: `/carousels/${c.id}`,
      updated_at: iso(c.updated_at), due: null, posted: !!c.posted_at, postedAt: c.posted_at ? iso(c.posted_at) : null,
    });
  }

  // 🎬 영상 스튜디오
  type S = { id: string; title: string; prompt: string; status: string; message: string; plan: { scenes?: unknown; title?: string } | null; character: { image?: { url?: string } } | null; scenes: { image?: { url?: string }; video?: { url?: string } }[]; video_id: string | null; posted_at: string | null; updated_at: string };
  const studios = await q<S>(`SELECT id, title, prompt, status, message, plan, character, scenes, video_id, posted_at, updated_at FROM studio_projects WHERE posted_at IS NULL OR posted_at >= $1 ORDER BY updated_at DESC LIMIT 100`, [since]);
  const ST_STEPS = ["기획", "캐릭터", "장면 이미지", "장면 영상", "합치기", "게시"];
  for (const s of studios) {
    const scenes = Array.isArray(s.scenes) ? s.scenes : [];
    const allImg = scenes.length > 0 && scenes.every((x) => x.image?.url);
    const allClip = scenes.length > 0 && scenes.every((x) => x.video?.url);
    const current = s.posted_at ? 7 : s.status === "done" ? 6 : s.status === "rendering" || allClip ? 5 : allImg ? 4 : s.character?.image?.url ? 3 : scenes.length ? 2 : 1;
    const col: WorkCol = s.posted_at ? "done" : s.status === "done" ? "ready" : current <= 1 ? "plan" : "make";
    out.push({
      key: `studio:${s.id}`, type: "studio", id: s.id, title: s.title || s.prompt.slice(0, 60), sub: "쇼츠·릴스", color: null, blogId: null,
      col, steps: ST_STEPS, current, error: s.status === "error", running: s.status === "rendering", stuck: false,
      badge: s.posted_at ? "게시함" : s.status === "error" ? "오류" : s.status === "done" ? "완성 · 게시 대기" : s.status === "rendering" ? "합치는 중" : ST_STEPS[current - 1],
      note: s.message, href: `/studio/${s.id}`, updated_at: iso(s.updated_at), due: null, posted: !!s.posted_at, postedAt: s.posted_at ? iso(s.posted_at) : null,
    });
  }

  // 🎞 영상공장 (스튜디오에서 만든 영상은 스튜디오 쪽에서 보여 줌)
  const vids = await q<{ id: string; title: string; kind: string; status: string; message: string; posted_at: string | null; updated_at: string }>(
    `SELECT id, title, kind, status, message, posted_at, updated_at FROM videos WHERE kind <> 'studio' AND (posted_at IS NULL OR posted_at >= $1) ORDER BY updated_at DESC LIMIT 200`,
    [since],
  );
  const V_STEPS = ["받기", "자막 지우기·편집", "확인", "게시"];
  for (const v of vids) {
    const col: WorkCol = v.posted_at ? "done" : v.status === "ready" ? "ready" : "make";
    out.push({
      key: `video:${v.id}`, type: "video", id: v.id, title: v.title, sub: v.kind === "edit" ? "편집본" : "받은 영상", color: null, blogId: null,
      col, steps: V_STEPS, current: v.posted_at ? 5 : v.status === "ready" ? 3 : v.status === "running" ? 2 : 1, error: v.status === "error", running: ["queued", "running"].includes(v.status), stuck: false,
      badge: v.posted_at ? "게시함" : v.status === "ready" ? "게시 대기" : v.status === "error" ? "오류" : "만드는 중",
      note: v.message, href: `/videos/${v.id}`, updated_at: iso(v.updated_at), due: null, posted: !!v.posted_at, postedAt: v.posted_at ? iso(v.posted_at) : null,
    });
  }

  const now = Date.now();
  for (const it of out) it.stuck = it.col !== "done" && !it.running && (it.error || now - new Date(it.updated_at).getTime() > STUCK_MS);
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

const POST_TABLE: Record<string, string> = { carousel: "carousels", studio: "studio_projects", video: "videos" };

/** 캐러셀·영상 '게시함' 직접 표시 / 취소 */
export async function setPosted(type: string, id: string, posted: boolean) {
  const t = POST_TABLE[type];
  if (!t) throw new Error("게시함 표시는 캐러셀·영상만 할 수 있어요.");
  const r = await q<{ posted_at: string | null }>(`UPDATE ${t} SET posted_at = ${posted ? "NOW()" : "NULL"} WHERE id=$1 RETURNING posted_at`, [id]);
  if (!r.length) throw new Error("찾을 수 없어요.");
  return { posted_at: r[0].posted_at };
}
