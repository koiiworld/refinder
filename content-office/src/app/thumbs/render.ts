"use client";

import { faceKey, fontFaces, fontFamily } from "@/remotion/types";
import { THUMB_W, thumbH, type ThumbDoc, type ThumbEl } from "@/lib/thumb-types";

/** 썸네일 그리기 (보드 미리보기와 PNG 저장이 같은 함수 → 보이는 그대로 저장) */

// ── 글꼴: 릴스와 같은 무료 한글 글꼴 38종 (처음 쓸 때 받음) ──
let fontsInjected = false;
export function injectFonts() {
  if (fontsInjected || typeof document === "undefined") return;
  fontsInjected = true;
  const css = fontFaces().map(({ id, w }) => `@font-face { font-family: '${fontFamily(id)}'; src: url('/api/reels/font?f=${id}${w ? `&w=${w}` : ""}'); font-weight: ${w || "100 900"}; font-display: swap; }`).join("\n");
  const st = document.createElement("style");
  st.id = "thumb-fonts";
  st.textContent = css;
  document.head.appendChild(st);
  void faceKey;
}
/** 쓰는 글꼴을 다 받은 뒤에 그리기 (안 그러면 기본 글꼴로 그려짐) */
export async function ensureFonts(doc: ThumbDoc) {
  injectFonts();
  const want = new Set(doc.els.filter((e) => e.kind === "text").map((e) => `${e.bold ? 700 : 400} 40px '${fontFamily(e.font)}'`));
  await Promise.all([...want].map((f) => document.fonts.load(f, "가A").catch(() => [])));
}

// ── 사진 캐시 ──
const cache = new Map<string, HTMLImageElement | "loading" | "error">();
export function getImg(url: string, onLoad?: () => void): HTMLImageElement | null {
  if (!url) return null;
  const c = cache.get(url);
  if (c instanceof HTMLImageElement) return c;
  if (c) return null;
  const im = new Image();
  cache.set(url, "loading");
  im.onload = () => { cache.set(url, im); onLoad?.(); };
  im.onerror = () => cache.set(url, "error");
  im.src = url;
  return null;
}
export async function loadImg(url: string) {
  const c = cache.get(url);
  if (c instanceof HTMLImageElement) return c;
  return new Promise<HTMLImageElement | null>((res) => { const im = new Image(); im.onload = () => { cache.set(url, im); res(im); }; im.onerror = () => res(null); im.src = url; });
}

/**
 * 모자이크 한 칸: 지금까지 그린 사진(캔버스)을 작게 줄였다가 다시 키워서
 * - pixel: 네모 픽셀 (부드럽게 안 함) · blur: 흐리게 (부드럽게 두 번)
 * 영역은 네모 또는 동그라미로 잘라서 덮음 (돌리기 반영)
 */
function drawMosaic(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, e: ThumbEl, W: number, H: number, sc: number) {
  const w = e.w * W, h = (e.h ?? e.w) * W;
  if (w < 2 || h < 2) return;
  const st = Math.min(100, Math.max(1, e.strength ?? 40));
  const block = e.mosaic === "pixel" ? 6 + st * 0.6 : 3 + st * 0.35; // 1080 기준 픽셀 크기
  const sw = Math.max(1, Math.round((W * sc) / (block * sc))), sh = Math.max(1, Math.round((H * sc) / (block * sc)));
  const small = document.createElement("canvas");
  small.width = sw; small.height = sh;
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  let src: HTMLCanvasElement = small;
  if (e.mosaic !== "pixel") {
    // 한 번 더 줄였다 키워 더 부드럽게
    const mid = document.createElement("canvas");
    mid.width = Math.max(1, sw * 2); mid.height = Math.max(1, sh * 2);
    const m = mid.getContext("2d")!;
    m.imageSmoothingEnabled = true; m.imageSmoothingQuality = "high";
    m.drawImage(small, 0, 0, mid.width, mid.height);
    src = mid;
  }
  ctx.save();
  ctx.translate(e.x * W, e.y * H);
  ctx.rotate(((e.rot ?? 0) * Math.PI) / 180);
  ctx.beginPath();
  if (e.round) ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.08);
  ctx.clip();
  ctx.rotate((-(e.rot ?? 0) * Math.PI) / 180);
  ctx.translate(-e.x * W, -e.y * H);
  ctx.imageSmoothingEnabled = e.mosaic !== "pixel";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, W, H);
  ctx.restore();
}

/** 흑백 스티커: 한 번 바꿔 둔 캔버스를 다시 씀 (모든 브라우저에서 같게 — 밝기 공식으로 직접 바꿈, 투명은 그대로) */
const grayCache = new Map<string, HTMLCanvasElement>();
function grayOf(img: HTMLImageElement, key: string) {
  const hit = grayCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const x = c.getContext("2d")!;
  x.drawImage(img, 0, 0);
  try {
    const d = x.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) { const v = Math.round(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114); p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
  } catch { /* 다른 사이트 사진이면 그대로 */ }
  grayCache.set(key, c);
  return c;
}

export type Box = { id: string; cx: number; cy: number; w: number; h: number; rot: number };

function sparkle(ctx: CanvasRenderingContext2D, r: number) {
  // 네 꼭짓점 반짝이 (가운데로 오목하게 휜 별)
  const k = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(k, -k, r, 0);
  ctx.quadraticCurveTo(k, k, 0, r);
  ctx.quadraticCurveTo(-k, k, -r, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -r);
  ctx.closePath();
}
function heart(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.05, 0, -r * 0.42);
  ctx.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.85);
  ctx.closePath();
}
function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath();
}

