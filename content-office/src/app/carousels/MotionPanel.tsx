"use client";
import { useEffect, useRef, useState } from "react";
import type { CarouselStyle, Slide } from "@/lib/carousel";
import { MOTION_EFFECTS, renderMotionFrame, renderSlide, type MotionEffect } from "./render";
import { makeMotionVideo } from "./motion-video";

type Choice = MotionEffect | "auto";
const AUTO: MotionEffect[] = ["zoomIn", "panLeft", "zoomOut", "panRight"];
const effectFor = (choice: Choice, i: number) => (choice === "auto" ? AUTO[i % AUTO.length] : choice);
const KEY = "carousel-motion";

/** 🎞 모션 캐러셀: 카드마다 3~7초 영상(MP4) — 사진은 천천히 움직이고 글자는 차례로 나타남 */
export default function MotionPanel({ title, slides, imgFor, style, fontReady, canvases, disabled, onBusy, beforeExport }: {
  title: string; slides: Slide[]; imgFor: (s: Slide) => HTMLImageElement | null; style: CarouselStyle; fontReady: boolean;
  canvases: React.RefObject<(HTMLCanvasElement | null)[]>; disabled: boolean; onBusy: (b: boolean) => void; beforeExport: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<Choice>("auto");
  const [seconds, setSeconds] = useState(5);
  const [pick, setPick] = useState<"all" | "photo">("all");
  const [state, setState] = useState<{ text: string; ok?: boolean } | null>(null);
  const [running, setRunning] = useState<"" | "preview" | "make">("");
  const stop = useRef(false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (v.choice) setChoice(v.choice); if (v.seconds) setSeconds(v.seconds); if (v.pick) setPick(v.pick); } catch {}
  }, []);
  const remember = (v: Partial<{ choice: Choice; seconds: number; pick: string }>) => { try { localStorage.setItem(KEY, JSON.stringify({ choice, seconds, pick, ...v })); } catch {} };
  const targets = slides.map((s, i) => ({ s, i })).filter(({ s }) => pick === "all" || imgFor(s));

  async function preview() {
    setRunning("preview"); stop.current = false;
    const t0 = performance.now();
    await new Promise<void>((ok) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        for (const { s, i } of targets) { const cv = canvases.current?.[i]; if (cv) renderMotionFrame(cv, s, i, slides.length, imgFor(s), style, t, seconds, effectFor(choice, i)); }
        if (t < 1 && !stop.current) requestAnimationFrame(tick); else ok();
      };
      requestAnimationFrame(tick);
    });
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
        const fx = effectFor(choice, i), img = imgFor(s);
        const { blob, ext } = await makeMotionVideo((cv, t) => renderMotionFrame(cv, s, i, slides.length, img, style, t, seconds, fx), seconds, (p) => setState({ text: `🎞 ${n + 1}/${targets.length}장 만드는 중… ${Math.round(p * 100)}%` }));
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
        <p className="tiny muted" style={{ margin: 0 }}>사진은 카드 안에서만 움직이고 글자는 제목 → 본문 순서로 나타나요. 인스타는 한 게시물에 사진·영상을 섞어 최대 20장까지 올릴 수 있어요. 소리는 없으니 인스타에서 음악을 붙이세요.</p>
      </div>
    </details>
  );
}
