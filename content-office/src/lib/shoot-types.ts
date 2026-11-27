// 📹 현장 숏폼 (화면·서버 공용 정의): 촬영 종류 · 대본 형식 · 대본 → 릴스 편집 문서
import { DEFAULT_TEXT_STYLE, type ReelDoc, type ReelScene, type ReelText } from "@/remotion/types";

/** 촬영 종류: 올릴 때 고름 → 종류마다 대본 구성 규칙이 달라짐 */
export const SHOOT_KINDS = [
  { id: "food", label: "🍜 맛집", hint: "가게 이름 · 먹은 메뉴와 가격 · 위치 · 한 줄 느낌", rule: "첫 컷은 가장 먹음직스러운 음식 클로즈업(김·늘어남·자르는 순간). 이어서 가게 분위기 → 메뉴 → 먹는 장면 → 한 줄 평 순서. 가격·위치·메뉴 이름은 메모에 적힌 것만 쓴다." },
  { id: "cafe", label: "☕ 카페·디저트", hint: "카페 이름 · 시킨 메뉴와 가격 · 위치 · 분위기", rule: "첫 컷은 디저트·음료가 가장 예쁘게 보이는 순간. 이어서 공간 분위기 → 메뉴 → 디테일 → 추천 한마디. 가격·위치는 메모에 적힌 것만 쓴다." },
  { id: "product", label: "📦 제품 리뷰", hint: "제품 이름 · 가격 · 써 본 느낌 · 좋은 점과 아쉬운 점", rule: "첫 컷은 이 제품이 풀어 주는 불편한 상황이나 가장 놀라운 사용 장면. 이어서 제품 모습 → 써 보는 장면 → 좋은 점 → 아쉬운 점 한 가지 → 추천 대상. 사양·가격은 메모에 적힌 것만 쓴다." },
  { id: "vlog", label: "🚶 일상·브이로그", hint: "어디서 무엇을 했는지 · 남기고 싶은 느낌", rule: "첫 컷은 하루 중 가장 눈에 띄는 장면. 시간 순서를 지키되 비슷한 장면은 하나만. 자막은 설명보다 혼잣말처럼 짧게." },
  { id: "etc", label: "✍️ 기타", hint: "어떤 영상인지 · 꼭 들어가야 할 내용", rule: "메모에 적힌 의도에 맞춰 구성한다. 첫 컷은 가장 시선을 끄는 장면." },
] as const;
export type ShootKindId = (typeof SHOOT_KINDS)[number]["id"];
export const shootKind = (id?: string) => SHOOT_KINDS.find((k) => k.id === id) ?? SHOOT_KINDS[SHOOT_KINDS.length - 1];

export const SHOOT_LENGTHS = [15, 20, 30, 45] as const;
export const MAX_SHOOT_CLIPS = 12;
export const MAX_SHOOT_REFS = 3;
/** 올릴 수 있는 영상 확장자 (아이폰 .MOV·갤럭시 .mp4 등 — 사진 앱에서 끌어오면 종류 정보가 비어 올 때가 있어 이름으로도 확인) */
export const VIDEO_EXT = /\.(mp4|mov|m4v|qt|webm|mkv|avi|3gp|3g2|mts|m2ts|mpg|mpeg)$/i;
export const isVideoFile = (f: { name: string; type: string }) => /^video\//.test(f.type) || VIDEO_EXT.test(f.name);

export type ShootFrame = { t: number; img: string; desc?: string };
export type ShootClip = {
  videoId: string; name: string;
  duration?: number; width?: number; height?: number;
  transcript?: { start: number; end: number; text: string }[];
  frames?: ShootFrame[];
  summary?: string; // AI가 본 클립 한 줄 설명
  originalId?: string; // 얼굴 모자이크 전 원본 영상 (videoId 는 모자이크한 영상)
  faces?: number; // 가린 얼굴 구간 수 (0 = 얼굴 없음, 없으면 모자이크 안 함)
  quality?: string; // 흔들림·어두움 같은 문제 ('' = 문제 없음)
};