function textLines(ctx: CanvasRenderingContext2D, e: ThumbEl) {
  ctx.font = `${e.bold ? 700 : 400} ${e.size ?? 80}px '${fontFamily(e.font)}', 'Noto Sans KR', sans-serif`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${e.letter ?? 0}px`;
  const lines = String(e.text ?? "").split("\n");
  const widths = lines.map((l) => ctx.measureText(l || " ").width);
  const lh = (e.size ?? 80) * (e.lineHeight ?? 1.15);
  const pad = (e.strokeW ?? 0) + (e.bg ? (e.size ?? 80) * 0.25 : 0);
  return { lines, widths, lh, w: Math.max(10, ...widths) + pad * 2, h: lh * lines.length + pad * 2, pad };
}

/**
 * 그리기. scale = 캔버스 픽셀 / 1080. 각 요소의 화면 위치(Box, 1080 기준)를 돌려줌 → 보드에서 고르기·끌기에 사용
 * placeholder: 빈 캐릭터 자리를 점선으로 보여 줄지 (PNG 저장 땐 끔)
 */
export function drawThumb(canvas: HTMLCanvasElement, doc: ThumbDoc, photo: HTMLImageElement | null, opts: { placeholder?: boolean; onImg?: () => void } = {}): Box[] {
  const W = THUMB_W, H = thumbH(doc.ratio);
  const ctx = canvas.getContext("2d")!;
  const sc = canvas.width / W;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f3f0f4";
  ctx.fillRect(0, 0, W, H);
  // 사진: 꽉 채우기(cover) + 확대·위치
  if (photo) {
    const base = Math.max(W / photo.width, H / photo.height) * (doc.photo.zoom || 1);
    const pw = photo.width * base, ph = photo.height * base;
    const px = (W - pw) * (doc.photo.x ?? 0.5), py = (H - ph) * (doc.photo.y ?? 0.5);
    ctx.drawImage(photo, px, py, pw, ph);
  }
  const boxes: Box[] = [];
  // 모자이크: 사진 바로 위에 (스티커·글자는 가리지 않게 먼저 그림)
  for (const e of doc.els) if (e.kind === "mosaic") { drawMosaic(ctx, canvas, e, W, H, sc); boxes.push({ id: e.id, cx: e.x * W, cy: e.y * H, w: e.w * W, h: (e.h ?? e.w) * W, rot: e.rot ?? 0 }); }
  for (const e of doc.els) {
    if (e.kind === "mosaic") continue;
    const cx = e.x * W, cy = e.y * H;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((e.rot ?? 0) * Math.PI) / 180);
    if (e.flip) ctx.scale(-1, 1);
    ctx.globalAlpha = e.opacity ?? 1;
    if (e.kind === "text") {
      const m = textLines(ctx, e);
      ctx.textBaseline = "middle";
      ctx.textAlign = e.align ?? "center";
      const left = -m.w / 2 + m.pad, right = m.w / 2 - m.pad;
      const ax = e.align === "left" ? left : e.align === "right" ? right : 0;
      if (e.bg) { ctx.fillStyle = e.bg; const r = (e.size ?? 80) * 0.25; ctx.beginPath(); ctx.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, r); ctx.fill(); }
      m.lines.forEach((line, i) => {
        const y = -m.h / 2 + m.pad + m.lh * (i + 0.5);
        if (e.shadow) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = (e.size ?? 80) * 0.15; ctx.shadowOffsetY = (e.size ?? 80) * 0.05; ctx.fillStyle = e.color ?? "#222"; ctx.fillText(line, ax, y); ctx.restore(); }
        if (e.stroke && (e.strokeW ?? 0) > 0) { ctx.lineJoin = "round"; ctx.miterLimit = 2; ctx.strokeStyle = e.stroke; ctx.lineWidth = (e.strokeW ?? 0) * 2; ctx.strokeText(line, ax, y); }
        ctx.fillStyle = e.color ?? "#222";
        ctx.fillText(line, ax, y);
      });
      boxes.push({ id: e.id, cx, cy, w: m.w, h: m.h, rot: e.rot ?? 0 });
    } else if (e.kind === "sticker") {
      const img = e.src ? getImg(e.src, opts.onImg) : null;
      const w = e.w * W;
      const h = img ? (w * img.height) / img.width : w;
      if (img) ctx.drawImage(e.gray ? grayOf(img, e.src!) : img, -w / 2, -h / 2, w, h);
      else if (opts.placeholder) {
        ctx.setLineDash([14, 10]); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(240,122,143,0.9)"; ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 24); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#c2185b"; ctx.font = `700 ${Math.max(22, w * 0.11)}px 'Noto Sans KR', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e.slot ? `${e.slot} 자리` : "스티커 자리", 0, 0);
      }
      boxes.push({ id: e.id, cx, cy, w, h, rot: e.rot ?? 0 });
    } else {
      const r = (e.w * W) / 2;
      ctx.fillStyle = e.fill ?? "#ffd84d";
      if (e.shape === "heart") heart(ctx, r); else if (e.shape === "star") star(ctx, r); else if (e.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); } else sparkle(ctx, r);
      ctx.fill();
      boxes.push({ id: e.id, cx, cy, w: r * 2, h: r * 2, rot: e.rot ?? 0 });
    }
    ctx.restore();
  }
  return boxes;
}

/** PNG 만들기 (1080 기준 크기 그대로) */
export async function thumbPng(doc: ThumbDoc, photoUrl: string): Promise<Blob> {
  await ensureFonts(doc);
  const photo = photoUrl ? await loadImg(photoUrl) : null;
  await Promise.all(doc.els.filter((e) => e.kind === "sticker" && e.src).map((e) => loadImg(e.src!)));
  const c = document.createElement("canvas");
  c.width = THUMB_W; c.height = thumbH(doc.ratio);
  drawThumb(c, doc, photo, { placeholder: false });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG를 만들지 못했어요."))), "image/png"));
}
