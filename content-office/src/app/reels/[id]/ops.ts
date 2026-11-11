// 릴스 편집 문서 바꾸기 (화면 전용, 모두 새 문서를 돌려줌 → 되돌리기 쉬움)
import { DEFAULT_TEXT_STYLE, sceneStarts, type ReelBg, type ReelDoc, type ReelOverlay, type ReelScene, type ReelText, type ReelTextStyle } from "@/remotion/types";

export const nid = () => Math.random().toString(36).slice(2, 9);
const r2 = (n: number) => Math.round(n * 100) / 100;
const MIN = 0.2;

export function sceneAt(doc: ReelDoc, t: number) {
  const st = sceneStarts(doc);
  for (let i = doc.scenes.length - 1; i >= 0; i--) if (t >= st[i]) return { index: i, start: st[i], scene: doc.scenes[i] };
  return doc.scenes.length ? { index: 0, start: 0, scene: doc.scenes[0] } : null;
}

/** 시각 a 이후 자막을 d초만큼 밀기 (d<0 이면 당김) */
function shiftTexts(texts: ReelText[], a: number, d: number) {
  return texts.map((t) => (t.start >= a - 0.001 ? { ...t, start: r2(t.start + d), end: r2(t.end + d) } : t));
}

export function splitScene(doc: ReelDoc, id: string, t: number): ReelDoc {
  const st = sceneStarts(doc);
  const i = doc.scenes.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const s = doc.scenes[i];
  const o = r2(t - st[i]);
  if (o < MIN || s.dur - o < MIN) return doc;
  const a: ReelScene = { ...s, dur: o };
  const b: ReelScene = { ...s, id: nid(), dur: r2(s.dur - o), audioFrom: r2(s.audioFrom + o), video: { ...s.video, from: s.video.videoId ? r2(s.video.from + o) : s.video.from } };
  const scenes = [...doc.scenes];
  scenes.splice(i, 1, a, b);
  return { ...doc, scenes };
}

export function deleteScene(doc: ReelDoc, id: string): ReelDoc {
  if (doc.scenes.length <= 1) return doc;
  const st = sceneStarts(doc);
  const i = doc.scenes.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const a = st[i], b = a + doc.scenes[i].dur, d = doc.scenes[i].dur;
  const texts = doc.texts
    .filter((t) => !(t.start >= a - 0.001 && t.end <= b + 0.001))
    .map((t) => (t.start >= b - 0.001 ? { ...t, start: r2(t.start - d), end: r2(t.end - d) } : t.end > a && t.start < a ? { ...t, end: r2(Math.max(t.start + MIN, a + Math.max(0, t.end - b))) } : t));
  return { ...doc, scenes: doc.scenes.filter((s) => s.id !== id), texts };
}

export function duplicateScene(doc: ReelDoc, id: string): ReelDoc {
  const st = sceneStarts(doc);
  const i = doc.scenes.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const s = doc.scenes[i];
  const a = st[i], b = a + s.dur;
  const inside = doc.texts.filter((t) => t.start >= a - 0.001 && t.end <= b + 0.001).map((t) => ({ ...t, id: nid(), start: r2(t.start + s.dur), end: r2(t.end + s.dur) }));
  const scenes = [...doc.scenes];
  scenes.splice(i + 1, 0, { ...s, id: nid() });
  return { ...doc, scenes, texts: [...shiftTexts(doc.texts, b, s.dur), ...inside] };
}

/** 장면 길이 바꾸기 (오른쪽 끝 끌기) — 뒤 자막도 함께 밀고 당김 */
export function resizeScene(doc: ReelDoc, id: string, dur: number): ReelDoc {
  const st = sceneStarts(doc);
  const i = doc.scenes.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const s = doc.scenes[i];
  const nd = r2(Math.max(MIN, dur));
  const d = nd - s.dur;
  if (Math.abs(d) < 0.01) return doc;
  const scenes = doc.scenes.map((x) => (x.id === id ? { ...x, dur: nd } : x));
  return { ...doc, scenes, texts: shiftTexts(doc.texts, st[i] + s.dur, d) };
}

