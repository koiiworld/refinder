/**
 * 🎞 캐러셀 편집 툴 (장마다 요소를 놓고 움직이는 카드) — 화면·서버 공용
 * - 한 장 = 배경 + 요소들(글자·사진·네모·동그라미·선·반짝이). 좌표는 1080×1350 기준 px
 * - 미리보기와 MP4 뽑기가 이 값을 그대로 씀 (scene-render.ts)
 */
export const SW = 1080;
export const SH = 1350;

export type ElType = "text" | "image" | "rect" | "circle" | "line" | "sparkle";
export type MotionId =
  | "none" | "fade" | "rise" | "slideLeft" | "slideRight" | "zoomIn" | "pop" | "drop"
  | "typewriter" | "karaoke" | "bounceChars" | "strike" | "highlight" | "underline"
  | "float" | "pulse" | "shake" | "twinkle" | "kenburns" | "panLeft" | "panRight";

export type Motion = { id: MotionId; delay: number; dur: number };
export type El = {
  id: string;
  type: ElType;
  name?: string;
  x: number; y: number; w: number; h: number; // px (1080×1350 기준)
  rot: number; // 도
  opacity: number; // 0~1
  hidden?: boolean;
  locked?: boolean;
  // 글자
  text?: string; // ==글자== 는 형광펜
  size?: number; // px
  weight?: number; // 400~900
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letter?: number; // px
  textBg?: string; // 글자 바탕색 ('' = 없음)
  shadow?: boolean;
  mark?: string; // 형광펜·강조 색
  // 사진
  image?: number; // 캐러셀 사진 번호
  fit?: "cover" | "contain";
  radius?: number;
  // 도형
  fill?: string;
  stroke?: string;
  strokeW?: number;
  motion: Motion;
};
export type SceneBg = {
  color: string;
  color2?: string; // 있으면 위→아래 그라데이션
  image?: number | null; // 캐러셀 사진 번호
  blur?: number; // 0~20 px
  dim?: number; // 0~0.8 어둡게
  pattern?: "none" | "grid" | "dots" | "stripes";
  glow?: boolean; // 모서리 빛
  kenburns?: boolean; // 배경 사진 천천히 확대
};
export type Scene = { v: 1; bg: SceneBg; els: El[]; dur: number; note?: string };

export const MOTIONS: { id: MotionId; label: string; en: string; desc: string; for: ElType[] | "all" }[] = [
  { id: "none", label: "없음", en: "None", desc: "처음부터 그대로 있어요", for: "all" },
  { id: "fade", label: "스르륵", en: "Fade in", desc: "투명했다가 서서히 나타나요", for: "all" },
  { id: "rise", label: "아래서 위로", en: "Rise", desc: "아래에서 살짝 올라오며 나타나요", for: "all" },
  { id: "slideLeft", label: "왼쪽에서", en: "Slide in", desc: "왼쪽에서 밀려 들어와요", for: "all" },
  { id: "slideRight", label: "오른쪽에서", en: "Slide in", desc: "오른쪽에서 밀려 들어와요", for: "all" },
  { id: "zoomIn", label: "커지며 등장", en: "Zoom in", desc: "작았다가 제 크기로 커져요", for: "all" },
  { id: "pop", label: "통! 튀어나오기", en: "Pop", desc: "살짝 크게 튀었다가 자리 잡아요", for: "all" },
  { id: "drop", label: "위에서 툭", en: "Drop", desc: "위에서 떨어져 통통 멈춰요", for: "all" },
  { id: "typewriter", label: "타이핑", en: "Typewriter", desc: "한 글자씩 쳐져요. 시작 전엔 안 보여요", for: ["text"] },
  { id: "karaoke", label: "단어 하이라이트", en: "Karaoke", desc: "단어가 차례로 강조색으로 켜져요", for: ["text"] },
  { id: "bounceChars", label: "글자 통통", en: "Kinetic typography", desc: "글자가 차례로 통통 튀어요", for: ["text"] },
  { id: "strike", label: "취소선", en: "Stamp & strike", desc: "틀린 문장에 줄이 그어져요", for: ["text"] },
  { id: "highlight", label: "형광펜", en: "Highlighter", desc: "문장 밑에 형광펜이 왼쪽부터 칠해져요", for: ["text"] },
  { id: "underline", label: "밑줄 긋기", en: "Underline draw", desc: "글자 아래 선이 왼쪽에서 오른쪽으로", for: ["text"] },
  { id: "float", label: "둥실둥실", en: "Float", desc: "계속 위아래로 살짝 떠다녀요", for: "all" },
  { id: "pulse", label: "두근두근", en: "Pulse", desc: "계속 살짝 커졌다 작아져요", for: "all" },
  { id: "shake", label: "흔들흔들", en: "Shake", desc: "처음에 좌우로 흔들려요", for: "all" },
  { id: "twinkle", label: "반짝반짝", en: "Twinkle", desc: "계속 반짝여요", for: "all" },
  { id: "kenburns", label: "천천히 확대", en: "Ken Burns", desc: "사진이 천천히 다가와요", for: ["image"] },
  { id: "panLeft", label: "왼쪽으로 흐르기", en: "Pan", desc: "사진이 천천히 왼쪽으로 흘러요", for: ["image"] },
  { id: "panRight", label: "오른쪽으로 흐르기", en: "Pan", desc: "사진이 천천히 오른쪽으로 흘러요", for: ["image"] },
];

