// 🖼 썸네일 공장 (클라이언트·서버 공용 타입)

export type ThumbRatio = "1:1" | "4:3" | "3:4" | "16:9";
export const THUMB_RATIOS: { id: ThumbRatio; label: string; h: number }[] = [
  { id: "1:1", label: "정사각 1:1 (네이버·인스타)", h: 1080 },
  { id: "4:3", label: "가로 4:3", h: 810 },
  { id: "3:4", label: "세로 3:4", h: 1440 },
  { id: "16:9", label: "가로 16:9 (티스토리·유튜브)", h: 608 },
];
export const THUMB_W = 1080;
export const thumbH = (r: ThumbRatio) => THUMB_RATIOS.find((x) => x.id === r)?.h ?? 1080;

export type ThumbShape = "sparkle" | "heart" | "star" | "circle";
/** 보드 위 요소. x·y 는 가운데 위치(0~1, 가로·세로 비율), w 는 가로 대비 너비(스티커·모양), size 는 글자 크기(px, 가로 1080 기준) */
export type ThumbEl = {
  id: string;
  kind: "text" | "sticker" | "shape" | "mosaic";
  slot?: string; // 템플릿 칸 이름 (같은 칸끼리 위치·글꼴을 맞춤)
  x: number; y: number; w: number; rot: number; opacity?: number; flip?: boolean;
  // 글자
  text?: string; font?: string; size?: number; color?: string; stroke?: string; strokeW?: number; shadow?: boolean; bold?: boolean;
  align?: "left" | "center" | "right"; lineHeight?: number; letter?: number; bg?: string;
  // 스티커
  src?: string;
  // 모양
  shape?: ThumbShape; fill?: string;
  // 모자이크 (얼굴 가리기): h = 세로 크기(가로 1080 대비), mosaic = 흐리게·픽셀, strength 1~100, round = 동그라미
  h?: number; mosaic?: "blur" | "pixel"; strength?: number; round?: boolean;
};
/** 안내선 (줄자): v = 세로선 x 위치들, h = 가로선 y 위치들 (0~1) */
export type ThumbGuides = { v: number[]; h: number[] };
export type ThumbDoc = { ratio: ThumbRatio; photo: { zoom: number; x: number; y: number }; els: ThumbEl[]; guides?: ThumbGuides };
export type ThumbItem = { id: string; name: string; photo: string; doc: ThumbDoc; templateId?: string | null; updatedAt: string; deletedAt?: string | null };
export type ThumbSticker = { id: string; name: string; url: string; deletedAt?: string | null };
export type ThumbTemplate = { id: string; name: string; ratio: ThumbRatio; els: ThumbEl[]; guides?: ThumbGuides; deletedAt?: string | null };
export type ThumbState = { items: ThumbItem[]; stickers: ThumbSticker[]; templates: ThumbTemplate[] };

/** 기본 템플릿: 보내 준 예시처럼 — 왼쪽 위 두 줄 제목(갈색·분홍, 흰 테두리) · 반짝이 · 오른쪽 아래 캐릭터 자리 */
export function defaultTemplate(): ThumbTemplate {
  return {
    id: "tpl_default", name: "기본 (두 줄 제목 + 캐릭터)", ratio: "1:1",
    els: [
      { id: "e1", kind: "text", slot: "제목 1줄", text: "저상형 침대", x: 0.3, y: 0.09, w: 0, rot: 0, font: "jua", size: 92, color: "#5b4231", stroke: "#ffffff", strokeW: 12, align: "left", lineHeight: 1.1, letter: -2 },
      { id: "e2", kind: "text", slot: "제목 2줄", text: "내돈내산", x: 0.26, y: 0.19, w: 0, rot: 0, font: "jua", size: 92, color: "#f07a8f", stroke: "#ffffff", strokeW: 12, align: "left", lineHeight: 1.1, letter: -2 },
      { id: "e3", kind: "shape", slot: "반짝이 1", shape: "sparkle", fill: "#ffd84d", x: 0.57, y: 0.1, w: 0.07, rot: 0 },
      { id: "e4", kind: "shape", slot: "반짝이 2", shape: "sparkle", fill: "#ffd84d", x: 0.9, y: 0.26, w: 0.05, rot: 0 },
      { id: "e5", kind: "shape", slot: "하트", shape: "heart", fill: "#ff8fa8", x: 0.74, y: 0.33, w: 0.05, rot: -12 },
      { id: "e6", kind: "shape", slot: "반짝이 3", shape: "sparkle", fill: "#ffd84d", x: 0.13, y: 0.93, w: 0.05, rot: 0 },
      { id: "e7", kind: "sticker", slot: "캐릭터", src: "", x: 0.81, y: 0.84, w: 0.28, rot: 0 },
    ],
  };
}

export const emptyDoc = (ratio: ThumbRatio = "1:1"): ThumbDoc => ({ ratio, photo: { zoom: 1, x: 0.5, y: 0.5 }, els: [] });

/** 템플릿을 사진 하나에 적용: 위치·글꼴·크기는 템플릿대로, 글 내용·고른 캐릭터는 같은 칸 이름(slot)이면 그대로 둠 */
export function applyTemplate(doc: ThumbDoc, t: ThumbTemplate): ThumbDoc {
  const bySlot = new Map(doc.els.filter((e) => e.slot).map((e) => [e.slot!, e]));
  const els = t.els.map((e, i) => {
    const old = e.slot ? bySlot.get(e.slot) : undefined;
    const id = `t${Date.now().toString(36)}${i}`;
    if (e.kind === "text" && old?.kind === "text") return { ...e, id, text: old.text };
    if (e.kind === "sticker" && !e.src && old?.kind === "sticker" && old.src) return { ...e, id, src: old.src };
    return { ...e, id };
  });
  // 템플릿에 없는 칸(이 사진에만 더한 것·모자이크)은 그대로 남김. 모자이크는 사진 바로 위라 순서 상관없음
  const extra = doc.els.filter((e) => !e.slot || !t.els.some((x) => x.slot === e.slot));
  return { ...doc, ratio: t.ratio, els: [...els, ...extra], guides: t.guides ? { v: [...t.guides.v], h: [...t.guides.h] } : doc.guides };
}
