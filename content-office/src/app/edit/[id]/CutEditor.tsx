"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { api, Modal } from "@/components/client-utils";
import { Edit } from "@/remotion/Edit";
import { DEFAULT_TEXT_STYLE, type ReelText } from "@/remotion/types";
import { clipLen, clipStarts, editDuration, FILTERS, RATIO_SIZE, TRANSITIONS, type AudioClip, type Clip, type EditDoc, type Filter, type Overlay, type Ratio, type Transition } from "@/remotion/edit-types";

type Media = { id: string; title: string; duration: number | null; thumb: boolean; kind: string };
type Info = { id: string; title: string; status: string; message: string; output_video_id: string | null };
type Sel = { kind: "clip" | "text" | "overlay" | "audio"; id: string } | null;
type Panel = null | "media" | "audio" | "text" | "effect" | "overlay" | "caption" | "filter" | "ratio" | "bg" | "speed" | "volume" | "zoom" | "export";

const sid = () => Math.random().toString(36).slice(2, 9);
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const RES = ["720p", "1080p", "2K", "4K"] as const;

/** 캡컷처럼 선 아이콘 */
const IC: Record<string, string> = {
  edit: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.1 7.6 20 18M8.1 16.4 20 6",
  audio: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  text: "M5 5h14M12 5v15",
  effect: "M12 3l2.4 5.6L20 9.5l-4.3 3.9 1.2 5.9L12 16.4l-4.9 2.9 1.2-5.9L4 9.5l5.6-.9z",
  overlay: "M4 4h16v16H4zM8 15l3-3 2 2 3-4 3 5",
  caption: "M3 5h18v14H3zM7 14h4M13 14h4M7 10h10",
  filter: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M3.6 9h16.8",
  ratio: "M4 6h16v12H4zM8 6v12",
  bg: "M12 3a9 9 0 1 0 0 18V3z",
  split: "M12 3v18M6 8l-3 4 3 4M18 8l3 4-3 4",
  speed: "M12 21a9 9 0 1 1 9-9M12 12l5-5M3 12h2M12 3v2",
  volume: "M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  zoom: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6",
  reverse: "M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5",
  copy: "M8 8h12v12H8zM4 16V4h12",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  mute: "M4 9v6h4l5 4V5L8 9H4zM17 9l4 6M21 9l-4 6",
  sound: "M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6",
};
function Ico({ n, s = 24 }: { n: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={IC[n]} /></svg>;
}
const BGS = ["#000000", "#ffffff", "#f6e8ff", "#ffe4ef", "#e0f2fe", "#fef3c7", "#1e1b4b", "#14532d"];

export default function CutEditor({ initial, initialDoc, media: initialMedia }: { initial: Info; initialDoc: EditDoc; media: Media[] }) {
  const [info, setInfo] = useState(initial);
  const [doc, setDocRaw] = useState(initialDoc);
  const [title, setTitle] = useState(initial.title);
  const hist = useRef<{ past: EditDoc[]; future: EditDoc[] }>({ past: [], future: [] });
  const [save, setSave] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [sel, setSel] = useState<Sel>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [media, setMedia] = useState(initialMedia);
  const [pickFor, setPickFor] = useState<"append" | "overlay" | "audio" | null>(null);
  const [res, setRes] = useState<(typeof RES)[number]>("1080p");
  const [err, setErr] = useState("");
  const [pps, setPps] = useState(60); // 1초 = px
  const player = useRef<PlayerRef>(null);
  const tl = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const [tlW, setTlW] = useState(600);
  useEffect(() => {
    const el = tl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTlW(el.clientWidth));
    ro.observe(el);
    setTlW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fps = doc.fps;
  const total = editDuration(doc);
  const frames = Math.max(1, Math.round(total * fps));
  const t = frame / fps;
  const starts = useMemo(() => clipStarts(doc), [doc]);
  const [W, H] = RATIO_SIZE[doc.ratio];
  const durOf = useCallback((src: string) => media.find((m) => m.id === src)?.duration ?? 3600, [media]);
  const srcs = useMemo(() => {
    const ids = new Set([...doc.clips.map((c) => c.src), ...doc.overlays.map((o) => o.src), ...doc.audios.map((a) => a.src)]);
    return Object.fromEntries(Array.from(ids).map((s) => [s, s.startsWith("img_") ? `/api/img/${s}.jpg` : `/api/videos/${s}/file`]));
  }, [doc]);
  const busy = info.status === "rendering" || info.status === "working";

  const setDoc = useCallback((next: EditDoc | ((d: EditDoc) => EditDoc)) => {
    setDocRaw((cur) => {
      const n = typeof next === "function" ? next(cur) : next;
      if (n === cur) return cur;
      hist.current.past = [...hist.current.past.slice(-80), cur];
      hist.current.future = [];
      setSave("dirty");
      return n;
    });
  }, []);
  const undo = () => setDocRaw((cur) => { const p = hist.current.past.pop(); if (!p) return cur; hist.current.future.push(cur); setSave("dirty"); return p; });
  const redo = () => setDocRaw((cur) => { const f = hist.current.future.pop(); if (!f) return cur; hist.current.past.push(cur); setSave("dirty"); return f; });

  // 자동 저장
  useEffect(() => {
    if (save !== "dirty") return;
    const h = setTimeout(async () => {
      setSave("saving");
      try { await api(`/api/edit/${info.id}`, "PUT", { doc, title }); setSave("saved"); } catch (e) { setSave("error"); setErr((e as Error).message); }
    }, 900);
    return () => clearTimeout(h);
  }, [doc, title, save, info.id]);

  // 맥 작업(내보내기·자막·역재생) 진행 상황
  useEffect(() => {
    if (!busy) return;
    const h = setInterval(async () => {
      const r = await api<Info & { doc: EditDoc }>(`/api/edit/${info.id}`).catch(() => null);
      if (!r) return;
      if (info.status === "working" && r.status !== "working") { setDocRaw(r.doc); hist.current = { past: [], future: [] }; }
      setInfo(r);
    }, 3000);
    return () => clearInterval(h);
  }, [busy, info.id, info.status]);

  // 재생 위치 ↔ 타임라인 (가운데 고정선, 캡컷처럼 내용이 흐름)
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => { p.removeEventListener("frameupdate", onFrame); p.removeEventListener("seeked", onFrame); p.removeEventListener("play", onPlay); p.removeEventListener("pause", onPause); };
  }, [doc.clips.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = tl.current;
    if (!el) return;
    const want = t * pps;
    if (Math.abs(el.scrollLeft - want) > 1) { programmatic.current = true; el.scrollLeft = want; }
  }, [t, pps]);
  const onScroll = () => {
    if (programmatic.current) { programmatic.current = false; return; }
    if (playing) player.current?.pause();
    const sec = (tl.current?.scrollLeft ?? 0) / pps;
    const f = Math.max(0, Math.min(frames - 1, Math.round(sec * fps)));
    player.current?.seekTo(f);
    setFrame(f);
  };
  const seek = (sec: number) => { const f = Math.max(0, Math.min(frames - 1, Math.round(sec * fps))); player.current?.seekTo(f); setFrame(f); };
  const toggle = () => (player.current?.isPlaying() ? player.current.pause() : player.current?.play());

  const selClip = sel?.kind === "clip" ? doc.clips.find((c) => c.id === sel.id) : undefined;
  const selText = sel?.kind === "text" ? doc.texts.find((x) => x.id === sel.id) : undefined;
  const selOv = sel?.kind === "overlay" ? doc.overlays.find((x) => x.id === sel.id) : undefined;
  const selAu = sel?.kind === "audio" ? doc.audios.find((x) => x.id === sel.id) : undefined;
  const clipAt = (sec: number) => { for (let i = doc.clips.length - 1; i >= 0; i--) if (sec >= starts[i]) return i; return 0; };

  // ── 편집 동작 ──
  const patchClip = (id: string, p: Partial<Clip>) => setDoc((d) => ({ ...d, clips: d.clips.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const patchText = (id: string, p: Partial<ReelText>) => setDoc((d) => ({ ...d, texts: d.texts.map((x) => (x.id === id ? { ...x, ...p, style: { ...x.style, ...(p.style ?? {}) } } : x)) }));
  const patchOv = (id: string, p: Partial<Overlay>) => setDoc((d) => ({ ...d, overlays: d.overlays.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const patchAu = (id: string, p: Partial<AudioClip>) => setDoc((d) => ({ ...d, audios: d.audios.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  function split() {
    if (sel?.kind === "text" && selText) {
      if (t - selText.start < 0.2 || selText.end - t < 0.2) return;
      setDoc((d) => ({ ...d, texts: d.texts.flatMap((x) => (x.id === selText.id ? [{ ...x, end: r2(t) }, { ...x, id: sid(), start: r2(t) }] : [x])) }));
      return;
    }
    const i = selClip ? doc.clips.findIndex((c) => c.id === selClip.id) : clipAt(t);
    const c = doc.clips[i];
    if (!c) return;
    const o = t - starts[i];
    if (o < 0.15 || clipLen(c) - o < 0.15) return;
    const cut = r2(c.in + o * (c.kind === "image" ? 1 : c.speed));
    setDoc((d) => ({ ...d, clips: d.clips.flatMap((x) => (x.id === c.id ? [{ ...x, out: cut }, { ...x, id: sid(), in: cut, transition: "none" as Transition }] : [x])) }));
  }
  function remove() {
    if (!sel) return;
    setDoc((d) => ({ ...d, clips: d.clips.filter((x) => x.id !== sel.id), texts: d.texts.filter((x) => x.id !== sel.id), overlays: d.overlays.filter((x) => x.id !== sel.id), audios: d.audios.filter((x) => x.id !== sel.id) }));
    setSel(null);
    setPanel(null);
  }
  function duplicate() {
    if (!sel) return;
    setDoc((d) => {
      if (sel.kind === "clip") { const i = d.clips.findIndex((c) => c.id === sel.id); const c = [...d.clips]; c.splice(i + 1, 0, { ...d.clips[i], id: sid() }); return { ...d, clips: c }; }
      if (sel.kind === "text") { const x = d.texts.find((y) => y.id === sel.id)!; return { ...d, texts: [...d.texts, { ...x, id: sid(), start: x.end, end: r2(x.end + (x.end - x.start)) }] }; }
      if (sel.kind === "overlay") { const x = d.overlays.find((y) => y.id === sel.id)!; return { ...d, overlays: [...d.overlays, { ...x, id: sid(), start: r2(x.start + x.dur) }] }; }
      const x = d.audios.find((y) => y.id === sel.id)!;
      return { ...d, audios: [...d.audios, { ...x, id: sid(), start: r2(x.start + x.dur) }] };
    });
  }
  function moveClip(dir: -1 | 1) {
    if (!selClip) return;
    setDoc((d) => { const i = d.clips.findIndex((c) => c.id === selClip.id); const j = i + dir; if (j < 0 || j >= d.clips.length) return d; const c = [...d.clips]; [c[i], c[j]] = [c[j], c[i]]; return { ...d, clips: c }; });
  }
  function addText() {
    const id = sid();
    setDoc((d) => ({ ...d, texts: [...d.texts, { id, start: r2(t), end: r2(Math.min(total + 3, t + 3)), text: "텍스트 입력", style: { ...DEFAULT_TEXT_STYLE, x: W / 2, y: Math.round(H * 0.5), width: Math.round(W * 0.85), size: Math.round(W * 0.07), anim: "pop" } }] }));
    setSel({ kind: "text", id });
    setPanel("text");
  }
  function pick(m: Media) {
    const kind = m.id.startsWith("img_") ? "image" : "video";
    const len = kind === "image" ? 3 : r2(m.duration ?? 5);
    if (pickFor === "append") setDoc((d) => ({ ...d, clips: [...d.clips, { id: sid(), src: m.id, kind, in: 0, out: len, speed: 1, volume: 1, filter: "none", transition: "none", zoom: null, fit: "cover" }] }));
    if (pickFor === "overlay") { const id = sid(); setDoc((d) => ({ ...d, overlays: [...d.overlays, { id, src: m.id, kind, start: r2(t), dur: Math.min(len, 5), in: 0, x: 70, y: 30, w: 40, opacity: 1, volume: 0, radius: 10 }] })); setSel({ kind: "overlay", id }); setPanel("overlay"); }
    if (pickFor === "audio") { const id = sid(); setDoc((d) => ({ ...d, audios: [...d.audios, { id, src: m.id, start: r2(t), in: 0, dur: len, volume: 1, label: m.title }] })); setSel({ kind: "audio", id }); setPanel("volume"); }
    setPickFor(null);
  }
  async function upload(f: File) {
    setErr("");
    try {
      let id = "";
      if (f.type.startsWith("image/")) {
        const fd = new FormData(); fd.append("files", f);
        const r = await (await fetch("/api/refs", { method: "POST", body: fd })).json();
        if (!r.ids?.[0]) throw new Error(r.error ?? "올리기 실패");
        id = r.ids[0];
        const m = { id, title: f.name, duration: 3, thumb: false, kind: "image" };
        setMedia([m, ...media]);
        pick(m);
        return;
      }
      const fd = new FormData(); fd.append("file", f);
      const r = await (await fetch("/api/videos/upload", { method: "POST", body: fd })).json();
      if (!r.id) throw new Error(r.error ?? "올리기 실패");
      const list = await api<{ videos: { id: string; title: string; duration: number | null; thumb_path: string | null; kind: string; status: string }[] }>("/api/videos");
      const ms = list.videos.filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, duration: v.duration, thumb: !!v.thumb_path, kind: v.kind }));
      setMedia(ms);
      const m = ms.find((x) => x.id === r.id);
      if (m) pick(m);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function mac(body: Record<string, unknown>) {
    setErr("");
    try {
      if (save !== "saved") { await api(`/api/edit/${info.id}`, "PUT", { doc, title }); setSave("saved"); }
      setInfo(await api<Info>(`/api/edit/${info.id}`, "POST", body));
      setPanel(null);
    } catch (e) { setErr((e as Error).message); }
  }

  // 타임라인 끌기 (클립 양 끝 자르기 · 텍스트·오버레이·오디오 옮기기/길이)
  const drag = useRef<{ kind: string; id: string; x: number; base: EditDoc; a: number; b: number } | null>(null);
  function down(e: React.PointerEvent, kind: string, id: string, a: number, b: number) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, id, x: e.clientX, base: doc, a, b };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x) / pps;
    if (Math.abs(dt) < 0.02) return;
    const b = d.base;
    let n = b;
    if (d.kind === "clip-l") n = { ...b, clips: b.clips.map((c) => (c.id === d.id ? { ...c, in: r2(Math.max(0, Math.min(c.out - 0.2, d.a + dt * (c.kind === "image" ? 1 : c.speed)))) } : c)) };
    if (d.kind === "clip-r") n = { ...b, clips: b.clips.map((c) => (c.id === d.id ? { ...c, out: r2(Math.max(c.in + 0.2, Math.min(c.kind === "image" ? 600 : durOf(c.src), d.b + dt * (c.kind === "image" ? 1 : c.speed)))) } : c)) };
    const mv = (s: number) => r2(Math.max(0, s + dt));
    if (d.kind === "text") n = { ...b, texts: b.texts.map((x) => (x.id === d.id ? { ...x, start: mv(d.a), end: r2(mv(d.a) + (d.b - d.a)) } : x)) };
    if (d.kind === "text-r") n = { ...b, texts: b.texts.map((x) => (x.id === d.id ? { ...x, end: r2(Math.max(x.start + 0.2, d.b + dt)) } : x)) };
    if (d.kind === "ov") n = { ...b, overlays: b.overlays.map((x) => (x.id === d.id ? { ...x, start: mv(d.a) } : x)) };
    if (d.kind === "ov-r") n = { ...b, overlays: b.overlays.map((x) => (x.id === d.id ? { ...x, dur: r2(Math.max(0.2, d.b + dt)) } : x)) };
    if (d.kind === "au") n = { ...b, audios: b.audios.map((x) => (x.id === d.id ? { ...x, start: mv(d.a) } : x)) };
    if (d.kind === "au-r") n = { ...b, audios: b.audios.map((x) => (x.id === d.id ? { ...x, dur: r2(Math.max(0.2, Math.min(durOf(x.src) - x.in, d.b + dt))) } : x)) };
    setDocRaw(n);
    setSave("dirty");
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (d) { hist.current.past = [...hist.current.past.slice(-80), d.base]; hist.current.future = []; }
  }

  // 단축키
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.key === " ") { e.preventDefault(); toggle(); }
      if (e.key === "s" || e.key === "S") split();
      if (e.key === "Delete" || e.key === "Backspace") remove();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const half = tlW / 2;
  const clipTools: [string, string, () => void][] = [
    ["split", "분할", split], ["speed", "속도", () => setPanel("speed")], ["volume", "볼륨", () => setPanel("volume")], ["filter", "필터", () => setPanel("filter")], ["effect", "전환", () => setPanel("effect")],
    ["zoom", "줌·키프레임", () => setPanel("zoom")], ["reverse", "역재생", () => selClip && mac({ action: "reverse", clipId: selClip.id })], ["copy", "복제", duplicate], ["left", "앞으로", () => moveClip(-1)], ["right", "뒤로", () => moveClip(1)], ["trash", "삭제", remove],
  ];
  const mainTools: [string, string, () => void][] = [
    ["edit", "편집", () => { if (doc.clips[clipAt(t)]) setSel({ kind: "clip", id: doc.clips[clipAt(t)].id }); }],
    ["audio", "오디오", () => setPanel("audio")], ["text", "텍스트", addText], ["effect", "편집효과", () => { if (doc.clips[clipAt(t)]) { setSel({ kind: "clip", id: doc.clips[clipAt(t)].id }); setPanel("effect"); } }],
    ["overlay", "오버레이", () => setPickFor("overlay")], ["caption", "캡션", () => setPanel("caption")], ["filter", "필터", () => setPanel("filter")], ["ratio", "비율", () => setPanel("ratio")], ["bg", "배경", () => setPanel("bg")],
  ];

  return (
    <div className={`cut${panel ? " has-panel" : ""}`}>
      {/* 위: 닫기 · 해상도 · 내보내기 */}
      <div className="cut-top">
        <Link href="/edit" className="cut-icon" aria-label="닫기">✕</Link>
        <input className="cut-title" value={title} onChange={(e) => { setTitle(e.target.value); setSave("dirty"); }} aria-label="제목" />
        <span className="cut-save">{{ saved: "저장됨", dirty: "…", saving: "저장 중", error: "저장 실패" }[save]}</span>
        <select className="cut-res" value={res} onChange={(e) => setRes(e.target.value as (typeof RES)[number])} aria-label="해상도">{RES.map((r) => <option key={r}>{r}</option>)}</select>
        <button className="cut-export" disabled={info.status === "rendering"} onClick={() => mac({ action: "render", resolution: res })}>{info.status === "rendering" ? "만드는 중…" : "내보내기"}</button>
      </div>
      {(busy || info.status === "error" || err || info.output_video_id) && (
        <div className={`cut-note${info.status === "error" || err ? " bad" : ""}`}>
          {busy && <span className="spinner" />} {err || info.message}
          {info.output_video_id && !busy && <> · <Link href={`/videos/${info.output_video_id}`}>완성 영상 보기 →</Link></>}
        </div>
      )}

      {/* 미리보기 */}
      <div className="cut-stage">
        <div className="cut-frame" style={{ aspectRatio: `${W} / ${H}` }}>
          {doc.clips.length || doc.overlays.length ? (
            <Player ref={player} component={Edit} inputProps={{ doc, srcs, fontUrl: "/api/reels/font" }} durationInFrames={frames} fps={fps} compositionWidth={W} compositionHeight={H} style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
          ) : (
            <button className="cut-empty" onClick={() => setPickFor("append")}>＋ 영상 추가</button>
          )}
        </div>
      </div>

      {/* 재생 줄 */}
      <div className="cut-bar">
        <button className="cut-icon" onClick={() => player.current?.requestFullscreen()} aria-label="전체 화면"><Ico n="full" s={22} /></button>
        <span className="cut-time">{fmt(t)} <span>/ {fmt(total)}</span></span>
        <button className="cut-play" onClick={toggle} aria-label={playing ? "멈춤" : "재생"}>{playing ? "❚❚" : "▶"}</button>
        <input type="range" min={20} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="확대" className="cut-zoom" />
        <button className="cut-icon" onClick={undo} aria-label="되돌리기"><Ico n="undo" s={22} /></button>
        <button className="cut-icon" onClick={redo} aria-label="다시"><Ico n="redo" s={22} /></button>
      </div>

      {/* 타임라인: 가운데 고정선 */}
      <div className="cut-tl-wrap">
        <div className="cut-side">
          <button className={`cut-side-btn${doc.muteClips ? " on" : ""}`} onClick={() => setDoc((d) => ({ ...d, muteClips: !d.muteClips }))}><Ico n={doc.muteClips ? "mute" : "sound"} /><span>클립 오디오<br />{doc.muteClips ? "켜기" : "음소거"}</span></button>
          <div className="cut-side-gap" />
          <div className="cut-side-ic"><Ico n="overlay" s={16} /></div>
          <div className="cut-side-ic"><Ico n="audio" s={16} /></div>
          <div className="cut-side-ic"><Ico n="text" s={16} /></div>
        </div>
        <div className="cut-tl" ref={tl} onScroll={onScroll} onPointerMove={move} onPointerUp={up} onClick={() => { setSel(null); setPanel(null); }}>
          <div style={{ width: total * pps + half * 2, position: "relative", paddingLeft: half }}>
            <div className="cut-ruler" style={{ marginLeft: -half }}>{Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (pps >= 40 || s % 2 === 0) && <span key={s} style={{ left: half + s * pps }}>{s % 2 === 0 ? fmt(s) : "·"}</span>)}</div>
            <div className="cut-row main" style={{ marginLeft: -half }}>
              {doc.clips.map((c, i) => (
                <div key={c.id} className={`cut-clip${sel?.id === c.id ? " on" : ""}`} style={{ left: half + starts[i] * pps, width: Math.max(8, clipLen(c) * pps - 2), backgroundImage: c.src.startsWith("img_") ? `url(/api/img/${c.src}.jpg)` : media.find((m) => m.id === c.src)?.thumb ? `url(/api/videos/${c.src}/file?kind=thumb)` : undefined }}
                  onClick={(e) => { e.stopPropagation(); setSel({ kind: "clip", id: c.id }); }}>
                  {c.speed !== 1 && <span className="cut-tag">{c.speed}x</span>}
                  {c.filter !== "none" && <span className="cut-tag">{FILTERS[c.filter][0]}</span>}
                  {c.transition !== "none" && <span className="cut-tag tr">⇆</span>}
                  {sel?.id === c.id && <><i className="cut-h l" onPointerDown={(e) => down(e, "clip-l", c.id, c.in, c.out)} /><i className="cut-h r" onPointerDown={(e) => down(e, "clip-r", c.id, c.in, c.out)} /></>}
                </div>
              ))}
              <button className="cut-add" style={{ left: half + starts.reduce((a, s, i) => Math.max(a, s + clipLen(doc.clips[i])), 0) * pps + 6 }} onClick={(e) => { e.stopPropagation(); setPickFor("append"); }} aria-label="영상 추가">＋</button>
            </div>
            <div className="cut-row" style={{ marginLeft: -half }}>
              {doc.overlays.map((o) => (
                <div key={o.id} className={`cut-blk ov${sel?.id === o.id ? " on" : ""}`} style={{ left: half + o.start * pps, width: Math.max(8, o.dur * pps - 2) }} onPointerDown={(e) => { down(e, "ov", o.id, o.start, o.dur); setSel({ kind: "overlay", id: o.id }); setPanel("overlay"); }} onClick={(e) => e.stopPropagation()}>
                  ▣ {media.find((m) => m.id === o.src)?.title ?? "오버레이"}<i className="cut-h r" onPointerDown={(e) => down(e, "ov-r", o.id, o.start, o.dur)} />
                </div>
              ))}
              {!doc.overlays.length && <button className="cut-addrow" style={{ left: half + t * pps }} onClick={(e) => { e.stopPropagation(); setPickFor("overlay"); }}>＋ 오버레이 추가</button>}
            </div>
            <div className="cut-row" style={{ marginLeft: -half }}>
              {doc.audios.map((a) => (
                <div key={a.id} className={`cut-blk au${sel?.id === a.id ? " on" : ""}`} style={{ left: half + a.start * pps, width: Math.max(8, a.dur * pps - 2) }} onPointerDown={(e) => { down(e, "au", a.id, a.start, a.dur); setSel({ kind: "audio", id: a.id }); setPanel("volume"); }} onClick={(e) => e.stopPropagation()}>
                  ♪ {a.label}<i className="cut-h r" onPointerDown={(e) => down(e, "au-r", a.id, a.start, a.dur)} />
                </div>
              ))}
              {!doc.audios.length && <button className="cut-addrow" style={{ left: half + t * pps }} onClick={(e) => { e.stopPropagation(); setPickFor("audio"); }}>＋ 오디오 추가</button>}
            </div>
            <div className="cut-row" style={{ marginLeft: -half }}>
              {doc.texts.map((x) => (
                <div key={x.id} className={`cut-blk tx${sel?.id === x.id ? " on" : ""}`} style={{ left: half + x.start * pps, width: Math.max(8, (x.end - x.start) * pps - 2) }} onPointerDown={(e) => { down(e, "text", x.id, x.start, x.end); setSel({ kind: "text", id: x.id }); setPanel("text"); }} onClick={(e) => e.stopPropagation()}>
                  T {x.text}<i className="cut-h r" onPointerDown={(e) => down(e, "text-r", x.id, x.start, x.end)} />
                </div>
              ))}
              {!doc.texts.length && <button className="cut-addrow" style={{ left: half + t * pps }} onClick={(e) => { e.stopPropagation(); addText(); }}>＋ 텍스트 추가</button>}
            </div>
          </div>
        </div>
        <div className="cut-playhead" />
      </div>

      {/* 아래 패널 */}
      {panel && (
        <div className="cut-panel">
          <div className="cut-panel-head"><b>{{ media: "", audio: "오디오", text: "텍스트", effect: "전환 효과", overlay: "오버레이", caption: "캡션", filter: "필터", ratio: "비율", bg: "배경", speed: "속도", volume: "볼륨", zoom: "줌 · 키프레임", export: "" }[panel]}</b><button className="cut-icon" onClick={() => setPanel(null)}>✓</button></div>
          {panel === "speed" && selClip && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="cut-chips">{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((v) => <button key={v} className={selClip.speed === v ? "on" : ""} onClick={() => patchClip(selClip.id, { speed: v })}>{v}x</button>)}</div>
              <input type="range" min={0.25} max={4} step={0.05} value={selClip.speed} onChange={(e) => patchClip(selClip.id, { speed: Number(e.target.value) })} />
              <span className="cut-hint">1보다 작으면 슬로모션. 길이 {clipLen(selClip).toFixed(1)}초 · 속도 곡선은 다음 단계에서</span>
            </div>
          )}
          {panel === "volume" && (selClip || selAu || selOv) && (
            <div className="stack" style={{ gap: 6 }}>
              <input type="range" min={0} max={2} step={0.05} value={(selClip ?? selAu ?? selOv)!.volume} onChange={(e) => { const v = Number(e.target.value); if (selClip) patchClip(selClip.id, { volume: v }); if (selAu) patchAu(selAu.id, { volume: v }); if (selOv) patchOv(selOv.id, { volume: v }); }} />
              <span className="cut-hint">{Math.round((selClip ?? selAu ?? selOv)!.volume * 100)}%</span>
              {selAu && <div className="row" style={{ gap: 6 }}><button className="cut-btn" onClick={duplicate}>⧉ 복제</button><button className="cut-btn" onClick={remove}>🗑 삭제</button></div>}
            </div>
          )}
          {panel === "filter" && (
            <div className="cut-chips">
              {(Object.keys(FILTERS) as Filter[]).map((f) => <button key={f} className={(selClip?.filter ?? "none") === f ? "on" : ""} onClick={() => (selClip ? patchClip(selClip.id, { filter: f }) : setDoc((d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, filter: f })) })))}>{FILTERS[f][0]}</button>)}
              <span className="cut-hint">{selClip ? "이 클립에만" : "모든 클립에"} 적용돼요</span>
            </div>
          )}
          {panel === "effect" && selClip && (
            <div className="cut-chips">
              {(Object.keys(TRANSITIONS) as Transition[]).map((x) => <button key={x} className={selClip.transition === x ? "on" : ""} onClick={() => patchClip(selClip.id, { transition: x })}>{TRANSITIONS[x]}</button>)}
              <button onClick={() => setDoc((d) => ({ ...d, clips: d.clips.map((c, i) => (i === 0 ? c : { ...c, transition: selClip.transition })) }))}>모든 클립에</button>
              <span className="cut-hint">이 클립이 시작할 때 0.4초 동안</span>
            </div>
          )}
          {panel === "zoom" && selClip && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="cut-chips">
                <button className={!selClip.zoom ? "on" : ""} onClick={() => patchClip(selClip.id, { zoom: null })}>없음</button>
                <button onClick={() => patchClip(selClip.id, { zoom: { from: 1, to: 1.3, x: 50, y: 50 } })}>천천히 확대</button>
                <button onClick={() => patchClip(selClip.id, { zoom: { from: 1.3, to: 1, x: 50, y: 50 } })}>천천히 축소</button>
                <button onClick={() => patchClip(selClip.id, { fit: selClip.fit === "cover" ? "contain" : "cover" })}>{selClip.fit === "cover" ? "화면 가득" : "전체 보이기"}</button>
              </div>
              {selClip.zoom && (
                <>
                  <label className="cut-row-ctl">시작 배율 <input type="range" min={1} max={3} step={0.05} value={selClip.zoom.from} onChange={(e) => patchClip(selClip.id, { zoom: { ...selClip.zoom!, from: Number(e.target.value) } })} /> {selClip.zoom.from.toFixed(2)}</label>
                  <label className="cut-row-ctl">끝 배율 <input type="range" min={1} max={3} step={0.05} value={selClip.zoom.to} onChange={(e) => patchClip(selClip.id, { zoom: { ...selClip.zoom!, to: Number(e.target.value) } })} /> {selClip.zoom.to.toFixed(2)}</label>
                  <label className="cut-row-ctl">가로 중심 <input type="range" min={0} max={100} value={selClip.zoom.x} onChange={(e) => patchClip(selClip.id, { zoom: { ...selClip.zoom!, x: Number(e.target.value) } })} /></label>
                  <label className="cut-row-ctl">세로 중심 <input type="range" min={0} max={100} value={selClip.zoom.y} onChange={(e) => patchClip(selClip.id, { zoom: { ...selClip.zoom!, y: Number(e.target.value) } })} /></label>
                </>
              )}
            </div>
          )}
          {panel === "text" && selText && (
            <div className="stack" style={{ gap: 6 }}>
              <textarea className="cut-input" rows={2} value={selText.text} onChange={(e) => patchText(selText.id, { text: e.target.value })} />
              <label className="cut-row-ctl">크기 <input type="range" min={20} max={Math.round(W * 0.2)} value={selText.style.size} onChange={(e) => patchText(selText.id, { style: { ...selText.style, size: Number(e.target.value) } })} /></label>
              <label className="cut-row-ctl">세로 위치 <input type="range" min={0} max={H} value={selText.style.y} onChange={(e) => patchText(selText.id, { style: { ...selText.style, y: Number(e.target.value) } })} /></label>
              <div className="cut-chips">
                <label>글자 <input type="color" value={selText.style.color} onChange={(e) => patchText(selText.id, { style: { ...selText.style, color: e.target.value } })} /></label>
                {["", "#000000", "#ffffff", "#ffd1e8", "#ffe98a"].map((c) => <button key={c || "none"} className={selText.style.box === c ? "on" : ""} style={c ? { background: c, color: c === "#000000" ? "#fff" : "#000" } : undefined} onClick={() => patchText(selText.id, { style: { ...selText.style, box: c } })}>{c ? "상자" : "상자 없음"}</button>)}
                <button className={selText.style.bold ? "on" : ""} onClick={() => patchText(selText.id, { style: { ...selText.style, bold: !selText.style.bold } })}>굵게</button>
              </div>
              <div className="cut-chips">{([["none", "효과 없음"], ["fade", "페이드"], ["pop", "팝"], ["slide", "올라오기"], ["bounce", "통통"], ["type", "타자"]] as const).map(([k, l]) => <button key={k} className={(selText.style.anim ?? "none") === k ? "on" : ""} onClick={() => patchText(selText.id, { style: { ...selText.style, anim: k } })}>{l}</button>)}</div>
              <div className="row" style={{ gap: 6 }}><button className="cut-btn" onClick={split}>✂️ 분할</button><button className="cut-btn" onClick={duplicate}>⧉ 복제</button><button className="cut-btn" onClick={remove}>🗑 삭제</button></div>
            </div>
          )}
          {panel === "overlay" && selOv && (
            <div className="stack" style={{ gap: 6 }}>
              <label className="cut-row-ctl">가로 <input type="range" min={0} max={100} value={selOv.x} onChange={(e) => patchOv(selOv.id, { x: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">세로 <input type="range" min={0} max={100} value={selOv.y} onChange={(e) => patchOv(selOv.id, { y: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">크기 <input type="range" min={5} max={100} value={selOv.w} onChange={(e) => patchOv(selOv.id, { w: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">투명도 <input type="range" min={0} max={1} step={0.05} value={selOv.opacity} onChange={(e) => patchOv(selOv.id, { opacity: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">둥글게 <input type="range" min={0} max={100} value={selOv.radius} onChange={(e) => patchOv(selOv.id, { radius: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">소리 <input type="range" min={0} max={2} step={0.05} value={selOv.volume} onChange={(e) => patchOv(selOv.id, { volume: Number(e.target.value) })} /></label>
              <div className="row" style={{ gap: 6 }}><button className="cut-btn" onClick={() => setPickFor("overlay")}>＋ 하나 더</button><button className="cut-btn" onClick={duplicate}>⧉ 복제</button><button className="cut-btn" onClick={remove}>🗑 삭제</button></div>
            </div>
          )}
          {panel === "audio" && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 6 }}>
                <button className="cut-btn" onClick={() => setPickFor("audio")}>♪ 음악·소리 추가 (지금 위치)</button>
                <button className="cut-btn" onClick={() => setDoc((d) => ({ ...d, muteClips: !d.muteClips }))}>{doc.muteClips ? "🔊 클립 소리 켜기" : "🔇 클립 소리 끄기"}</button>
              </div>
              <span className="cut-hint">영상공장에 있는 영상의 소리나 올린 음악(mp3·m4a·wav)을 넣어요. 음성 합성(TTS)은 다음 단계에서.</span>
            </div>
          )}
          {panel === "caption" && (
            <div className="stack" style={{ gap: 6 }}>
              <button className="cut-btn primary" disabled={busy} onClick={() => mac({ action: "captions" })}>💬 자동 자막 만들기</button>
              <span className="cut-hint">맥이 클립의 말소리를 받아써서, 자르고 배속한 위치에 맞춰 자막을 넣어요 (무료). 다시 누르면 자동 자막만 새로 바꿔요. 만든 자막은 텍스트 줄에서 고칠 수 있어요.</span>
            </div>
          )}
          {panel === "ratio" && <div className="cut-chips">{(Object.keys(RATIO_SIZE) as Ratio[]).map((r) => <button key={r} className={doc.ratio === r ? "on" : ""} onClick={() => setDoc((d) => ({ ...d, ratio: r }))}>{r}</button>)}<span className="cut-hint">9:16 릴스·쇼츠 · 16:9 유튜브 · 1:1·4:5 피드</span></div>}
          {panel === "bg" && <div className="cut-chips">{BGS.map((c) => <button key={c} className={doc.bg === c ? "on" : ""} style={{ background: c, width: 34, height: 34, padding: 0 }} onClick={() => setDoc((d) => ({ ...d, bg: c }))} aria-label={c} />)}<span className="cut-hint">&apos;전체 보이기&apos; 클립의 남는 자리에 보여요</span></div>}
        </div>
      )}

      {/* 맨 아래 도구 막대 */}
      <div className="cut-tools">
        {sel?.kind === "clip" ? (
          <>
            <button className="cut-tool back" onClick={() => { setSel(null); setPanel(null); }}>‹</button>
            {clipTools.map(([ic, l, fn]) => <button key={l} className="cut-tool" onClick={(e) => { e.stopPropagation(); fn(); }}><Ico n={ic} />{l}</button>)}
          </>
        ) : sel ? (
          <>
            <button className="cut-tool back" onClick={() => { setSel(null); setPanel(null); }}>‹</button>
            <button className="cut-tool" onClick={split}><Ico n="split" />분할</button>
            <button className="cut-tool" onClick={duplicate}><Ico n="copy" />복제</button>
            <button className="cut-tool" onClick={remove}><Ico n="trash" />삭제</button>
          </>
        ) : (
          mainTools.map(([ic, l, fn]) => <button key={l} className="cut-tool" onClick={fn}><Ico n={ic} />{l}</button>)
        )}
      </div>

      {pickFor && (
        <Modal title={{ append: "영상·사진 추가", overlay: "오버레이 추가", audio: "오디오 추가" }[pickFor]} onClose={() => setPickFor(null)}>
          <div className="stack" style={{ gap: 10 }}>
            <label className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>📁 내 파일 올리기<input type="file" hidden accept={pickFor === "audio" ? "audio/*,video/*" : "video/*,image/*"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            <div className="reel-files wide">
              {media.filter((m) => pickFor === "audio" || !m.title.startsWith("🎵")).map((m) => (
                <button key={m.id} className="reel-file" onClick={() => pick(m)}>
                  {m.thumb ? <img src={`/api/videos/${m.id}/file?kind=thumb`} alt="" /> : m.id.startsWith("img_") ? <img src={`/api/img/${m.id}.jpg`} alt="" /> : <span className="reel-file-ph">{m.title.startsWith("🎵") ? "🎵" : "🎞"}</span>}
                  <span className="tiny ellipsis">{m.title}</span>
                  {m.duration != null && <span className="tiny muted">{Math.round(m.duration)}초</span>}
                </button>
              ))}
            </div>
            {err && <div className="notice notice-bad small">{err}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
