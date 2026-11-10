"use client";
import { useEffect, useRef, useState } from "react";
import type { CarouselStyle, Slide } from "@/lib/carousel";
import { MOTION_EFFECTS, renderMotionFrame, renderSlide, type MotionEffect, type Pic } from "./render";
import { makeMotionVideo } from "./motion-video";

type Choice = MotionEffect | "auto";
const AUTO: MotionEffect[] = ["zoomIn", "panLeft", "zoomOut", "panRight"];
const effectFor = (choice: Choice, i: number) => (choice === "auto" ? AUTO[i % AUTO.length] : choice);
const KEY = "carousel-motion";

/** AI 영상 카드: 같은 주소로 받은 영상 (캔버스에 그릴 수 있게) */
async function loadVideo(src: string) {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
  await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error("AI 영상을 불러오지 못했어요 (주소가 만료됐을 수 있어요 — 카드에서 '영상 빼기' 후 다시 만들어 주세요).")); });
  return v;
}
async function seek(v: HTMLVideoElement, time: number) {
  const t = Math.min(Math.max(0, time), Math.max(0, v.duration - 0.04));
  if (Math.abs(v.currentTime - t) < 0.005) return;
  await new Promise<void>((ok) => { v.addEventListener("seeked", () => ok(), { once: true }); v.currentTime = t; });
}

