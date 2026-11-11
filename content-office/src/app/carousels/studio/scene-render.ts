// 🎞 캐러셀 편집 툴: 한 장을 시간 t(초)에 맞춰 그림 — 미리보기와 MP4 뽑기가 같은 함수를 씀
import { SH, SW, type El, type Scene } from "@/lib/carousel-scene";

export const FONT = `"Noto Sans KR", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeBack = (x: number) => { const c = 1.7, p = clamp(x) - 1; return 1 + (c + 1) * p * p * p + c * p * p; };

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function drawPic(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fit: "cover" | "contain", zoom = 1, pan = 0) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return;
  if (fit === "contain") {
    const r = Math.min(w / iw, h / ih) * zoom;
    ctx.drawImage(img, x + (w - iw * r) / 2 + pan * w * 0.05, y + (h - ih * r) / 2, iw * r, ih * r);
    return;
  }
  const r = Math.max(w / iw, h / ih);
  let sw = w / r / zoom, sh = h / r / zoom;
  const room = (iw - sw) / 2;
  ctx.drawImage(img, (iw - sw) / 2 + room * pan * 0.9, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** ==글자== 형광펜 표시를 빼고, 표시된 글자 위치를 함께 돌려줌 */
function parseMarks(text: string) {
  let out = "";
  const marked: boolean[] = [];
  let on = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "=" && text[i + 1] === "=") { on = !on; i++; continue; }
    out += text[i];
    marked.push(on);
  }
  return { text: out, marked };
}

type Line = { start: number; chars: string[]; widths: number[]; width: number };
/** 글자 줄 나누기 (상자 너비 안에서, 띄어쓰기 우선) */
export function layoutText(ctx: CanvasRenderingContext2D, el: El) {
  const { text, marked } = parseMarks(el.text ?? "");
  ctx.font = `${el.weight ?? 700} ${el.size ?? 60}px ${FONT}`;
  const letter = el.letter ?? 0, max = Math.max(10, el.w);
  const lines: Line[] = [];
  let cur: Line = { start: 0, chars: [], widths: [], width: 0 };
  let lastSpace = -1;
  const push = () => { lines.push(cur); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") { push(); cur = { start: i + 1, chars: [], widths: [], width: 0 }; lastSpace = -1; continue; }
    const cw = ctx.measureText(ch).width + letter;
    if (cur.width + cw > max && cur.chars.length) {
      if (lastSpace > 0 && ch !== " ") {
        // 마지막 띄어쓰기에서 끊기
        const keep = lastSpace + 1;
        const moved = { chars: cur.chars.slice(keep), widths: cur.widths.slice(keep) };
        cur.chars = cur.chars.slice(0, keep); cur.widths = cur.widths.slice(0, keep); cur.width = cur.widths.reduce((a, b) => a + b, 0);
        push();
        cur = { start: cur.start + keep, chars: moved.chars, widths: moved.widths, width: moved.widths.reduce((a, b) => a + b, 0) };
      } else { push(); cur = { start: i, chars: [], widths: [], width: 0 }; }
      lastSpace = -1;
      if (ch === " " && !cur.chars.length) { cur.start = i + 1; continue; }
    }
    if (ch === " ") lastSpace = cur.chars.length;
    cur.chars.push(ch); cur.widths.push(cw); cur.width += cw;
  }
  push();
  const lh = (el.size ?? 60) * (el.lineHeight ?? 1.25);
  return { lines, marked, lh, height: lines.length * lh, total: text.length };
}

function motionState(el: El, t: number, dur: number) {
  const m = el.motion ?? { id: "none", delay: 0, dur: 0 };
  const p = m.dur > 0 ? clamp((t - m.delay) / m.dur) : t >= m.delay ? 1 : 0;
  const s = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, p, id: m.id, zoom: 1, pan: 0 };
  const e = easeOut(p);
  switch (m.id) {
    case "fade": s.alpha = e; break;
    case "rise": s.alpha = e; s.dy = (1 - e) * 60; break;
    case "slideLeft": s.alpha = e; s.dx = -(1 - e) * 200; break;
    case "slideRight": s.alpha = e; s.dx = (1 - e) * 200; break;
    case "zoomIn": s.alpha = e; s.scale = 0.6 + 0.4 * e; break;
    case "pop": s.alpha = clamp(p * 3); s.scale = p >= 1 ? 1 : Math.max(0.01, easeBack(p)); break;
    case "drop": { s.alpha = clamp(p * 3); const b = p < 1 ? Math.abs(Math.cos(p * Math.PI * 1.5)) * (1 - p) : 0; s.dy = -(1 - e) * 260 - b * 40; break; }
    case "float": s.dy = t >= m.delay ? Math.sin(((t - m.delay) / Math.max(0.4, m.dur || 1.6)) * Math.PI * 2) * 12 : 0; break;
    case "pulse": s.scale = t >= m.delay ? 1 + Math.sin(((t - m.delay) / Math.max(0.4, m.dur || 1.2)) * Math.PI * 2) * 0.05 : 1; break;
    case "shake": s.rot = p < 1 && t >= m.delay ? Math.sin(p * Math.PI * 8) * 6 * (1 - p) : 0; break;
    case "twinkle": { const k = t >= m.delay ? (Math.sin(((t - m.delay) / Math.max(0.3, m.dur || 1.2)) * Math.PI * 2) + 1) / 2 : 1; s.alpha = 0.35 + 0.65 * k; s.scale = 0.85 + 0.15 * k; break; }
    case "kenburns": s.zoom = 1 + 0.12 * clamp(t / Math.max(1, dur)); break;
    case "panLeft": s.zoom = 1.12; s.pan = 1 - 2 * clamp(t / Math.max(1, dur)); break;
    case "panRight": s.zoom = 1.12; s.pan = -(1 - 2 * clamp(t / Math.max(1, dur))); break;
    // 글자 효과(typewriter·karaoke·bounceChars·strike·highlight·underline)는 글자 그릴 때
  }
  return s;
}

function drawText(ctx: CanvasRenderingContext2D, el: El, st: ReturnType<typeof motionState>, t: number) {
  const L = layoutText(ctx, el);
  const size = el.size ?? 60, mark = el.mark || "#ffd84d";
  const lineX = (w: number) => (el.align === "center" ? el.x + (el.w - w) / 2 : el.align === "right" ? el.x + el.w - w : el.x);
  const p = st.p, id = st.id;
  const shown = id === "typewriter" ? Math.floor(L.total * clamp(p)) : Infinity;
  // 글자 바탕
  if (el.textBg) {
    ctx.fillStyle = el.textBg;
    for (const [i, ln] of L.lines.entries()) if (ln.chars.length) { rr(ctx, lineX(ln.width) - size * 0.25, el.y + i * L.lh - size * 0.08, ln.width + size * 0.5, L.lh + size * 0.04, size * 0.2); ctx.fill(); }
  }
  // 형광펜 효과(문장 밑이 왼쪽부터 칠해짐) 또는 ==표시== 글자
  const hiP = id === "highlight" ? easeOut(p) : 1;
  ctx.fillStyle = mark;
  for (const [i, ln] of L.lines.entries()) {
    let x = lineX(ln.width);
    if (id === "highlight") { ctx.globalAlpha *= 0.55; rr(ctx, x - 6, el.y + i * L.lh + L.lh * 0.45, (ln.width + 12) * hiP, L.lh * 0.42, 6); ctx.fill(); ctx.globalAlpha /= 0.55; continue; }
    for (let k = 0; k < ln.chars.length; k++) {
      if (L.marked[ln.start + k] && ln.start + k < shown) { ctx.globalAlpha *= 0.55; ctx.fillRect(x - 1, el.y + i * L.lh + L.lh * 0.45, ln.widths[k] + 2, L.lh * 0.42); ctx.globalAlpha /= 0.55; }
      x += ln.widths[k];
    }
  }
  ctx.font = `${el.weight ?? 700} ${size}px ${FONT}`;
  ctx.textBaseline = "top";
  if (el.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.06; }
  const words: number[] = []; // 단어 번호 (karaoke)
  { let w = 0; const flat = L.lines.flatMap((l) => l.chars); flat.forEach((c, i) => { if (c === " " && i > 0 && flat[i - 1] !== " ") w++; words.push(w); }); }
  const totalWords = (words[words.length - 1] ?? 0) + 1;
  let idx = 0;
  for (const [i, ln] of L.lines.entries()) {
    let x = lineX(ln.width);
    const y0 = el.y + i * L.lh + (L.lh - size) / 2;
    for (let k = 0; k < ln.chars.length; k++, idx++) {
      if (idx >= shown) break;
      let dy = 0;
      if (id === "bounceChars") { const q = clamp((p * (L.total + 6) - idx) / 6); dy = q < 1 ? -Math.sin(q * Math.PI) * size * 0.35 : 0; if (q <= 0) { x += ln.widths[k]; continue; } }
      let col = el.color ?? "#16181d";
      if (id === "karaoke" && words[idx] < Math.floor(p * totalWords + 0.0001)) col = mark;
      ctx.fillStyle = col;
      ctx.fillText(ln.chars[k], x, y0 + dy);
      x += ln.widths[k];
    }
    if (id === "typewriter" && idx >= shown && shown < L.total && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = el.color ?? "#16181d"; ctx.fillRect(x + 2, y0, Math.max(3, size * 0.06), size); break; }
  }
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // 밑줄·취소선 (왼쪽에서 오른쪽으로 그어짐)
  if (id === "underline" || id === "strike") {
    ctx.fillStyle = id === "strike" ? (el.mark || "#e53935") : mark;
    for (const [i, ln] of L.lines.entries()) {
      const x = lineX(ln.width), y = el.y + i * L.lh + (id === "strike" ? L.lh * 0.52 : L.lh * 0.92);
      ctx.fillRect(x, y, ln.width * easeOut(p), Math.max(4, size * 0.08));
    }
  }
}

function sparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rad = i % 2 === 0 ? r : r * 0.22;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawBackground(ctx: CanvasRenderingContext2D, scene: Scene, t: number, imgs: (HTMLImageElement | null)[]) {
  const bg = scene.bg;
  if (bg.color2) { const g = ctx.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2); ctx.fillStyle = g; }
  else ctx.fillStyle = bg.color || "#ffffff";
  ctx.fillRect(0, 0, SW, SH);
  const img = bg.image != null ? imgs[bg.image] : null;
  if (img) {
    ctx.save();
    if (bg.blur) ctx.filter = `blur(${bg.blur}px)`;
    const z = bg.kenburns ? 1 + 0.1 * clamp(t / Math.max(1, scene.dur)) : 1;
    const pad = bg.blur ? bg.blur * 2 : 0;
    drawPic(ctx, img, -pad, -pad, SW + pad * 2, SH + pad * 2, "cover", z);
    ctx.restore();
  }
  if (bg.dim) { ctx.fillStyle = `rgba(0,0,0,${bg.dim})`; ctx.fillRect(0, 0, SW, SH); }
  if (bg.pattern === "grid") { ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 2; for (let x = 0; x <= SW; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); } for (let y = 0; y <= SH; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); } }
  if (bg.pattern === "dots") { ctx.fillStyle = "rgba(0,0,0,0.08)"; for (let x = 27; x < SW; x += 54) for (let y = 27; y < SH; y += 54) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); } }
  if (bg.pattern === "stripes") { ctx.fillStyle = "rgba(0,0,0,0.04)"; for (let x = 0; x < SW; x += 72) ctx.fillRect(x, 0, 36, SH); }
  if (bg.glow) { const g = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.35, SW / 2, SH / 2, SH * 0.8); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.55)"); ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH); }
}

/** 한 장 그리기. t = 초 (null = 다 나타난 최종 모습) */
export function drawScene(canvas: HTMLCanvasElement, scene: Scene, t: number | null, imgs: (HTMLImageElement | null)[]) {
  if (canvas.width !== SW) canvas.width = SW;
  if (canvas.height !== SH) canvas.height = SH;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.clearRect(0, 0, SW, SH);
  const time = t ?? 9999;
  drawBackground(ctx, scene, t ?? 0, imgs);
  for (const el of scene.els) {
    if (el.hidden) continue;
    const st = t == null ? { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, p: 1, id: el.motion?.id ?? "none", zoom: 1, pan: 0 } : motionState(el, time, scene.dur);
    if (t == null && ["float", "pulse", "twinkle", "shake"].includes(st.id)) st.id = "none";
    if (st.alpha <= 0.001 && el.type !== "text") continue;
    ctx.save();
    ctx.globalAlpha = el.opacity * st.alpha;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    ctx.translate(cx + st.dx, cy + st.dy);
    ctx.rotate(((el.rot + st.rot) * Math.PI) / 180);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-cx, -cy);
    if (el.type === "text") { if (st.alpha > 0.001 || st.id === "typewriter") drawText(ctx, el, st, time); }
    else if (el.type === "image") {
      const img = el.image != null ? imgs[el.image] : null;
      rr(ctx, el.x, el.y, el.w, el.h, el.radius ?? 0); ctx.save(); ctx.clip();
      if (img) drawPic(ctx, img, el.x, el.y, el.w, el.h, el.fit ?? "cover", st.zoom, st.pan);
      else { ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(el.x, el.y, el.w, el.h); }
      ctx.restore();
    } else if (el.type === "rect" || el.type === "line") {
      ctx.fillStyle = el.fill || "#ffffff";
      const w = el.type === "line" && ["slideLeft"].includes(st.id) ? el.w : el.w;
      rr(ctx, el.x, el.y, w, el.h, el.type === "line" ? el.h / 2 : el.radius ?? 0); ctx.fill();
      if (el.stroke && el.strokeW) { ctx.strokeStyle = el.stroke; ctx.lineWidth = el.strokeW; ctx.stroke(); }
    } else if (el.type === "circle") {
      ctx.beginPath(); ctx.ellipse(cx, cy, el.w / 2, el.h / 2, 0, 0, Math.PI * 2); ctx.fillStyle = el.fill || "#ffffff"; ctx.fill();
      if (el.stroke && el.strokeW) { ctx.strokeStyle = el.stroke; ctx.lineWidth = el.strokeW; ctx.stroke(); }
    } else if (el.type === "sparkle") { ctx.fillStyle = el.fill || "#ffd84d"; sparkle(ctx, cx, cy, Math.min(el.w, el.h) / 2); }
    ctx.restore();
  }
}
