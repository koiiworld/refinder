// 🧩 목업(가짜 앱 화면) · 마우스 커서 그리기 — 미리보기와 MP4가 같이 씀
// 시간 기준: 요소의 motion.delay 부터 motion.dur 동안 안쪽 움직임이 진행 (t = 초)
import type { El } from "@/lib/carousel-scene";

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeIO = (x: number) => { const c = clamp(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
const FONT = `"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k); ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath();
}
function card(ctx: CanvasRenderingContext2D, el: El, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.shadowColor = "rgba(16,24,40,0.18)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = el.fill || "#ffffff"; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
}
/** 회색 막대 (스켈레톤) — 반짝이는 빛이 지나감 */
function skel(ctx: CanvasRenderingContext2D, el: El, x: number, y: number, w: number, h: number, t: number) {
  ctx.fillStyle = el.mark || "#e3e6eb"; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  const sweep = ((t * 0.6) % 1.4) - 0.2;
  const g = ctx.createLinearGradient(x + w * (sweep - 0.2), 0, x + w * (sweep + 0.2), 0);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
}
function label(ctx: CanvasRenderingContext2D, el: El, text: string, x: number, y: number, size: number, maxW: number, weight = 700, color?: string) {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color || el.color || "#16181d"; ctx.textBaseline = "middle";
  let s = text;
  while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + "…";
  ctx.fillText(s, x, y);
}
/** 줄 하나: 글자가 있고 회색 막대 모드가 아니면 글자, 아니면 막대 */
function line(ctx: CanvasRenderingContext2D, el: El, i: number, x: number, y: number, w: number, h: number, t: number, size: number) {
  const txt = el.items?.[i] ?? "";
  if (txt && !el.skel) label(ctx, el, txt, x, y + h / 2, size, w, 600);
  else skel(ctx, el, x, y + h * 0.2, w * (0.55 + ((i * 37) % 40) / 100), h * 0.6, t);
}
function check(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, p: number, color: string) {
  // ✓ 가 쓱 그어짐
  const pts: [number, number][] = [[cx - s * 0.32, cy + s * 0.02], [cx - s * 0.08, cy + s * 0.26], [cx + s * 0.34, cy - s * 0.22]];
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  let d = (l1 + l2) * clamp(p);
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  if (d <= l1) { ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * (d / l1), pts[0][1] + (pts[1][1] - pts[0][1]) * (d / l1)); }
  else { ctx.lineTo(...pts[1]); d -= l1; ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * (d / l2), pts[1][1] + (pts[2][1] - pts[1][1]) * (d / l2)); }
  ctx.stroke();
}
function icon(ctx: CanvasRenderingContext2D, kind: "search" | "bell" | "user" | "lock", cx: number, cy: number, s: number, color: string) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.12; ctx.lineCap = "round";
  if (kind === "search") { ctx.beginPath(); ctx.arc(cx - s * 0.08, cy - s * 0.08, s * 0.28, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + s * 0.13, cy + s * 0.13); ctx.lineTo(cx + s * 0.36, cy + s * 0.36); ctx.stroke(); }
  if (kind === "bell") { ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy + s * 0.18); ctx.quadraticCurveTo(cx - s * 0.24, cy - s * 0.42, cx, cy - s * 0.42); ctx.quadraticCurveTo(cx + s * 0.24, cy - s * 0.42, cx + s * 0.32, cy + s * 0.18); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
  if (kind === "user") { ctx.beginPath(); ctx.arc(cx, cy - s * 0.14, s * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.42, s * 0.36, Math.PI, 0); ctx.fill(); }
  if (kind === "lock") { rr(ctx, cx - s * 0.3, cy - s * 0.05, s * 0.6, s * 0.45, s * 0.08); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy - s * 0.08, s * 0.2, Math.PI, 0); ctx.stroke(); }
}

export function drawMockup(ctx: CanvasRenderingContext2D, el: El, t: number) {
  const { x, y, w, h } = el, r = el.radius ?? 28;
  const m = el.motion ?? { delay: 0, dur: 2.4 };
  const lt = Math.max(0, t - m.delay); // 목업 안쪽 시간
  const P = (k: number, n: number, span = 0.8) => clamp((lt / Math.max(0.5, m.dur || 2.4)) * (n + span) - k); // k번째가 차례로 진행
  const acc = el.stroke || "#3355ff", ink = el.color || "#16181d", n = Math.max(1, el.items?.length ?? 3);
  const pad = Math.max(24, w * 0.05), fs = Math.max(20, Math.min(44, h * 0.07));
  switch (el.variant) {
    case "browser": {
      card(ctx, el, x, y, w, h, r);
      const bar = Math.max(44, h * 0.11);
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      ctx.fillStyle = el.mark || "#e3e6eb"; ctx.globalAlpha *= 0.45; ctx.fillRect(x, y, w, bar); ctx.globalAlpha /= 0.45;
      ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + pad + i * bar * 0.42, y + bar / 2, bar * 0.13, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = el.fill || "#fff"; rr(ctx, x + pad + bar * 1.4, y + bar * 0.22, w - pad * 2 - bar * 1.4, bar * 0.56, bar * 0.28); ctx.fill();
      if (el.title) label(ctx, el, el.title, x + pad + bar * 1.7, y + bar / 2, bar * 0.36, w - pad * 2 - bar * 2, 500, "#646b78"); else icon(ctx, "lock", x + pad + bar * 1.75, y + bar / 2, bar * 0.4, "#9aa2b1");
      const top = y + bar + pad;
      skel(ctx, el, x + pad, top, w * 0.5, fs * 0.9, lt);
      const imgH = (h - bar - pad * 3 - fs * 1.4) * 0.45;
      ctx.fillStyle = acc; ctx.globalAlpha *= 0.16; rr(ctx, x + pad, top + fs * 1.4, w - pad * 2, imgH, 16); ctx.fill(); ctx.globalAlpha /= 0.16;
      const rowH = Math.max(28, (h - (top - y) - fs * 1.4 - imgH - pad * 2) / Math.max(n, 3));
      for (let i = 0; i < n; i++) { const a = ease(P(i, n)); ctx.globalAlpha *= a; line(ctx, el, i, x + pad, top + fs * 1.4 + imgH + pad * 0.6 + i * rowH, w - pad * 2, rowH * 0.7, lt, fs * 0.8); ctx.globalAlpha /= a || 1; }
      ctx.restore();
      break;
    }
    case "phone": {
      card(ctx, el, x, y, w, h, Math.min(r * 2, w * 0.12));
      ctx.fillStyle = ink; rr(ctx, x + w * 0.38, y + h * 0.02, w * 0.24, h * 0.025, h * 0.0125); ctx.fill();
      if (el.title) label(ctx, el, el.title, x + pad, y + h * 0.09, fs, w - pad * 2, 800); else skel(ctx, el, x + pad, y + h * 0.07, w * 0.4, fs * 0.8, lt);
      const rowH = (h * 0.8) / Math.max(n, 4);
      for (let i = 0; i < n; i++) {
        const a = ease(P(i, n)), ry = y + h * 0.15 + i * rowH + (1 - a) * 30;
        ctx.globalAlpha *= a;
        ctx.fillStyle = acc; ctx.globalAlpha *= 0.25; ctx.beginPath(); ctx.arc(x + pad + rowH * 0.3, ry + rowH * 0.4, rowH * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.25;
        line(ctx, el, i, x + pad + rowH * 0.75, ry + rowH * 0.12, w - pad * 2 - rowH * 0.8, rowH * 0.36, lt, fs * 0.75);
        skel(ctx, el, x + pad + rowH * 0.75, ry + rowH * 0.5, (w - pad * 2 - rowH) * 0.5, rowH * 0.16, lt);
        ctx.globalAlpha /= a || 1;
      }
      break;
    }
    case "checklist": {
      card(ctx, el, x, y, w, h, r);
      const head = el.title ? fs * 1.8 : pad;
      if (el.title) label(ctx, el, el.title, x + pad, y + pad + fs * 0.6, fs * 1.05, w - pad * 2, 800);
      const rowH = (h - head - pad * 1.5) / n;
      for (let i = 0; i < n; i++) {
        const p = P(i, n), ry = y + head + pad * 0.5 + i * rowH, bs = Math.min(rowH * 0.6, 56);
        const done = p > 0.05;
        ctx.lineWidth = 4; ctx.strokeStyle = done ? acc : el.mark || "#e3e6eb"; ctx.fillStyle = done ? acc : "transparent";
        rr(ctx, x + pad, ry + (rowH - bs) / 2, bs, bs, bs * 0.25); if (done) ctx.fill(); else ctx.stroke();
        if (done) check(ctx, x + pad + bs / 2, ry + rowH / 2, bs, ease(p * 1.6), "#ffffff");
        ctx.globalAlpha *= done ? 1 : 0.6;
        line(ctx, el, i, x + pad + bs + pad * 0.6, ry + rowH * 0.2, w - pad * 3 - bs, rowH * 0.6, lt, Math.min(fs, rowH * 0.42));
        ctx.globalAlpha /= done ? 1 : 0.6;
      }
      break;
    }
    case "toggle": {
      card(ctx, el, x, y, w, h, r);
      const head = el.title ? fs * 1.8 : pad;
      if (el.title) label(ctx, el, el.title, x + pad, y + pad + fs * 0.6, fs * 1.05, w - pad * 2, 800);
      const rowH = (h - head - pad * 1.5) / n;
      for (let i = 0; i < n; i++) {
        const p = ease(P(i, n) * 2), ry = y + head + pad * 0.5 + i * rowH, th = Math.min(rowH * 0.5, 54), tw = th * 1.8;
        line(ctx, el, i, x + pad, ry + rowH * 0.2, w - pad * 3 - tw, rowH * 0.6, lt, Math.min(fs, rowH * 0.42));
        const tx = x + w - pad - tw, ty = ry + (rowH - th) / 2;
        ctx.fillStyle = el.mark || "#e3e6eb"; rr(ctx, tx, ty, tw, th, th / 2); ctx.fill();
        ctx.fillStyle = acc; ctx.globalAlpha *= p; rr(ctx, tx, ty, tw, th, th / 2); ctx.fill(); ctx.globalAlpha /= p || 1;
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(tx + th / 2 + (tw - th) * p, ty + th / 2, th * 0.4, 0, Math.PI * 2); ctx.fill();
        if (i < n - 1) { ctx.fillStyle = el.mark || "#e3e6eb"; ctx.fillRect(x + pad, ry + rowH - 1, w - pad * 2, 2); }
      }
      break;
    }
    case "chat": {
      if (el.title) { card(ctx, el, x, y, w, h, r); label(ctx, el, el.title, x + pad, y + pad + fs * 0.4, fs, w - pad * 2, 800); }
      const top = y + (el.title ? fs * 1.8 : 0), bh = Math.min(fs * 2.2, (h - (top - y)) / n - 12);
      for (let i = 0; i < n; i++) {
        const a = ease(P(i, n)), me = i % 2 === 1, bw = w * (0.55 + ((i * 23) % 25) / 100) - pad;
        const bx = me ? x + w - pad - bw : x + pad, by = top + pad * 0.5 + i * (bh + 14);
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(bx + (me ? bw : 0), by + bh); ctx.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a); ctx.translate(-(bx + (me ? bw : 0)), -(by + bh));
        ctx.fillStyle = me ? acc : el.fill || "#ffffff"; ctx.shadowColor = "rgba(16,24,40,0.12)"; ctx.shadowBlur = 16; rr(ctx, bx, by, bw, bh, bh * 0.4); ctx.fill(); ctx.shadowBlur = 0;
        const txt = el.items?.[i] ?? "";
        if (txt && !el.skel) label(ctx, el, txt, bx + pad * 0.6, by + bh / 2, Math.min(fs * 0.85, bh * 0.45), bw - pad * 1.2, 600, me ? "#ffffff" : ink);
        else { ctx.fillStyle = me ? "rgba(255,255,255,0.55)" : el.mark || "#e3e6eb"; rr(ctx, bx + pad * 0.6, by + bh * 0.38, (bw - pad * 1.2) * 0.8, bh * 0.24, bh * 0.12); ctx.fill(); }
        ctx.restore();
      }
      break;
    }
    case "search": {
      const sh = Math.min(h * 0.2, 110);
      card(ctx, el, x, y, w, sh, sh / 2);
      icon(ctx, "search", x + sh * 0.55, y + sh / 2, sh * 0.5, acc);
      const q = el.items?.[0] || el.title || "검색어";
      const typed = q.slice(0, Math.floor(q.length * clamp(lt / (Math.max(0.5, m.dur) * 0.45))));
      label(ctx, el, typed, x + sh, y + sh / 2, sh * 0.34, w - sh * 1.4, 600);
      if (typed.length < q.length && Math.floor(lt * 2) % 2 === 0) { ctx.font = `600 ${sh * 0.34}px ${FONT}`; ctx.fillStyle = acc; ctx.fillRect(x + sh + ctx.measureText(typed).width + 4, y + sh * 0.3, 4, sh * 0.4); }
      const rows = Math.max(3, n), rowH = (h - sh - pad) / rows;
      for (let i = 0; i < rows; i++) {
        const a = ease(clamp((lt / Math.max(0.5, m.dur) - 0.5) * (rows + 1) - i));
        if (a <= 0) continue;
        ctx.globalAlpha *= a;
        card(ctx, el, x, y + sh + pad * 0.6 + i * rowH, w, rowH - 14, 18);
        skel(ctx, el, x + pad, y + sh + pad * 0.6 + i * rowH + rowH * 0.22, w * 0.55, rowH * 0.18, lt);
        skel(ctx, el, x + pad, y + sh + pad * 0.6 + i * rowH + rowH * 0.5, w * 0.35, rowH * 0.14, lt);
        ctx.globalAlpha /= a;
      }
      break;
    }
    case "progress": {
      card(ctx, el, x, y, w, h, r);
      const cx = x + w / 2, cy = y + h * 0.45, rad = Math.min(w, h) * 0.28, p = ease(clamp(lt / Math.max(0.5, m.dur)));
      ctx.lineWidth = rad * 0.16; ctx.lineCap = "round";
      ctx.strokeStyle = el.mark || "#e3e6eb"; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = acc; ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
      if (p >= 0.999) { ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.62, 0, Math.PI * 2); ctx.fill(); check(ctx, cx, cy, rad * 0.9, clamp((lt - m.dur) / 0.4), "#ffffff"); }
      else { ctx.font = `800 ${rad * 0.42}px ${FONT}`; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`${Math.round(p * 100)}%`, cx, cy); ctx.textAlign = "left"; }
      if (el.title) { ctx.textAlign = "center"; label(ctx, el, el.title, cx, y + h * 0.86, fs, w - pad * 2, 700); ctx.textAlign = "left"; }
      break;
    }
    case "notify": {
      const a = ease(clamp(lt / 0.6)), ny = y - (1 - a) * (h + 60);
      ctx.globalAlpha *= a;
      card(ctx, el, x, ny, w, h, r);
      const is = Math.min(h * 0.55, 90);
      ctx.fillStyle = acc; rr(ctx, x + pad, ny + (h - is) / 2, is, is, is * 0.25); ctx.fill();
      icon(ctx, "bell", x + pad + is / 2, ny + h / 2, is * 0.6, "#ffffff");
      if (el.title) label(ctx, el, el.title, x + pad * 1.6 + is, ny + h * 0.36, Math.min(fs, h * 0.22), w - is - pad * 3, 800);
      else skel(ctx, el, x + pad * 1.6 + is, ny + h * 0.26, w * 0.35, h * 0.16, lt);
      line(ctx, el, 0, x + pad * 1.6 + is, ny + h * 0.5, w - is - pad * 3, h * 0.3, lt, Math.min(fs * 0.85, h * 0.18));
      ctx.globalAlpha /= a || 1;
      break;
    }
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, stroke: string) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y + s); ctx.lineTo(x + s * 0.28, y + s * 0.74); ctx.lineTo(x + s * 0.48, y + s * 1.12); ctx.lineTo(x + s * 0.62, y + s * 1.05); ctx.lineTo(x + s * 0.43, y + s * 0.68); ctx.lineTo(x + s * 0.78, y + s * 0.68); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.07); ctx.strokeStyle = stroke; ctx.lineJoin = "round"; ctx.stroke();
}
/** 🖱️ 커서: (x,y) → (x2,y2)로 움직이고 끝에서 클릭 (잔상 + 퍼지는 원) */
export function drawCursor(ctx: CanvasRenderingContext2D, el: El, t: number | null) {
  const m = el.motion ?? { delay: 0, dur: 1 };
  const s = Math.max(24, el.w);
  const x1 = el.x, y1 = el.y, x2 = el.x2 ?? el.x, y2 = el.y2 ?? el.y;
  const pos = (tt: number) => { const k = easeIO((tt - m.delay) / Math.max(0.2, m.dur)); return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k]; };
  if (t == null) { arrow(ctx, x2, y2, s, el.fill || "#16181d", el.stroke || "#fff"); return; }
  const moving = t > m.delay && t < m.delay + m.dur;
  if (moving) for (let k = 5; k >= 1; k--) { const [gx, gy] = pos(t - k * 0.025); ctx.save(); ctx.globalAlpha *= 0.12 * (6 - k) / 5; arrow(ctx, gx, gy, s, el.fill || "#16181d", "transparent"); ctx.restore(); }
  const [cx, cy] = pos(t);
  const ct = t - (m.delay + m.dur); // 클릭 뒤 시간
  if (el.click !== false && ct > 0 && ct < 0.6) {
    const p = ct / 0.6;
    ctx.save(); ctx.globalAlpha *= 1 - p; ctx.strokeStyle = el.fill || "#16181d"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, s * (0.3 + p * 1.1), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  const press = el.click !== false && ct > 0 && ct < 0.18 ? 0.86 : 1;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(press, press); ctx.translate(-cx, -cy); arrow(ctx, cx, cy, s, el.fill || "#16181d", el.stroke || "#ffffff"); ctx.restore();
}
