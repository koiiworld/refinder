import "server-only";
import crypto from "node:crypto";
import { q, q1, j } from "./db";
import { defaultTemplate, type ThumbEl, type ThumbItem, type ThumbState, type ThumbSticker, type ThumbTemplate } from "./thumb-types";

/**
 * 🖼 썸네일 공장 저장소
 * - 사진·스티커 파일: generated_images (주소 /api/img/img_xxx.jpg)
 * - 목록·꾸민 내용·템플릿: settings 'thumb_items' · 'thumb_stickers' · 'thumb_templates'
 * - 지우기는 휴지통(deletedAt) → 30일 지나면 목록에서 완전히 뺌
 */
const KEYS = { items: "thumb_items", stickers: "thumb_stickers", templates: "thumb_templates" } as const;
const IMG = /^\/api\/img\/img_[0-9a-f]{8,}\.jpg$/;
const DAY30 = 30 * 86400_000;

async function read<T>(key: string): Promise<T[]> {
  const r = await q1<{ value: T[] }>("SELECT value FROM settings WHERE key=$1", [key]).catch(() => null);
  return Array.isArray(r?.value) ? r!.value : [];
}
async function write(key: string, list: unknown[]) {
  await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, j(list)]);
}
const alive = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt || Date.now() - new Date(x.deletedAt).getTime() < DAY30);

export async function thumbState(): Promise<ThumbState> {
  const [items, stickers, templates] = await Promise.all([read<ThumbItem>(KEYS.items), read<ThumbSticker>(KEYS.stickers), read<ThumbTemplate>(KEYS.templates)]);
  // 기본 템플릿은 늘 목록 맨 앞에 (직접 휴지통에 넣은 경우만 빼고)
  const tpls = alive(templates);
  return { items: alive(items), stickers: alive(stickers), templates: templates.some((t) => t.id === "tpl_default") ? tpls : [defaultTemplate(), ...tpls] };
}

/** 사진·스티커 올리기 → 주소 */
export async function uploadThumbImage(dataUrl: string, kind: "photo" | "sticker") {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(String(dataUrl ?? ""));
  if (!m) throw new Error("PNG·JPG·WEBP·GIF 사진만 올릴 수 있어요.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > 15 * 1024 * 1024) throw new Error("사진이 너무 커요 (15MB 이하).");
  const id = `img_${crypto.randomBytes(12).toString("hex")}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'upload',$2,$3,$4,'')", [id, kind === "sticker" ? "thumb-sticker" : "thumb-photo", m[1].replace("image/jpg", "image/jpeg"), data]);
  return `/api/img/${id}.jpg`;
}

// ── 저장 전 정리 (엉뚱한 주소·너무 큰 값 막기) ──
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const s = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
const color = (v: unknown) => (/^#[0-9a-f]{3,8}$/i.test(String(v ?? "")) ? String(v) : "");
function cleanEl(e: ThumbEl): ThumbEl | null {
  if (!e || !["text", "sticker", "shape"].includes(e.kind)) return null;
  const base: ThumbEl = { id: s(e.id, 40) || crypto.randomUUID().slice(0, 8), kind: e.kind, slot: e.slot ? s(e.slot, 40) : undefined, x: n(e.x, -1, 2, 0.5), y: n(e.y, -1, 2, 0.5), w: n(e.w, 0, 3, 0.2), rot: n(e.rot, -360, 360, 0), opacity: e.opacity == null ? undefined : n(e.opacity, 0, 1, 1), flip: !!e.flip || undefined };
  if (e.kind === "text") return { ...base, text: s(e.text, 300), font: s(e.font, 40), size: n(e.size, 8, 600, 80), color: color(e.color) || "#222222", stroke: color(e.stroke), strokeW: n(e.strokeW, 0, 60, 0), shadow: !!e.shadow || undefined, bold: !!e.bold || undefined, align: ["left", "center", "right"].includes(String(e.align)) ? e.align : "center", lineHeight: n(e.lineHeight, 0.6, 3, 1.15), letter: n(e.letter, -20, 40, 0), bg: color(e.bg) || undefined };
  if (e.kind === "sticker") return { ...base, src: IMG.test(String(e.src ?? "")) ? e.src : "" };
  return { ...base, shape: ["sparkle", "heart", "star", "circle"].includes(String(e.shape)) ? e.shape : "sparkle", fill: color(e.fill) || "#ffd84d" };
}
const cleanEls = (els: unknown) => (Array.isArray(els) ? els.slice(0, 80).map((e) => cleanEl(e as ThumbEl)).filter((e): e is ThumbEl => !!e) : []);
const ratio = (r: unknown) => (["1:1", "4:3", "3:4", "16:9"].includes(String(r)) ? (r as ThumbItem["doc"]["ratio"]) : "1:1");
const del = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export async function saveThumbs(input: Partial<ThumbState>) {
  if (input.items) {
    const items = input.items.slice(0, 500).filter((x) => IMG.test(String(x.photo ?? ""))).map((x): ThumbItem => ({
      id: s(x.id, 40), name: s(x.name, 120), photo: x.photo, templateId: x.templateId ? s(x.templateId, 40) : null, updatedAt: new Date().toISOString(), deletedAt: del(x.deletedAt),
      doc: { ratio: ratio(x.doc?.ratio), photo: { zoom: n(x.doc?.photo?.zoom, 1, 6, 1), x: n(x.doc?.photo?.x, 0, 1, 0.5), y: n(x.doc?.photo?.y, 0, 1, 0.5) }, els: cleanEls(x.doc?.els) },
    }));
    await write(KEYS.items, alive(items));
  }
  if (input.stickers) await write(KEYS.stickers, alive(input.stickers.slice(0, 300).filter((x) => IMG.test(String(x.url ?? ""))).map((x) => ({ id: s(x.id, 40), name: s(x.name, 80), url: x.url, deletedAt: del(x.deletedAt) }))));
  if (input.templates) await write(KEYS.templates, alive(input.templates.slice(0, 60).map((x) => ({ id: s(x.id, 40), name: s(x.name, 60) || "템플릿", ratio: ratio(x.ratio), els: cleanEls(x.els), deletedAt: del(x.deletedAt) }))));
  return thumbState();
}