/** 대본의 컷 하나: 몇 번 클립의 몇 초~몇 초를 쓰고, 그 위에 어떤 자막을 얹을지 */
export type ShootCut = { clip: number; from: number; to: number; caption: string; note: string; speed?: number };
/** 컷 배속: 붓기·굽기·걷기처럼 긴 과정은 빠르게, 늘어나는 치즈 같은 순간은 느리게 */
export const SHOOT_SPEEDS = [0.5, 1, 1.5, 2, 3, 4] as const;
export const cutSpeed = (c: { speed?: number }) => ((SHOOT_SPEEDS as readonly number[]).includes(Number(c.speed)) ? Number(c.speed) : 1);
/** 화면에 나오는 길이 (원본 구간 ÷ 배속) */
export const cutSeconds = (c: ShootCut) => (c.to - c.from) / cutSpeed(c);
/** 참고 릴스의 글자 모양 (위치·색·상자·테두리·크기) */
export type TextLook = { pos: "top" | "middle" | "bottom"; color: string; box: string; stroke: string; size: "s" | "m" | "l" };
/** 참고 릴스를 뜯어본 결과: 컷 호흡 + 화면 글자 배치 → 대본(컷 수·길이·고정 제목)과 자막 모양에 적용 */
export type RefStyle = {
  title: string; duration: number; cuts: number; avgCut: number;
  fixedTitle?: TextLook & { example: string }; // 영상 내내 떠 있는 제목 (예: 위쪽 "POV: …")
  caption?: TextLook & { examples: string[] }; // 컷마다 바뀌는 자막
  opening: string; pacing: string; ending: string;
};
const hex = (v: unknown) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "").trim()) ? String(v).trim().toLowerCase() : "");
function cleanLook(v: unknown): TextLook | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.has === false || !o || typeof v !== "object") return null;
  const pos = ["top", "middle", "bottom"].includes(String(o.pos)) ? (String(o.pos) as TextLook["pos"]) : "bottom";
  const size = ["s", "m", "l"].includes(String(o.size)) ? (String(o.size) as TextLook["size"]) : "m";
  const box = hex(o.box);
  return { pos, size, color: hex(o.color) || "#ffffff", box, stroke: box ? "" : hex(o.stroke) };
}
export function cleanRefStyle(raw: unknown, base: { title: string; duration: number; cuts: number }): RefStyle {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ft = cleanLook(r.fixedTitle), cp = cleanLook(r.caption);
  const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const ftEx = s((r.fixedTitle as { example?: string } | null)?.example, 60);
  const cpEx = (Array.isArray((r.caption as { examples?: unknown[] } | null)?.examples) ? (r.caption as { examples: unknown[] }).examples : []).map((x) => s(x, 60)).filter(Boolean).slice(0, 5);
  const cuts = Math.max(1, Math.round(base.cuts));
  return {
    title: s(base.title, 80), duration: Math.round(base.duration * 10) / 10, cuts, avgCut: Math.round((base.duration / cuts) * 10) / 10,
    ...(ft && ftEx ? { fixedTitle: { ...ft, example: ftEx } } : {}),
    ...(cp ? { caption: { ...cp, examples: cpEx } } : {}),
    opening: s(r.opening, 160), pacing: s(r.pacing, 160), ending: s(r.ending, 160),
  };
}

export type ShootPost = { title: string; desc: string }; // 플랫폼별 올릴 글 (제목 + 설명)
export type ShootScript = {
  name?: string; // 여러 안일 때 이름 (A안 · 음식 먼저)
  concept?: string; // 이 안의 구성 한 줄
  shorts?: ShootPost; // 유튜브 쇼츠용
  clip?: ShootPost; // 네이버 클립용
  fixedTitle?: string; // 영상 내내 화면에 떠 있는 제목 (참고 릴스가 그런 형식일 때)
  title: string;
  hooks: string[]; // 첫 컷 자막 후보 (hook 번째를 씀)
  hook: number;
  cuts: ShootCut[];
  unused: { clip: number; reason: string }[];
  caption: string;
  hashtags: string[];
  check: string[]; // 메모에 없어 확인이 필요한 사실
  model?: string;
  substitutedFor?: string;
};