export function patchScenes(doc: ReelDoc, ids: string[] | "all", patch: (s: ReelScene) => Partial<ReelScene>): ReelDoc {
  return { ...doc, scenes: doc.scenes.map((s) => (ids === "all" || ids.includes(s.id) ? { ...s, ...patch(s) } : s)) };
}
export const setBg = (doc: ReelDoc, ids: string[] | "all", bg: ReelBg) => patchScenes(doc, ids, () => ({ bg }));

export function addText(doc: ReelDoc, t: number, style?: ReelTextStyle): { doc: ReelDoc; id: string } {
  const id = nid();
  const total = doc.scenes.reduce((a, s) => a + s.dur, 0);
  const start = r2(Math.min(t, Math.max(0, total - 0.5)));
  const text: ReelText = { id, start, end: r2(Math.min(total, start + 2)), text: "새 자막", style: { ...(style ?? DEFAULT_TEXT_STYLE) } };
  return { doc: { ...doc, texts: [...doc.texts, text] }, id };
}
export function splitText(doc: ReelDoc, id: string, t: number): ReelDoc {
  const x = doc.texts.find((y) => y.id === id);
  if (!x || t - x.start < MIN || x.end - t < MIN) return doc;
  return { ...doc, texts: doc.texts.flatMap((y) => (y.id === id ? [{ ...y, end: r2(t) }, { ...y, id: nid(), start: r2(t) }] : [y])) };
}
export const deleteText = (doc: ReelDoc, id: string): ReelDoc => ({ ...doc, texts: doc.texts.filter((t) => t.id !== id) });
export function duplicateText(doc: ReelDoc, id: string): ReelDoc {
  const x = doc.texts.find((y) => y.id === id);
  if (!x) return doc;
  const len = x.end - x.start;
  return { ...doc, texts: [...doc.texts, { ...x, id: nid(), start: x.end, end: r2(x.end + len) }] };
}
export function patchText(doc: ReelDoc, id: string, patch: Partial<ReelText>): ReelDoc {
  return { ...doc, texts: doc.texts.map((t) => (t.id === id ? { ...t, ...patch, start: r2(Math.max(0, patch.start ?? t.start)), end: r2(Math.max((patch.start ?? t.start) + MIN, patch.end ?? t.end)) } : t)) };
}
/** 글자 모양: 이 자막만 / 자막 전체 */
export function styleTexts(doc: ReelDoc, ids: string[] | "all", patch: Partial<ReelTextStyle>): ReelDoc {
  // '자막 전체' 일괄 수정은 '자막 전체에 포함'을 끈 자막은 건너뜀
  return { ...doc, texts: doc.texts.map((t) => ((ids === "all" ? !(t as ReelText & { skipAll?: boolean }).skipAll : ids.includes(t.id)) ? { ...t, style: { ...t.style, ...patch } } : t)) };
}

// ── 위에 얹기 ──
export function addOverlay(doc: ReelDoc, videoId: string, t: number): { doc: ReelDoc; id: string } {
  const id = nid();
  const o: ReelOverlay = { id, videoId, start: r2(t), end: r2(Math.min(docDurationOf(doc), t + 3)), x: 240, y: 560, w: 600, h: 600, fit: "cover", radius: 36 };
  if (o.end - o.start < 0.3) o.end = r2(o.start + 3);
  return { doc: { ...doc, overlays: [...(doc.overlays ?? []), o] }, id };
}
export function patchOverlay(doc: ReelDoc, id: string, patch: Partial<ReelOverlay>): ReelDoc {
  return { ...doc, overlays: (doc.overlays ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}
export function deleteOverlay(doc: ReelDoc, id: string): ReelDoc {
  return { ...doc, overlays: (doc.overlays ?? []).filter((o) => o.id !== id) };
}
export function duplicateOverlay(doc: ReelDoc, id: string): ReelDoc {
  const o = (doc.overlays ?? []).find((x) => x.id === id);
  if (!o) return doc;
  const len = o.end - o.start;
  return { ...doc, overlays: [...(doc.overlays ?? []), { ...o, id: nid(), start: r2(o.end), end: r2(o.end + len) }] };
}
const docDurationOf = (doc: ReelDoc) => doc.scenes.reduce((a, s) => a + s.dur, 0);

/** 기본 자막 모양 */
export const defaultStyle = (): ReelTextStyle => ({ ...DEFAULT_TEXT_STYLE });