let seq = 0;
export const newElId = () => `el${Date.now().toString(36)}${(seq++).toString(36)}`;

export function baseEl(type: ElType, accent: string, over: Partial<El> = {}): El {
  const common = { id: newElId(), type, rot: 0, opacity: 1, motion: { id: "fade" as MotionId, delay: 0.2, dur: 0.6 } };
  if (type === "text") return { ...common, x: 120, y: 560, w: 840, h: 220, text: "글자를 더블클릭해서 고치세요", size: 64, weight: 800, color: "#16181d", align: "left", lineHeight: 1.25, letter: 0, textBg: "", shadow: false, mark: accent, motion: { id: "rise", delay: 0.2, dur: 0.6 }, ...over };
  if (type === "image") return { ...common, x: 140, y: 300, w: 800, h: 600, image: 0, fit: "cover", radius: 28, motion: { id: "kenburns", delay: 0, dur: 5 }, ...over };
  if (type === "rect") return { ...common, x: 140, y: 500, w: 800, h: 300, fill: "#ffffff", stroke: accent, strokeW: 0, radius: 28, ...over };
  if (type === "circle") return { ...common, x: 390, y: 525, w: 300, h: 300, fill: accent, stroke: "", strokeW: 0, ...over };
  if (type === "line") return { ...common, x: 120, y: 670, w: 840, h: 10, fill: accent, motion: { id: "slideLeft", delay: 0.2, dur: 0.6 }, ...over };
  return { ...common, x: 760, y: 140, w: 140, h: 140, fill: "#ffd84d", motion: { id: "twinkle", delay: 0, dur: 1.2 }, ...over };
}

/** 예전 카드(제목·본문·사진) → 편집 툴 장면 (처음 열 때 한 번) */
export function sceneFromSlide(slide: { kind: string; headline: string; body: string; image: number | null }, index: number, total: number, accent: string, handle = ""): Scene {
  const els: El[] = [];
  const photo = slide.image != null;
  const cover = slide.kind === "cover", cta = slide.kind === "cta";
  const bg: SceneBg = photo
    ? { color: "#111318", image: slide.image, dim: 0.45, blur: 0, pattern: "none", glow: false, kenburns: true }
    : { color: cta ? accent : "#ffffff", pattern: cta ? "none" : "grid", glow: !cta };
  const ink = photo || cta ? "#ffffff" : "#16181d", sub = photo || cta ? "rgba(255,255,255,0.88)" : "#4a4f57";
  const headY = photo ? (cover ? 760 : 820) : cover ? 420 : 380;
  els.push(baseEl("line", accent, { name: "강조 선", x: 88, y: headY - 46, w: 96, h: 12, fill: photo || cta ? "#ffffff" : accent }));
  els.push(baseEl("text", accent, { name: "제목", x: 88, y: headY, w: 904, h: cover ? 300 : 230, text: slide.headline || "제목", size: cover ? 104 : 80, weight: 900, color: ink, lineHeight: 1.18, motion: { id: "rise", delay: 0.2, dur: 0.6 } }));
  if (slide.body) els.push(baseEl("text", accent, { name: "본문", x: 88, y: headY + (cover ? 320 : 250), w: 904, h: 260, text: slide.body, size: 44, weight: 500, color: sub, lineHeight: 1.45, motion: { id: "fade", delay: 0.7, dur: 0.6 } }));
  els.push(baseEl("text", accent, { name: "쪽 번호", x: 820, y: 48, w: 172, h: 50, text: `${index + 1} / ${total}`, size: 32, weight: 600, color: photo || cta ? "rgba(255,255,255,0.85)" : "rgba(20,22,26,0.55)", align: "right", motion: { id: "none", delay: 0, dur: 0 } }));
  if (handle) els.push(baseEl("text", accent, { name: "계정", x: 88, y: 1250, w: 500, h: 50, text: handle.startsWith("@") ? handle : "@" + handle, size: 32, weight: 600, color: photo || cta ? "rgba(255,255,255,0.85)" : "rgba(20,22,26,0.55)", motion: { id: "none", delay: 0, dur: 0 } }));
  if (cover && total > 1) els.push(baseEl("text", accent, { name: "넘겨보기", x: 640, y: 1250, w: 352, h: 50, text: "넘겨보세요 →", size: 32, weight: 600, align: "right", color: photo ? "rgba(255,255,255,0.85)" : "rgba(20,22,26,0.55)", motion: { id: "float", delay: 0.8, dur: 1.6 } }));
  if (cta) els.push(baseEl("text", accent, { name: "저장 안내", x: 520, y: 1250, w: 472, h: 50, text: "💾 저장  ·  💬 태그", size: 32, weight: 700, align: "right", color: "#ffffff", motion: { id: "pulse", delay: 0.5, dur: 1.2 } }));
  return { v: 1, bg, els, dur: 5 };
}

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const color = (v: unknown, d: string) => { const s = String(v ?? "").trim(); return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i.test(s) ? s : d; };