export type ShootStatus = "analyzing" | "scripting" | "review" | "rendering" | "done" | "error";
export type Shoot = {
  id: string; title: string; kind: ShootKindId; memo: string; seconds: number; mosaic: boolean; refs: string[]; ref_style: RefStyle | null;
  clips: ShootClip[]; script: ShootScript | null; variants: ShootScript[]; pick: number; history: { at: string; feedback: string }[];
  status: ShootStatus; message: string; failed_at: string; reel_id: string | null;
  created_at: string; updated_at: string;
};
export const SHOOT_STATUS_LABEL: Record<ShootStatus, string> = { analyzing: "영상 확인 중", scripting: "대본 쓰는 중", review: "대본 승인 대기", rendering: "영상 만드는 중", done: "완성", error: "오류" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * AI·화면에서 온 대본을 안전한 모양으로 (없는 클립·길이를 벗어난 구간은 고치거나 뺌)
 * - 구간은 클립 길이 안으로 자르고, 0.6초보다 짧은 컷은 뺌
 */
export function cleanScript(raw: unknown, clips: ShootClip[]): ShootScript {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cuts: ShootCut[] = [];
  for (const c of Array.isArray(r.cuts) ? (r.cuts as Record<string, unknown>[]) : []) {
    const n = Math.round(Number(c?.clip));
    const clip = clips[n - 1];
    if (!clip) continue;
    const dur = Number(clip.duration) || 0;
    let from = Math.max(0, Number(c.from) || 0);
    let to = Number(c.to) || 0;
    if (dur > 0) { to = Math.min(to || dur, dur); from = Math.min(from, Math.max(0, dur - 0.6)); }
    if (to - from < 0.6) continue;
    const speed = cutSpeed(c as { speed?: number });
    if (to - from > 15 * speed) to = from + 15 * speed; // 화면에 15초 넘게 나오는 컷은 자름
    if ((to - from) / speed < 0.6) continue;
    cuts.push({ clip: n, from: r2(from), to: r2(to), caption: str(c.caption, 60), note: str(c.note, 160), ...(speed !== 1 ? { speed } : {}) });
    if (cuts.length >= 30) break;
  }
  const hooks = (Array.isArray(r.hooks) ? r.hooks : []).map((h) => str(h, 60)).filter(Boolean).slice(0, 4);
  if (!hooks.length && cuts[0]?.caption) hooks.push(cuts[0].caption);
  const tags = (Array.isArray(r.hashtags) ? r.hashtags : []).map((x) => String(x).replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean);
  const used = new Set(cuts.map((c) => c.clip));
  const post = (v: unknown): ShootPost | undefined => {
    const o = (v ?? {}) as Record<string, unknown>;
    const title = str(o.title, 100), desc = String(o.desc ?? "").trim().slice(0, 1500);
    return title || desc ? { title, desc } : undefined;
  };
  const shorts = post(r.shorts), clip = post(r.clip);
  return {
    ...(str(r.name, 30) ? { name: str(r.name, 30) } : {}),
    ...(str(r.concept, 120) ? { concept: str(r.concept, 120) } : {}),
    ...(shorts ? { shorts } : {}),
    ...(clip ? { clip } : {}),
    ...(str(r.fixedTitle, 40) ? { fixedTitle: str(r.fixedTitle, 40) } : {}),
    title: str(r.title, 40),
    hooks,
    hook: Math.max(0, Math.min(hooks.length - 1, Math.round(Number(r.hook)) || 0)),
    cuts,
    unused: (Array.isArray(r.unused) ? (r.unused as Record<string, unknown>[]) : []).map((u) => ({ clip: Math.round(Number(u?.clip)), reason: str(u?.reason, 120) })).filter((u) => clips[u.clip - 1] && !used.has(u.clip)).slice(0, MAX_SHOOT_CLIPS),
    caption: String(r.caption ?? "").trim().slice(0, 2200),
    hashtags: [...new Set(tags)].slice(0, 8).map((t) => `#${t}`),
    check: (Array.isArray(r.check) ? r.check : []).map((x) => str(x, 160)).filter(Boolean).slice(0, 8),
    ...(r.model ? { model: str(r.model, 60) } : {}),
    ...(r.substitutedFor ? { substitutedFor: str(r.substitutedFor, 60) } : {}),
  };
}

/** AI 답 → 대본 안 목록 (variants 가 없으면 답 전체를 한 안으로). post(올릴 글)는 모든 안에 같이 붙임 */
export function cleanVariants(raw: unknown, clips: ShootClip[], extra: Record<string, unknown> = {}): ShootScript[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  const post = (r.post ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.variants) && r.variants.length ? (r.variants as Record<string, unknown>[]) : [r];
  return list.slice(0, 3).map((v, i, a) => cleanScript({ ...post, ...v, name: a.length > 1 ? v?.name || `${"ABC"[i]}안` : v?.name, ...extra }, clips)).filter((s) => s.cuts.length);
}

export const scriptSeconds = (s: ShootScript | null) => r2((s?.cuts ?? []).reduce((a, c) => a + cutSeconds(c), 0));

const LOOK_Y = { top: 330, middle: 960, bottom: 1450 } as const;
const LOOK_SIZE = { s: 54, m: 68, l: 90 } as const;
const lookStyle = (l: TextLook) => ({ ...DEFAULT_TEXT_STYLE, y: LOOK_Y[l.pos], size: LOOK_SIZE[l.size], color: l.color, box: l.box, stroke: l.box ? "" : l.stroke || (l.color === "#ffffff" ? "#000000" : "") });

/**
 * 승인한 대본 → 릴스 편집 문서
 * - 컷 하나 = 장면 하나 (그 클립의 그 구간, 현장 소리 그대로)
 * - 자막은 그 장면이 보이는 동안. 첫 컷 자막은 고른 후킹 문구
 * - 참고 릴스(look)가 있으면 글자 위치·색·상자를 그 릴스처럼, 고정 제목(fixedTitle)은 영상 내내 띄움
 * - 가로로 찍은 클립은 잘리지 않게 화면 안에 다 보이게(contain), 세로는 화면 가득(cover)
 */
export function scriptToDoc(script: ShootScript, clips: ShootClip[], memo = "", look: RefStyle | null = null): ReelDoc {
  const sid = () => Math.random().toString(36).slice(2, 9);
  const scenes: ReelScene[] = [];
  const texts: ReelText[] = [];
  const fixed = script.fixedTitle?.trim() ?? "";
  // 고정 제목과 자막이 같은 자리에 겹치지 않게: 겹치면 자막을 아래로
  const capLook = look?.caption && !(fixed && look.fixedTitle && look.caption.pos === look.fixedTitle.pos) ? look.caption : look?.caption ? { ...look.caption, pos: (look.fixedTitle?.pos === "bottom" ? "middle" : "bottom") as TextLook["pos"] } : null;
  let t = 0;
  script.cuts.forEach((c, i) => {
    const clip = clips[c.clip - 1];
    if (!clip) return;
    const speed = cutSpeed(c);
    const dur = r2(cutSeconds(c));
    const wide = (clip.width ?? 0) > (clip.height ?? 0);
    const text = i === 0 ? script.hooks[script.hook] || c.caption : c.caption;
    scenes.push({ id: sid(), label: (text || `컷 ${i + 1}`).slice(0, 30), dur, audioFrom: 0, video: { videoId: clip.videoId, from: c.from }, ...(speed !== 1 ? { speed } : {}), sound: speed === 1, // 배속 컷은 소리를 끔 (빨라지거나 늘어진 소리가 어색해서)
      fit: wide ? "contain" : "cover", bg: { type: "none" }, image: null });
    if (text) texts.push({ id: sid(), start: r2(t), end: r2(t + dur), text, style: capLook ? { ...lookStyle(capLook), anim: i === 0 ? "pop" : "fade" } : i === 0 && !fixed ? { ...DEFAULT_TEXT_STYLE, y: 520, size: 88, anim: "pop" } : { ...DEFAULT_TEXT_STYLE, y: 1420, anim: "fade" } });
    t += dur;
  });
  if (fixed && t > 0) texts.unshift({ id: sid(), start: 0, end: r2(t), text: fixed, style: { ...(look?.fixedTitle ? lookStyle(look.fixedTitle) : { ...DEFAULT_TEXT_STYLE, y: LOOK_Y.top, size: LOOK_SIZE.m }), anim: "fade" } });
  return { width: 1080, height: 1920, fps: 30, baseVideoId: null, audio: "base", scenes, texts, overlays: [], photos: [], music: null, ...(memo ? { memo: memo.slice(0, 4000) } : {}) };
}