/** 🎞 모션 캐러셀: 카드마다 3~7초 영상(MP4) — 사진은 천천히 움직이고 글자는 차례로 나타남 */
export default function MotionPanel({ carouselId, title, slides, imgFor, style, fontReady, canvases, disabled, onBusy, beforeExport }: {
  carouselId: string; title: string; slides: Slide[]; imgFor: (s: Slide) => HTMLImageElement | null; style: CarouselStyle; fontReady: boolean;
  canvases: React.RefObject<(HTMLCanvasElement | null)[]>; disabled: boolean; onBusy: (b: boolean) => void; beforeExport: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<Choice>("auto");
  const [seconds, setSeconds] = useState(5);
  const [pick, setPick] = useState<"all" | "photo">("all");
  const [textAnim, setTextAnim] = useState(false);
  const [state, setState] = useState<{ text: string; ok?: boolean } | null>(null);
  const [running, setRunning] = useState<"" | "preview" | "make">("");
  const stop = useRef(false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (v.choice) setChoice(v.choice); if (v.seconds) setSeconds(v.seconds); if (v.pick) setPick(v.pick); if (typeof v.textAnim === "boolean") setTextAnim(v.textAnim); } catch {}
  }, []);
  const remember = (v: Partial<{ choice: Choice; seconds: number; pick: string; textAnim: boolean }>) => { try { localStorage.setItem(KEY, JSON.stringify({ choice, seconds, pick, textAnim, ...v })); } catch {} };
  const vidSrc = (s: Slide) => (s.video?.url ? `/api/carousels/${carouselId}/video/${s.video.jobId}` : null);
  const targets = slides.map((s, i) => ({ s, i })).filter(({ s }) => pick === "all" || imgFor(s));

  async function preview() {
    setRunning("preview"); stop.current = false;
    const vids = new Map<number, HTMLVideoElement>();
    for (const { s, i } of targets) { const src = vidSrc(s); if (src) { try { const v = await loadVideo(src); v.loop = true; await v.play().catch(() => {}); vids.set(i, v); } catch (e) { setState({ text: (e as Error).message, ok: false }); } } }
    const t0 = performance.now();
    await new Promise<void>((ok) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        for (const { s, i } of targets) { const cv = canvases.current?.[i]; const v = vids.get(i); if (cv) renderMotionFrame(cv, s, i, slides.length, (v as Pic) ?? imgFor(s), style, t, seconds, v ? "still" : effectFor(choice, i), textAnim); }
        if (t < 1 && !stop.current) requestAnimationFrame(tick); else ok();
      };
      requestAnimationFrame(tick);
    });
    vids.forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
    slides.forEach((s, i) => { const cv = canvases.current?.[i]; if (cv) renderSlide(cv, s, i, slides.length, imgFor(s), style); });
    setRunning("");
  }

  async function make() {
    if (!targets.length) { setState({ text: "사진 있는 카드가 없어요. '모든 카드'로 바꿔 주세요.", ok: false }); return; }
    setRunning("make"); onBusy(true); setState(null);
    try {
      await beforeExport();
      if (!fontReady) await document.fonts?.ready;
      const files: File[] = [];
      for (const [n, { s, i }] of targets.entries()) {
        const fx = effectFor(choice, i), img = imgFor(s), src = vidSrc(s);
        const vid = src ? await loadVideo(src) : null;
        // AI 영상 카드는 영상 길이(보통 5초) 그대로, 사진 카드는 고른 길이
        const len = vid ? Math.min(15, Math.max(1, vid.duration || 5)) : seconds;
        const { blob, ext } = await makeMotionVideo(async (cv, t) => {
          if (vid) await seek(vid, t * len);
          renderMotionFrame(cv, s, i, slides.length, (vid as Pic) ?? img, style, t, len, vid ? "still" : fx, textAnim);
        }, len, (p) => setState({ text: `🎞 ${n + 1}/${targets.length}장 만드는 중… ${Math.round(p * 100)}%` }));
        files.push(new File([blob], `carousel-motion-${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type }));
      }
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ files, title });
        setState({ text: `영상 ${files.length}개를 공유했어요.`, ok: true });
      } else {
        for (const f of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(f); a.download = f.name; a.click();
          await new Promise((r) => setTimeout(r, 400));
          URL.revokeObjectURL(a.href);
        }
        setState({ text: `영상 ${files.length}개를 내려받았어요 (${files[0]?.name.split(".").pop()?.toUpperCase()}). 인스타 새 게시물에서 순서대로 골라 올리면 돼요.`, ok: true });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState({ text: `영상을 만들지 못했어요: ${(e as Error).message}`, ok: false });
    }
    setRunning(""); onBusy(false);
  }

  return (
    <details className="card card-pad">
      <summary><b>🎞 모션 캐러셀</b> <span className="small muted">카드를 사진이 천천히 움직이는 짧은 영상(MP4)으로 · 무료 · 이 브라우저에서 바로 만들어요</span></summary>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="small row" style={{ gap: 6 }}>움직임
            <select className="input" style={{ width: "auto" }} value={choice} disabled={!!running} onChange={(e) => { setChoice(e.target.value as Choice); remember({ choice: e.target.value as Choice }); }}>
              <option value="auto">자동 (장마다 다르게)</option>
              {MOTION_EFFECTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="small row" style={{ gap: 6 }}>길이
            <select className="input" style={{ width: "auto" }} value={seconds} disabled={!!running} onChange={(e) => { setSeconds(Number(e.target.value)); remember({ seconds: Number(e.target.value) }); }}>
              {[3, 5, 7].map((n) => <option key={n} value={n}>{n}초</option>)}
            </select>
          </label>
          <label className="small row" style={{ gap: 6 }}>글자
            <select className="input" style={{ width: "auto" }} value={textAnim ? "rise" : "still"} disabled={!!running} onChange={(e) => { setTextAnim(e.target.value === "rise"); remember({ textAnim: e.target.value === "rise" }); }}>
              <option value="still">고정 (움직이지 않음)</option>
              <option value="rise">아래에서 떠오르기</option>
            </select>
          </label>
          <label className="small row" style={{ gap: 6 }}>카드
            <select className="input" style={{ width: "auto" }} value={pick} disabled={!!running} onChange={(e) => { setPick(e.target.value as "all" | "photo"); remember({ pick: e.target.value }); }}>
              <option value="all">모든 카드 ({slides.length})</option>
              <option value="photo">사진 있는 카드만 ({slides.filter((s) => imgFor(s)).length})</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {running === "preview" ? <button className="btn btn-sm" onClick={() => { stop.current = true; }}>■ 미리보기 멈춤</button>
            : <button className="btn btn-sm" disabled={disabled || !!running} onClick={() => void preview()}>▶ 아래 카드에서 미리보기</button>}
          <button className="btn btn-sm btn-primary" disabled={disabled || !!running} onClick={() => void make()}>{running === "make" ? <span className="spinner" /> : `🎞 영상 ${targets.length}개 만들기`}</button>
        </div>
        {state && <p className={`small ${state.ok === false ? "notice notice-bad" : state.ok ? "notice notice-ok" : "muted"}`} role="status" style={{ margin: 0 }}>{state.text}</p>}
        <p className="tiny muted" style={{ margin: 0 }}>🎬 AI 영상을 만든 카드는 그 영상(음식이 실제로 움직임) 위에 글자를 얹고, 나머지 카드는 사진이 천천히 움직여요. 인스타는 한 게시물에 사진·영상을 섞어 최대 20장까지 올릴 수 있어요. 소리는 없으니 인스타에서 음악을 붙이세요.</p>
      </div>
    </details>
  );
}