/** 저장 전 정리 (이상한 값·너무 큰 값 막기) */
export function cleanScene(raw: unknown, imageCount: number): Scene | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<Scene>;
  const img = (v: unknown) => (v == null || v === "" ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < imageCount ? Number(v) : null);
  const b = (r.bg ?? {}) as Partial<SceneBg>;
  const bg: SceneBg = { color: color(b.color, "#ffffff"), color2: b.color2 ? color(b.color2, "") || undefined : undefined, image: img(b.image), blur: num(b.blur, 0, 0, 20), dim: num(b.dim, 0, 0, 0.85), pattern: (["none", "grid", "dots", "stripes"] as const).includes(b.pattern as never) ? b.pattern : "none", glow: !!b.glow, kenburns: !!b.kenburns };
  const types: ElType[] = ["text", "image", "rect", "circle", "line", "sparkle"];
  const els = (Array.isArray(r.els) ? r.els : []).slice(0, 60).flatMap((e): El[] => {
    if (!e || !types.includes(e.type)) return [];
    const m = (e.motion ?? {}) as Partial<Motion>;
    return [{
      id: str(e.id, 40) || newElId(), type: e.type, name: e.name ? str(e.name, 40) : undefined,
      x: num(e.x, 0, -2000, 3000), y: num(e.y, 0, -2000, 3000), w: num(e.w, 100, 4, 4000), h: num(e.h, 100, 2, 4000), rot: num(e.rot, 0, -360, 360), opacity: num(e.opacity, 1, 0, 1),
      hidden: !!e.hidden || undefined, locked: !!e.locked || undefined,
      ...(e.type === "text" ? { text: str(e.text, 1200), size: num(e.size, 60, 8, 400), weight: num(e.weight, 700, 100, 900), color: color(e.color, "#16181d"), align: (["left", "center", "right"] as const).includes(e.align as never) ? e.align : "left", lineHeight: num(e.lineHeight, 1.25, 0.6, 3), letter: num(e.letter, 0, -20, 60), textBg: e.textBg ? color(e.textBg, "") : "", shadow: !!e.shadow, mark: color(e.mark, "#ffd84d") } : {}),
      ...(e.type === "image" ? { image: img(e.image) ?? 0, fit: e.fit === "contain" ? "contain" : "cover", radius: num(e.radius, 0, 0, 600) } : {}),
      ...(["rect", "circle", "line", "sparkle"].includes(e.type) ? { fill: color(e.fill, "#ffffff"), stroke: e.stroke ? color(e.stroke, "") : "", strokeW: num(e.strokeW, 0, 0, 60), radius: num(e.radius, 0, 0, 600) } : {}),
      motion: { id: MOTIONS.some((x) => x.id === m.id) ? (m.id as MotionId) : "none", delay: num(m.delay, 0, 0, 20), dur: num(m.dur, 0.6, 0, 20) },
    }];
  });
  return { v: 1, bg, els, dur: num(r.dur, 5, 1, 15), note: r.note ? str(r.note, 1000) : undefined };
}
