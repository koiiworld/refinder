// 캐러셀 한 장을 1080×1350(인스타 세로 4:5) 캔버스에 그림 — 미리보기와 저장에 같은 함수를 써서 보이는 그대로 저장
import { cleanRecipe } from "@/lib/carousel-design-types";
import type { CarouselStyle, Slide } from "@/lib/carousel";

export const W = 1080;
export const H = 1350;
export const FONT = `"Noto Sans KR", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

/** 🎞 모션 캐러셀: 사진 움직임 종류 */
export type MotionEffect = "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "still";
export const MOTION_EFFECTS: { id: MotionEffect; label: string }[] = [
  { id: "zoomIn", label: "천천히 확대" },
  { id: "zoomOut", label: "천천히 축소" },
  { id: "panLeft", label: "왼쪽으로 이동" },
  { id: "panRight", label: "오른쪽으로 이동" },
  { id: "still", label: "사진 고정 (글자만 움직임)" },
];
/** 지금 그리는 프레임의 진행도 (null = 일반 사진 저장) */
let motion: { t: number; sec: number; effect: MotionEffect; text: number; textAnim: boolean } | null = null;
/** 카드 그림: 사진 또는 AI 영상의 지금 프레임 */
export type Pic = HTMLImageElement | HTMLVideoElement;
const picSize = (p: Pic) => (p instanceof HTMLVideoElement ? [p.videoWidth, p.videoHeight] : [p.naturalWidth, p.naturalHeight]);
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** 글자 너비에 맞춰 줄바꿈 (띄어쓰기 우선, 긴 단어는 글자 단위) */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const test = line + word;
      if (ctx.measureText(test).width <= max) {
        line = test;
        continue;
      }
      if (line.trim()) out.push(line.trim());
      line = "";
      // 한 단어가 너무 길면 글자 단위로
      for (const ch of word.trimStart()) {
        if (ctx.measureText(line + ch).width > max && line) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
    }
    out.push(line.trim());
  }
  return out.filter((l, i, a) => l || (i > 0 && i < a.length - 1));
}

/** 줄 수가 넘치면 글자 크기를 줄여 맞춤 */
function fitLines(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number, maxLines: number) {
  let s = size;
  for (; s > 28; s -= 4) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    const lines = wrap(ctx, text, max);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  ctx.font = `${weight} ${s}px ${FONT}`;
  return { lines: wrap(ctx, text, max).slice(0, maxLines), size: s };
}

function cover(ctx: CanvasRenderingContext2D, img: Pic, x: number, y: number, w: number, h: number) {
  const [nw, nh] = picSize(img);
  if (!nw || !nh) return;
  const r = Math.max(w / nw, h / nh);
  let sw = w / r, sh = h / r, dx = 0;
  if (motion && motion.effect !== "still") {
    // 사진 영역 안에서만 움직임 (테두리·모양은 그대로)
    const t = motion.t, z = motion.effect === "zoomIn" ? 1 + 0.14 * t : motion.effect === "zoomOut" ? 1.14 - 0.14 * t : 1.12;
    sw /= z; sh /= z;
    const room = (nw - sw) / 2;
    if (motion.effect === "panLeft") dx = room * (1 - 2 * t) * 0.9;
    if (motion.effect === "panRight") dx = -room * (1 - 2 * t) * 0.9;
  }
  ctx.drawImage(img, (nw - sw) / 2 + dx, (nh - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 사진 없는 카드: 글자 묶음을 세로 가운데에 */
function centered(ctx: CanvasRenderingContext2D, slide: Slide, opt: { weight: number; size: number; color: string; bodyColor: string; accent: string | null; maxLines: number }) {
  const pad = 88;
  const head = fitLines(ctx, slide.headline, opt.weight, opt.size, W - pad * 2, opt.maxLines);
  const bs = 46;
  ctx.font = `500 ${bs}px ${FONT}`;
  const body = slide.body ? wrap(ctx, slide.body, W - pad * 2).slice(0, 8) : [];
  const blockH = head.lines.length * head.size * 1.2 + (body.length ? 40 + body.length * bs * 1.45 : 0);
  let y = Math.max(200, (H - blockH) / 2 - 20);
  if (opt.accent) {
    ctx.fillStyle = opt.accent;
    ctx.fillRect(pad, y - 44, 84, 12);
  }
  ctx.fillStyle = opt.color;
  ctx.font = `${opt.weight} ${head.size}px ${FONT}`;
  y = drawText(ctx, head.lines, pad, y, head.size, 1.2);
  if (body.length) {
    ctx.fillStyle = opt.bodyColor;
    ctx.font = `500 ${bs}px ${FONT}`;
    drawText(ctx, body, pad, y + 40, bs, 1.45);
  }
}

function drawText(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, size: number, lineH = 1.25) {
  if (motion?.textAnim) {
    // 제목 → 본문 순서로 아래에서 살짝 올라오며 나타남
    const k = motion.text++;
    const a = ease((motion.sec - 0.15 - k * 0.35) / 0.8);
    ctx.save();
    ctx.globalAlpha *= a;
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineH + (1 - a) * 46));
    ctx.restore();
  } else lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineH));
  return y + lines.length * size * lineH;
}

/** 모션 영상의 한 프레임 (t: 0~1). 끝나면 일반 그리기로 돌아감 */
export function renderMotionFrame(canvas: HTMLCanvasElement, slide: Slide, index: number, total: number, img: Pic | null, style: CarouselStyle, t: number, seconds: number, effect: MotionEffect, textAnim = false) {
  motion = { t, sec: t * seconds, effect, text: 0, textAnim };
  try {
    renderSlide(canvas, slide, index, total, img, style);
  } finally {
    motion = null;
  }
}

export function renderSlide(canvas: HTMLCanvasElement, slide: Slide, index: number, total: number, img: Pic | null, style: CarouselStyle) {
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  if (style.design) { renderLearned(ctx, slide, index, total, img, style); return; }
  const accent = style.accent || "#ff6b35";
  const pad = 88;
  const big = slide.kind === "cover";
  const cta = slide.kind === "cta";
  const template = style.template === "photo" && !img ? "bold" : style.template;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let dark = false;

  if (template === "photo" && img) {
    cover(ctx, img, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, "rgba(0,0,0,0.62)");
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    dark = true;
    const head = fitLines(ctx, slide.headline, 800, big ? 104 : 80, W - pad * 2, big ? 3 : 3);
    ctx.font = `500 ${big ? 44 : 42}px ${FONT}`;
    const body = slide.body ? wrap(ctx, slide.body, W - pad * 2).slice(0, 4) : [];
    const bodySize = big ? 44 : 42;
    const blockH = head.lines.length * head.size * 1.22 + (body.length ? 28 + body.length * bodySize * 1.4 : 0);
    let y = H - 150 - blockH;
    ctx.fillStyle = accent;
    ctx.fillRect(pad, y - 34, 84, 10);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${head.size}px ${FONT}`;
    y = drawText(ctx, head.lines, pad, y, head.size, 1.22);
    if (body.length) {
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = `500 ${bodySize}px ${FONT}`;
      drawText(ctx, body, pad, y + 28, bodySize, 1.4);
    }
  } else if (template === "clean") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (!img) {
      // 마무리(저장·태그) 장은 강조색 배경으로 눈에 띄게
      if (cta) {
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, W, H);
        dark = true;
        centered(ctx, slide, { weight: 900, size: 100, color: "#fff", bodyColor: "rgba(255,255,255,0.92)", accent: null, maxLines: 4 });
      } else centered(ctx, slide, { weight: 800, size: big ? 110 : 84, color: "#14161a", bodyColor: "#4a4f57", accent, maxLines: 5 });
    } else {
    const ih = big ? 760 : 620;
    ctx.save();
    roundRect(ctx, pad, pad, W - pad * 2, ih, 36);
    ctx.clip();
    cover(ctx, img, pad, pad, W - pad * 2, ih);
    ctx.restore();
    let y = pad + ih + 64;
    ctx.fillStyle = accent;
    ctx.fillRect(pad, y - 30, 84, 10);
    const head = fitLines(ctx, slide.headline, 800, big ? 92 : 72, W - pad * 2, 2);
    ctx.fillStyle = "#14161a";
    ctx.font = `800 ${head.size}px ${FONT}`;
    y = drawText(ctx, head.lines, pad, y, head.size, 1.22);
    if (slide.body) {
      ctx.fillStyle = "#4a4f57";
      const bs = img ? 40 : 46;
      ctx.font = `500 ${bs}px ${FONT}`;
      drawText(ctx, wrap(ctx, slide.body, W - pad * 2).slice(0, img ? 4 : 8), pad, y + 26, bs, 1.45);
    }
    }
  } else if (!img) {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, H);
    dark = true;
    centered(ctx, slide, { weight: 900, size: big ? 124 : cta ? 100 : 88, color: "#fff", bodyColor: "rgba(255,255,255,0.92)", accent: null, maxLines: 5 });
  } else {
    // bold: 컬러 배경 + 큰 글씨 (사진이 있으면 위쪽에 둥근 사진)
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, H);
    dark = true;
    let y = big ? 300 : 220;
    if (img && !big) {
      ctx.save();
      roundRect(ctx, pad, pad + 40, W - pad * 2, 520, 32);
      ctx.clip();
      cover(ctx, img, pad, pad + 40, W - pad * 2, 520);
      ctx.restore();
      y = pad + 40 + 520 + 70;
    } else if (img && big) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W - pad - 150, pad + 190, 150, 0, Math.PI * 2);
      ctx.clip();
      cover(ctx, img, W - pad - 300, pad + 40, 300, 300);
      ctx.restore();
      y = 520;
    }
    const head = fitLines(ctx, slide.headline, 900, big ? 120 : 80, W - pad * 2, img && !big ? 2 : 5);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${head.size}px ${FONT}`;
    y = drawText(ctx, head.lines, pad, y, head.size, 1.18);
    if (slide.body) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const bs = 46;
      ctx.font = `500 ${bs}px ${FONT}`;
      drawText(ctx, wrap(ctx, slide.body, W - pad * 2).slice(0, img && !big ? 4 : 8), pad, y + 34, bs, 1.45);
    }
  }

  // 위: 쪽 번호 · 아래: 계정 이름 / 넘겨보기 안내
  const fg = dark ? "rgba(255,255,255,0.85)" : "rgba(20,22,26,0.55)";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = fg;
  ctx.textAlign = "right";
  ctx.fillText(`${index + 1} / ${total}`, W - pad, 56);
  ctx.textAlign = "left";
  if (style.handle) ctx.fillText(style.handle.startsWith("@") ? style.handle : `@${style.handle}`, pad, H - 84);
  if (big && total > 1) {
    ctx.textAlign = "right";
    ctx.fillText("넘겨보세요 →", W - pad, H - 84);
  }
  if (cta) {
    ctx.textAlign = "right";
    ctx.fillText("💾 저장  ·  💬 태그", W - pad, H - 84);
  }
  ctx.textAlign = "left";
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("이미지 만들기 실패"))), "image/png"));
}

/** 학습한 색·여백·글자 크기를 실제 내보내기에도 반영 */
function renderLearned(ctx: CanvasRenderingContext2D, slide: Slide, index: number, total: number, img: Pic | null, style: CarouselStyle) {
  const d = cleanRecipe(style.design), pad = d.spacing === "airy" ? 100 : 64;
  const weight = d.typography === "strong" ? 900 : 600;
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle=d.background; ctx.fillRect(0,0,W,H);
  let y = slide.kind === "cover" ? 260 : 220;
  if(d.layout === "editorial") {
    ctx.fillStyle=d.accent; ctx.fillRect(pad,130,90,12);
    if(img) { ctx.save();roundRect(ctx,W-pad-380,130,380,310,20);ctx.clip();cover(ctx,img,W-pad-380,130,380,310);ctx.restore();y=510; }
  } else if(d.layout === "split") {
    if(img) {cover(ctx,img,0,0,W,500);y=560;}
    else {ctx.fillStyle=d.accent;ctx.fillRect(0,0,W,160);y=250;}
  } else {
    ctx.fillStyle=d.accent; ctx.globalAlpha=0.13;ctx.beginPath();ctx.arc(W,0,650,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(img) {ctx.save();roundRect(ctx,pad,130,W-pad*2,360,60);ctx.clip();cover(ctx,img,pad,130,W-pad*2,360);ctx.restore();y=550;}
  }
  const width=W-pad*2, maxHead=img?3:4;
  const head=fitLines(ctx,slide.headline,weight,slide.kind==="cover"?112:86,width,maxHead);
  ctx.fillStyle=d.foreground;ctx.font=`${weight} ${head.size}px ${FONT}`;
  y=drawText(ctx,head.lines,pad,y,head.size,1.18)+36;
  const remaining=Math.max(1,Math.floor((H-150-y)/(42*1.4)));
  const body=fitLines(ctx,slide.body,500,42,width,remaining);
  ctx.font=`500 ${body.size}px ${FONT}`;drawText(ctx,body.lines,pad,y,body.size,1.4);
  ctx.font=`600 30px ${FONT}`;ctx.fillText(style.handle ? '@'+style.handle.replace(/^@/,'') : '넘겨보세요 →',pad,H-85);
  ctx.textAlign="right";ctx.fillText(`${index+1} / ${total}`,W-pad,H-85);ctx.textAlign="left";
}
