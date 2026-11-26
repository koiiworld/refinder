"use client";

import { isTyping, keyIs, undoKey } from "@/components/shortcuts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { api, Modal } from "@/components/client-utils";
import { Edit } from "@/remotion/Edit";
import { DEFAULT_TEXT_STYLE, faceKey, fontFaces, fontRoute, type ReelText } from "@/remotion/types";
import { FontPicker } from "@/components/FontPicker";
import TextMotionPicker from "@/components/TextMotionPicker";
import MusicSearch from "@/components/MusicSearch";
import { GRID_DIR, GRID_SHAPE, layoutCells, type GridDir, type GridShape } from "@/remotion/edit-grid";
import { clipLen, clipStarts, docSize, editDuration, FILTERS, RATIO_SIZE, TRANSITIONS, type AudioClip, type Clip, type EditDoc, type Filter, type Overlay, type Ratio, type Transition } from "@/remotion/edit-types";

type Media = { id: string; title: string; duration: number | null; thumb: boolean; kind: string };
type Info = { id: string; title: string; status: string; message: string; output_video_id: string | null };
type Sel = { kind: "clip" | "text" | "overlay" | "audio"; id: string } | null;
type Panel = null | "media" | "audio" | "text" | "effect" | "overlay" | "caption" | "filter" | "ratio" | "bg" | "speed" | "volume" | "zoom" | "export" | "hd" | "slow" | "tts" | "grid";
/** AI 음성 목소리 (서버 lib/edit.ts VOICES 와 같게) */
const VOICE_LIST = [
  { id: "ko-KR-SunHiNeural", label: "선희 (여성)" },
  { id: "ko-KR-InJoonNeural", label: "인준 (남성)" },
  { id: "ko-KR-HyunsuMultilingualNeural", label: "현수 (남성·다국어)" },
];

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
  cutout: "M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 20c0-3.3 2.7-6 6-6s6 2.7 6 6M3 3h3M18 3h3M3 21h3M18 21h3",
  hd: "M3 5h18v14H3zM7 9v6M7 12h3M10 9v6M14 9v6h2a3 3 0 0 0 0-6h-2z",
  slow: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l-3 2",
  voice: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  grid: "M3 6h4v12H3zM10 6h4v12h-4zM17 6h4v12h-4z",
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
  const [tts, setTts] = useState({ text: "", voice: VOICE_LIST[0].id, rate: 0, captions: true });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [media, setMedia] = useState(initialMedia);
  const [pickFor, setPickFor] = useState<"append" | "overlay" | "audio" | "grid" | null>(null);
  // 🔲 나란히 놓기 설정 + 칸에 넣을 것 (기존 오버레이 id 또는 새 영상 m:<미디어id>)
  const [grid, setGrid] = useState<{ n: number; dir: GridDir; shape: GridShape; gap: number; margin: number; same: boolean }>({ n: 4, dir: "row", shape: "fill", gap: 1, margin: 0, same: true });
  const [slots, setSlots] = useState<string[]>([]);
  const frameEl = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, { l: number; t: number; w: number; h: number }>>({});
  const [res, setRes] = useState<(typeof RES)[number]>("1080p");
  const [err, setErr] = useState("");
  const [musicCredit, setMusicCredit] = useState("");
  const [pps, setPps] = useState(60); // 1초 = px
  const player = useRef<PlayerRef>(null);
  const fontUrls = useMemo(() => Object.fromEntries(fontFaces().map(({ id, w }) => [faceKey(id, w), fontRoute(id, w)])), []);
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
  const [W, H] = docSize(doc);
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
  /**
   * 재생 위치 옮기기 (마우스로도 쉽게)
   * - 타임라인 빈 곳·눈금을 잡고 좌우로 끌기 → 재생 위치가 따라감 (재생 중이면 멈춤)
   * - 눈금(시간 줄)을 누르면 그 시간으로 바로 이동
   * - 마우스 휠을 굴려도 좌우로 이동
   */
  const scrub = useRef<{ x: number; left: number; moved: boolean; ruler: boolean } | null>(null);
  const justScrubbed = useRef(false);
  const scrubDown = (e: React.PointerEvent) => {
    const el = tl.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".cut-clip, .cut-blk, .cut-add, .cut-addrow, .cut-h, button")) return;
    if (player.current?.isPlaying()) player.current.pause();
    scrub.current = { x: e.clientX, left: el.scrollLeft, moved: false, ruler: !!(e.target as HTMLElement).closest(".cut-ruler") };
    el.setPointerCapture?.(e.pointerId);
  };
  const scrubMove = (e: React.PointerEvent) => {
    const s = scrub.current, el = tl.current;
    if (!s || !el) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 3) s.moved = true;
    if (s.moved) el.scrollLeft = s.left - dx; // onScroll 이 재생 위치를 맞춤
  };
  const scrubUp = (e: React.PointerEvent) => {
    const s = scrub.current, el = tl.current;
    scrub.current = null;
    if (!s || !el) return;
    if (s.moved) { justScrubbed.current = true; setTimeout(() => (justScrubbed.current = false), 0); return; }
    if (s.ruler) {
      // 눈금을 누른 곳의 시간으로 (가운데 고정선이 그 시간에 오게)
      const r = el.getBoundingClientRect();
      const sec = (e.clientX - r.left + el.scrollLeft - el.clientWidth / 2) / pps;
      seek(Math.max(0, Math.min(total, sec)));
      justScrubbed.current = true; setTimeout(() => (justScrubbed.current = false), 0);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const el = tl.current;
    if (!el || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    el.scrollLeft += e.deltaY;
  };
  const toggle = () => (player.current?.isPlaying() ? player.current.pause() : player.current?.play());
  // 구간만 재생 (글자 효과 보기): 끝나면 멈춤
  const playRange = (from: number, to: number) => {
    const a = Math.max(0, Math.round(from * fps)), b = Math.min(frames - 1, Math.round(to * fps));
    player.current?.pause(); player.current?.seekTo(a); setFrame(a);
    setTimeout(() => {
      player.current?.play();
      const stop = () => { const f = player.current?.getCurrentFrame() ?? b; if (f >= b - 1 || !player.current?.isPlaying()) { player.current?.pause(); return; } requestAnimationFrame(stop); };
      requestAnimationFrame(stop);
    }, 50);
  };

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
    if (sel?.kind === "overlay" && selOv) {
      const o = t - selOv.start;
      if (o < 0.15 || selOv.dur - o < 0.15) return;
      setDoc((d) => ({ ...d, overlays: d.overlays.flatMap((x) => (x.id === selOv.id ? [{ ...x, dur: r2(o) }, { ...x, id: sid(), start: r2(t), dur: r2(selOv.dur - o), in: x.kind === "image" ? x.in : r2(x.in + o) }] : [x])) }));
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
    if (pickFor === "grid") { const k = `m:${m.id}`; setSlots((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k])); return; }
    const kind = m.id.startsWith("img_") ? "image" : "video";
    const len = kind === "image" ? 3 : r2(m.duration ?? 5);
    if (pickFor === "append") setDoc((d) => ({ ...d, clips: [...d.clips, { id: sid(), src: m.id, kind, in: 0, out: len, speed: 1, volume: 1, filter: "none", transition: "none", zoom: null, fit: "cover" }] }));
    if (pickFor === "overlay") { const id = sid(); setDoc((d) => { const spot = emptySpot(d); const room = editDuration(d) - t; return { ...d, overlays: [...d.overlays, spot ? { id, src: m.id, kind, start: r2(t), dur: r2(Math.max(0.5, Math.min(len, room > 0.5 ? room : len))), in: 0, opacity: 1, volume: 0, radius: 0, ...spot } : { id, src: m.id, kind, start: r2(t), dur: Math.min(len, 5), in: 0, x: 70, y: 30, w: 40, opacity: 1, volume: 0, radius: 10 }] }; }); setSel({ kind: "overlay", id }); setPanel("overlay"); }
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

  // ✂️ 오버레이 자르기 (시간): 앞·뒤 자르기, 기준 영상(본 클립)에 맞추기
  const [ovNote, setOvNote] = useState("");
  const ovSrcLen = (o: Overlay) => (o.kind === "image" ? Infinity : durOf(o.src));
  function trimOv(o: Overlay, side: "head" | "tail") {
    const k = t - o.start;
    if (k < 0.1 || o.dur - k < 0.1) { setOvNote("재생 막대(흰 선)를 이 오버레이 안으로 옮긴 뒤 눌러 주세요."); return; }
    setOvNote("");
    if (side === "head") patchOv(o.id, { start: r2(t), dur: r2(o.dur - k), in: o.kind === "image" ? o.in : r2(o.in + k) });
    else patchOv(o.id, { dur: r2(k) });
  }
  function fitOv(o: Overlay, whole: boolean) {
    if (!doc.clips.length) { setOvNote("기준이 될 본 영상(아래 첫 줄)이 없어요."); return; }
    let a = 0, b = starts[doc.clips.length - 1] + clipLen(doc.clips[doc.clips.length - 1]);
    if (!whole) { const i = clipAt(Math.max(o.start, t >= o.start && t < o.start + o.dur ? t : o.start)); a = starts[i]; b = a + clipLen(doc.clips[i]); }
    const want = b - a, can = ovSrcLen(o) - o.in;
    const dur = r2(Math.max(0.2, Math.min(want, can)));
    patchOv(o.id, { start: r2(a), dur });
    setOvNote(can + 0.05 < want ? `오버레이 영상이 ${r2(want - can)}초 짧아서 끝부분은 비어요. '영상 몇 초부터'를 앞으로 당기면 더 길게 쓸 수 있어요.` : `기준 영상 ${fmt(a)}~${fmt(b)}에 맞췄어요 (넘치는 부분은 잘라냈어요).`);
  }

  // ▣ 미리보기 위 오버레이 상자: 실제 그려진 위치를 재서 (%) 끌어 옮기기·모서리로 크기 조절
  const ovNow = doc.overlays.filter((o) => t >= o.start - 1e-6 && t < o.start + o.dur);
  const ovKey = ovNow.map((o) => `${o.id}:${o.x}:${o.y}:${o.w}:${o.h}:${o.fit}`).join("|");
  useEffect(() => {
    let alive = true;
    const measure = () => {
      const f = frameEl.current;
      if (!alive || !f) return;
      const fr = f.getBoundingClientRect();
      if (!fr.width || !fr.height) return;
      const out: Record<string, { l: number; t: number; w: number; h: number }> = {};
      f.querySelectorAll<HTMLElement>("[data-ov]").forEach((el) => {
        const r = el.getBoundingClientRect();
        out[el.dataset.ov!] = { l: ((r.left - fr.left) / fr.width) * 100, t: ((r.top - fr.top) / fr.height) * 100, w: (r.width / fr.width) * 100, h: (r.height / fr.height) * 100 };
      });
      setBoxes(out);
    };
    const a = requestAnimationFrame(measure);
    const b = setTimeout(measure, 250); // 영상이 늦게 뜨면 한 번 더
    const ro = new ResizeObserver(measure);
    if (frameEl.current) ro.observe(frameEl.current);
    return () => { alive = false; cancelAnimationFrame(a); clearTimeout(b); ro.disconnect(); };
  }, [ovKey, frame, doc.ratio, W, H]);
  const ovDrag = useRef<{ id: string; mode: string; sx: number; sy: number; fw: number; fh: number; base: EditDoc; o: Overlay; h0: number } | null>(null);
  function ovDown(e: React.PointerEvent, o: Overlay, mode: string) {
    e.stopPropagation(); e.preventDefault();
    const fr = frameEl.current?.getBoundingClientRect();
    if (!fr) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (player.current?.isPlaying()) player.current.pause();
    setSel({ kind: "overlay", id: o.id }); setPanel((p) => (p === "grid" ? p : "overlay"));
    ovDrag.current = { id: o.id, mode, sx: e.clientX, sy: e.clientY, fw: fr.width, fh: fr.height, base: doc, o, h0: o.h ?? boxes[o.id]?.h ?? o.w };
  }
  function ovMove(e: React.PointerEvent) {
    const d = ovDrag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / d.fw) * 100, dy = ((e.clientY - d.sy) / d.fh) * 100;
    const o = d.o;
    let p: Partial<Overlay>;
    if (d.mode === "move") {
      // 화면 가장자리·가운데, 다른 칸 가장자리에 붙기 (1%)
      const h = o.h ?? d.h0;
      let x = o.x + dx, y = o.y + dy;
      if (!e.altKey) {
        const others = d.base.overlays.filter((q) => q.id !== o.id && boxes[q.id]);
        // 자석: 왼쪽 끝→화면 왼쪽, 오른쪽 끝→화면 오른쪽, 가운데→화면 가운데, 다른 칸 끝끼리 (1%)
        const snap = (c: number, half: number, others: number[]) => {
          if (Math.abs(c - 50) < 1) return 50;
          if (Math.abs(c - half) < 1) return half;
          if (Math.abs(c + half - 100) < 1) return 100 - half;
          for (const v of others) for (const edge of [-half, half]) if (Math.abs(c + edge - v) < 1) return v - edge;
          return c;
        };
        x = snap(x, o.w / 2, others.flatMap((q) => [boxes[q.id].l, boxes[q.id].l + boxes[q.id].w]));
        y = snap(y, h / 2, others.flatMap((q) => [boxes[q.id].t, boxes[q.id].t + boxes[q.id].h]));
        // 화면 밖으로 나가 안 보이게 되지 않도록 (Alt 누르면 밖으로도 가능)
        x = Math.max(Math.min(o.w, 100) / 2, Math.min(100 - Math.min(o.w, 100) / 2, x));
        y = Math.max(Math.min(h, 100) / 2, Math.min(100 - Math.min(h, 100) / 2, y));
      }
      p = { x: r2(x), y: r2(y) };
    } else {
      const sxs = d.mode.includes("e") ? 1 : -1, sys = d.mode.includes("s") ? 1 : -1;
      // 반대쪽 모서리는 그대로, 끄는 쪽은 화면 끝까지만
      const L = o.x - o.w / 2, R = o.x + o.w / 2, T = o.y - d.h0 / 2, B = o.y + d.h0 / 2;
      const maxW = e.altKey ? 100 : Math.max(3, sxs > 0 ? 100 - Math.max(0, L) : Math.min(100, R));
      const maxH = e.altKey ? 100 : Math.max(3, sys > 0 ? 100 - Math.max(0, T) : Math.min(100, B));
      let w = Math.max(3, o.w + sxs * dx), h = Math.max(3, d.h0 + sys * dy);
      if (e.shiftKey) { const k = Math.max(w / o.w, h / d.h0); w = o.w * k; h = d.h0 * k; const f = Math.min(1, maxW / w, maxH / h); w *= f; h *= f; }
      w = Math.min(maxW, w); h = Math.min(maxH, h);
      const ax = sxs > 0 ? Math.max(0, L) : Math.min(100, R), ay = sys > 0 ? Math.max(0, T) : Math.min(100, B);
      p = { w: r2(w), h: r2(h), x: r2(e.altKey ? o.x + (sxs * (w - o.w)) / 2 : ax + (sxs * w) / 2), y: r2(e.altKey ? o.y + (sys * (h - d.h0)) / 2 : ay + (sys * h) / 2), fit: o.fit ?? "cover" };
    }
    setDocRaw({ ...d.base, overlays: d.base.overlays.map((q) => (q.id === o.id ? { ...q, ...p } : q)) });
    setSave("dirty");
  }
  function ovUp() {
    const d = ovDrag.current;
    ovDrag.current = null;
    if (d) { hist.current.past = [...hist.current.past.slice(-80), d.base]; hist.current.future = []; }
  }
  /** 칸 크기를 정해진 상자로 (지금 보이는 크기 그대로 시작) */
  const boxH = (o: Overlay) => r2(o.h ?? boxes[o.id]?.h ?? o.w);

  // ⇔ 화면 자체를 끌어 늘리기: 본 영상은 원래 자리에 두고, 늘어난 곳은 빈 자리(배경색) → 오버레이로 채움
  const stageEl = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const cs = getComputedStyle(el); setStage({ w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitK = stage.w > 0 && stage.h > 0 ? Math.min(stage.w / W, stage.h / H) : 0;
  const cvDrag = useRef<{ side: "l" | "r" | "t" | "b"; sx: number; sy: number; k: number; base: EditDoc; W0: number; H0: number } | null>(null);
  const [cvLabel, setCvLabel] = useState("");
  function cvDown(e: React.PointerEvent, side: "l" | "r" | "t" | "b") {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (player.current?.isPlaying()) player.current.pause();
    const fr = frameEl.current?.getBoundingClientRect();
    if (!fr) return;
    cvDrag.current = { side, sx: e.clientX, sy: e.clientY, k: W / fr.width, base: doc, W0: W, H0: H };
  }
  function cvMove(e: React.PointerEvent) {
    const d = cvDrag.current;
    if (!d) return;
    const horiz = d.side === "l" || d.side === "r";
    const delta = (horiz ? e.clientX - d.sx : e.clientY - d.sy) * d.k * (d.side === "l" || d.side === "t" ? -1 : 1);
    const len0 = horiz ? d.W0 : d.H0;
    let len = Math.max(240, Math.min(3840, len0 + delta));
    // 원래 길이의 1.5배·2배·3배 근처면 딱 맞춤 (두 영상이 같은 크기로 나란히)
    for (const m of [1, 1.5, 2, 2.5, 3]) if (Math.abs(len - len0 * m) < len0 * 0.04) len = len0 * m;
    len = Math.round(len / 2) * 2;
    const nW = horiz ? len : d.W0, nH = horiz ? d.H0 : len;
    const sx = d.side === "l" ? nW - d.W0 : 0, sy = d.side === "t" ? nH - d.H0 : 0; // 왼쪽·위로 늘리면 내용이 그만큼 밀림
    const b = d.base;
    const cb0 = b.clipBox ?? { x: 0, y: 0, w: 100, h: 100 };
    const px = { x: (cb0.x / 100) * d.W0 + sx, y: (cb0.y / 100) * d.H0 + sy, w: (cb0.w / 100) * d.W0, h: (cb0.h / 100) * d.H0 };
    const cb = { x: r2((px.x / nW) * 100), y: r2((px.y / nH) * 100), w: r2((px.w / nW) * 100), h: r2((px.h / nH) * 100) };
    const full = Math.abs(cb.x) < 0.3 && Math.abs(cb.y) < 0.3 && Math.abs(cb.w - 100) < 0.3 && Math.abs(cb.h - 100) < 0.3;
    const n: EditDoc = {
      ...b,
      size: [nW, nH],
      clipBox: full ? undefined : cb,
      overlays: b.overlays.map((o) => ({ ...o, x: r2((((o.x / 100) * d.W0 + sx) / nW) * 100), y: r2((((o.y / 100) * d.H0 + sy) / nH) * 100), w: r2((((o.w / 100) * d.W0) / nW) * 100), ...(o.h != null ? { h: r2((((o.h / 100) * d.H0) / nH) * 100) } : {}) })),
      texts: b.texts.map((t) => ({ ...t, style: { ...t.style, x: t.style.x + sx, y: t.style.y + sy } })),
    };
    setDocRaw(n);
    setSave("dirty");
    setCvLabel(`${nW} × ${nH}${len === len0 * 2 ? " (2배)" : len === len0 * 3 ? " (3배)" : len === len0 * 1.5 ? " (1.5배)" : ""}`);
  }
  function cvUp() {
    const d = cvDrag.current;
    cvDrag.current = null;
    setCvLabel("");
    if (d) { hist.current.past = [...hist.current.past.slice(-80), d.base]; hist.current.future = []; }
  }
  /** 화면을 늘려서 생긴 빈 자리 중 가장 넓은 곳 (새 오버레이를 거기에 꽉 채워 놓음) */
  function emptySpot(d: EditDoc) {
    const c = d.clipBox;
    if (!c) return null;
    const spots = [
      { x: 0, y: 0, w: c.x, h: 100 }, { x: c.x + c.w, y: 0, w: 100 - (c.x + c.w), h: 100 },
      { x: 0, y: 0, w: 100, h: c.y }, { x: 0, y: c.y + c.h, w: 100, h: 100 - (c.y + c.h) },
    ].filter((r) => r.w > 3 && r.h > 3);
    const [cw, ch] = docSize(d);
    const best = spots.sort((a, b) => b.w * cw * b.h * ch - a.w * cw * a.h * ch)[0];
    if (!best) return null;
    // 이미 오버레이가 그 자리를 덮고 있으면 null (겹쳐 쌓지 않게)
    if (d.overlays.some((o) => o.h != null && Math.abs(o.x - (best.x + best.w / 2)) < 2 && Math.abs(o.y - (best.y + best.h / 2)) < 2 && t >= o.start && t < o.start + o.dur)) return null;
    return { x: r2(best.x + best.w / 2), y: r2(best.y + best.h / 2), w: r2(best.w), h: r2(best.h), fit: "cover" as const };
  }

  // 🔲 나란히 놓기
  const cells = layoutCells({ ...grid, W, H });
  function openGrid() {
    const now = doc.overlays.filter((o) => t >= o.start - 1e-6 && t < o.start + o.dur).map((o) => o.id);
    setSlots((s) => { const keep = s.filter((k) => k.startsWith("m:") || doc.overlays.some((o) => o.id === k)); return keep.length ? keep : now; });
    setGrid((g) => ({ ...g, n: Math.max(2, Math.min(12, now.length >= 2 ? now.length : g.n)) }));
    setPanel("grid");
  }
  function applyGrid() {
    const use = slots.slice(0, cells.length);
    if (!use.length) { setErr("칸에 넣을 영상을 먼저 골라 주세요."); return; }
    setErr("");
    setDoc((d) => {
      const lenOf = (k: string) => { if (k.startsWith("m:")) { const m = media.find((x) => x.id === k.slice(2)); return m?.id.startsWith("img_") ? 5 : r2(m?.duration ?? 5); } const o = d.overlays.find((x) => x.id === k); return o ? o.dur : 5; };
      const room = editDuration(d) - t;
      const same = grid.same ? r2(Math.max(0.5, Math.min(...use.map(lenOf), room > 0.5 ? room : Infinity))) : 0;
      let ovs = [...d.overlays];
      use.forEach((k, i) => {
        const c = cells[i];
        const pos = { x: c.x, y: c.y, w: c.w, h: c.h, fit: "cover" as const };
        if (k.startsWith("m:")) {
          const m = media.find((x) => x.id === k.slice(2));
          if (!m) return;
          const kind = m.id.startsWith("img_") ? "image" as const : "video" as const;
          ovs.push({ id: sid(), src: m.id, kind, start: r2(t), dur: same || Math.min(lenOf(k), 5), in: 0, opacity: 1, volume: 0, radius: 0, ...pos });
        } else ovs = ovs.map((o) => (o.id === k ? { ...o, ...pos, ...(grid.same ? { start: r2(t), dur: same } : {}) } : o));
      });
      return { ...d, overlays: ovs };
    });
    setSlots([]);
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
    if (d.kind === "ov-r") n = { ...b, overlays: b.overlays.map((x) => (x.id === d.id ? { ...x, dur: r2(Math.max(0.2, Math.min(ovSrcLen(x) - x.in, d.b + dt))) } : x)) };
    if (d.kind === "ov-l") n = { ...b, overlays: b.overlays.map((x) => { if (x.id !== d.id) return x; const k = Math.max(-d.a, x.kind === "image" ? -Infinity : -x.in, Math.min(x.dur - 0.2, dt)); return { ...x, start: r2(d.a + k), dur: r2(x.dur - k), in: x.kind === "image" ? x.in : r2(x.in + k) }; }) };
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
      if (isTyping(e)) return;
      const u = undoKey(e);
      if (u) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); return u === "redo" ? redo() : undo(); }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === " ") { e.preventDefault(); toggle(); }
      // ←/→ 한 프레임, Shift 누르면 1초 (재생 중이면 멈추고 이동)
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); if (player.current?.isPlaying()) player.current.pause(); seek(t + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / fps)); }
      if (keyIs(e, "s")) split();
      if (e.key === "Delete" || e.key === "Backspace") remove();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const half = tlW / 2;
  const clipTools: [string, string, () => void][] = [
    ["split", "분할", split], ["speed", "속도", () => setPanel("speed")], ["volume", "볼륨", () => setPanel("volume")], ["filter", "필터", () => setPanel("filter")], ["effect", "전환", () => setPanel("effect")],
    ["zoom", "줌·키프레임", () => setPanel("zoom")], ["reverse", "역재생", () => selClip && mac({ action: "reverse", clipId: selClip.id })],
    ["cutout", "배경 제거", () => selClip && confirm(`이 클립의 배경을 지우고 사람만 남길까요?\n맥에서 1초에 15장씩 처리해요 (10초 클립이면 약 3분, 무료). 최대 20초.`) && mac({ action: "fx", itemId: selClip.id, fx: "bgremove" })],
    ["hd", "화질 업", () => setPanel("hd")], ["slow", "슬로모션", () => setPanel("slow")], ["copy", "복제", duplicate], ["left", "앞으로", () => moveClip(-1)], ["right", "뒤로", () => moveClip(1)], ["trash", "삭제", remove],
  ];
  const mainTools: [string, string, () => void][] = [
    ["edit", "편집", () => { if (doc.clips[clipAt(t)]) setSel({ kind: "clip", id: doc.clips[clipAt(t)].id }); }],
    ["audio", "오디오", () => setPanel("audio")], ["voice", "AI 음성", () => setPanel("tts")], ["text", "텍스트", addText], ["effect", "편집효과", () => { if (doc.clips[clipAt(t)]) { setSel({ kind: "clip", id: doc.clips[clipAt(t)].id }); setPanel("effect"); } }],
    ["overlay", "오버레이", () => setPickFor("overlay")], ["grid", "나란히", openGrid], ["caption", "캡션", () => setPanel("caption")], ["filter", "필터", () => setPanel("filter")], ["ratio", "비율", () => setPanel("ratio")], ["bg", "배경", () => setPanel("bg")],
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
      <div className="cut-stage" ref={stageEl}>
        <div className="cut-frame" ref={frameEl} style={fitK ? { width: W * fitK, height: H * fitK } : { aspectRatio: `${W} / ${H}` }}>
          {doc.clips.length || doc.overlays.length ? (
            <Player ref={player} showPosterWhenBuffering showPosterWhenBufferingAndPaused renderPoster={({ isBuffering }: { isBuffering: boolean }) => (isBuffering ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 14, fontWeight: 700 }}><span><span className="spinner" /> 영상 불러오는 중…</span></div> : null)} component={Edit} inputProps={{ doc, srcs, fontUrl: "/api/reels/font", fontUrls }} durationInFrames={frames} fps={fps} compositionWidth={W} compositionHeight={H} style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
          ) : (
            <button className="cut-empty" onClick={() => setPickFor("append")}>＋ 영상 추가</button>
          )}
          {/* ⇔ 화면 가장자리 손잡이: 끌면 화면이 늘어나고 본 영상은 제자리 */}
          {!playing && (doc.clips.length > 0 || doc.overlays.length > 0) && (["l", "r", "t", "b"] as const).map((sd) => (
            <i key={sd} className={`cut-cvh ${sd}`} title="끌어서 화면 늘리기·줄이기 (본 영상은 그 자리에)" aria-label="화면 크기 손잡이" onPointerDown={(e) => cvDown(e, sd)} onPointerMove={cvMove} onPointerUp={cvUp} onPointerCancel={cvUp} />
          ))}
          {cvLabel && <span className="cut-cvlabel">{cvLabel}</span>}
          {/* 오버레이 상자: 눌러서 고르기 · 끌어서 옮기기 · 모서리로 크기 (Shift 비율 유지, Alt 자석 끄기) */}
          {!playing && ovNow.map((o) => {
            const b = boxes[o.id];
            if (!b) return null;
            const on = sel?.kind === "overlay" && sel.id === o.id;
            const n = panel === "grid" ? slots.indexOf(o.id) : -1;
            return (
              <div key={o.id} className={`cut-ovbox${on ? " on" : ""}`} style={{ left: `${b.l}%`, top: `${b.t}%`, width: `${b.w}%`, height: `${b.h}%` }} title="끌어서 옮기기 · 모서리를 끌면 크기 조절 (Shift: 비율 유지)" onPointerDown={(e) => ovDown(e, o, "move")} onPointerMove={ovMove} onPointerUp={ovUp} onPointerCancel={ovUp}>
                {n >= 0 && <span className="cut-ovnum">{n + 1}</span>}
                {on && (["nw", "ne", "sw", "se"] as const).map((c) => <i key={c} className={`cut-ovh ${c}`} aria-label="크기 조절" onPointerDown={(e) => ovDown(e, o, c)} onPointerMove={ovMove} onPointerUp={ovUp} onPointerCancel={ovUp} />)}
              </div>
            );
          })}
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
        <div className="cut-tl" ref={tl} onScroll={onScroll} onWheel={onWheel} onPointerDown={scrubDown} onPointerMove={(e) => { scrubMove(e); move(e); }} onPointerUp={(e) => { scrubUp(e); up(); }} onClick={() => { if (justScrubbed.current) return; setSel(null); setPanel(null); }} title="빈 곳을 잡고 좌우로 끌거나, 위 시간 눈금을 누르거나, 휠을 굴려 재생 위치를 옮겨요">
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
                  <i className="cut-h l" onPointerDown={(e) => down(e, "ov-l", o.id, o.start, o.in)} />▣ {media.find((m) => m.id === o.src)?.title ?? "오버레이"}<i className="cut-h r" onPointerDown={(e) => down(e, "ov-r", o.id, o.start, o.dur)} />
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
          <div className="cut-panel-head"><b>{{ media: "", audio: "오디오", text: "텍스트", effect: "전환 효과", overlay: "오버레이", caption: "캡션", filter: "필터", ratio: "비율", bg: "배경", speed: "속도", volume: "볼륨", zoom: "줌 · 키프레임", export: "", hd: "화질 업 (AI)", slow: "슬로모션 (AI)", tts: "AI 음성", grid: "🔲 나란히 놓기 (한 화면에 여러 영상)" }[panel]}</b><button className="cut-icon" onClick={() => setPanel(null)}>✓</button></div>
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
              <div className="cut-row-ctl" style={{ gap: 6 }}>글꼴 <FontPicker value={selText.style.font ?? "noto"} onPick={(font) => patchText(selText.id, { style: { ...selText.style, font } })} /></div>
              <TextMotionPicker chip="cut-chips" s={selText.style} onStyle={(p) => patchText(selText.id, { style: { ...selText.style, ...p } })} onPreview={() => playRange(selText.start, selText.end)} />
              <div className="row" style={{ gap: 6 }}><button className="cut-btn" onClick={split}>✂️ 분할</button><button className="cut-btn" onClick={duplicate}>⧉ 복제</button><button className="cut-btn" onClick={remove}>🗑 삭제</button></div>
            </div>
          )}
          {panel === "overlay" && selOv && (
            <div className="stack" style={{ gap: 6 }}>
              <label className="cut-row-ctl">가로 <input type="range" min={0} max={100} value={selOv.x} onChange={(e) => patchOv(selOv.id, { x: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">세로 <input type="range" min={0} max={100} value={selOv.y} onChange={(e) => patchOv(selOv.id, { y: Number(e.target.value) })} /></label>
              <span className="cut-hint">💡 미리보기에서 영상을 끌어 옮기고, 모서리 점을 끌어 크기를 바꿔요 (Shift 누르면 비율 유지). 화면(틀 안)만 영상에 나와요 — 옆으로 더 넓게 쓰려면 화면 가장자리의 <b>흰 손잡이</b>를 끌어 화면을 늘리세요.</span>
              {(selOv.x - selOv.w / 2 > 98 || selOv.x + selOv.w / 2 < 2 || selOv.y - boxH(selOv) / 2 > 98 || selOv.y + boxH(selOv) / 2 < 2) && <button className="cut-btn primary" onClick={() => patchOv(selOv.id, { x: 50, y: 50, w: Math.min(selOv.w, 90), ...(selOv.h ? { h: Math.min(selOv.h, 90) } : {}) })}>⚠️ 화면 밖에 있어요 — 화면 안으로 가져오기</button>}
              <div className="cut-chips">
                <span className="cut-hint">모양</span>
                <button className={!selOv.h ? "on" : ""} onClick={() => patchOv(selOv.id, { h: undefined, fit: undefined })}>원래 비율</button>
                <button className={selOv.h && selOv.fit !== "contain" ? "on" : ""} onClick={() => patchOv(selOv.id, { h: boxH(selOv), fit: "cover" })}>칸 꽉 채우기 (넘치면 잘림)</button>
                <button className={selOv.h && selOv.fit === "contain" ? "on" : ""} onClick={() => patchOv(selOv.id, { h: boxH(selOv), fit: "contain" })}>칸 안에 전체 보이기</button>
              </div>
              <label className="cut-row-ctl">가로 크기 <input type="range" min={2} max={100} step={0.5} value={selOv.w} onChange={(e) => patchOv(selOv.id, { w: Number(e.target.value) })} /><input className="cut-num" type="number" min={2} max={100} step={0.5} value={selOv.w} onChange={(e) => patchOv(selOv.id, { w: Math.max(2, Math.min(100, Number(e.target.value) || 2)) })} aria-label="가로 크기 %" />%</label>
              {selOv.h != null && <label className="cut-row-ctl">세로 크기 <input type="range" min={3} max={100} step={0.5} value={selOv.h} onChange={(e) => patchOv(selOv.id, { h: Number(e.target.value) })} /><input className="cut-num" type="number" min={3} max={100} step={0.5} value={selOv.h} onChange={(e) => patchOv(selOv.id, { h: Math.max(3, Math.min(100, Number(e.target.value) || 3)) })} aria-label="세로 크기 %" />%</label>}
              <div className="stack" style={{ gap: 4, padding: "6px 0", borderTop: "1px solid var(--cut-line, #333)", borderBottom: "1px solid var(--cut-line, #333)" }}>
                <span className="cut-hint">✂️ 자르기 — 타임라인의 보라색 막대 양 끝을 끌어도 돼요 · 지금 {fmt(selOv.start)}~{fmt(selOv.start + selOv.dur)} ({r2(selOv.dur)}초)</span>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="cut-btn primary" onClick={() => fitOv(selOv, false)}>📏 기준 영상에 맞추기</button>
                  <button className="cut-btn" onClick={() => fitOv(selOv, true)}>전체 길이에 맞추기</button>
                  <button className="cut-btn" onClick={() => trimOv(selOv, "head")}>⇤ 여기 앞 자르기</button>
                  <button className="cut-btn" onClick={() => trimOv(selOv, "tail")}>여기 뒤 자르기 ⇥</button>
                  <button className="cut-btn" onClick={split}>✂️ 여기서 나누기</button>
                </div>
                {selOv.kind === "video" && <label className="cut-row-ctl">영상 몇 초부터 <input type="range" min={0} max={Math.max(0, r2(ovSrcLen(selOv) - 0.2))} step={0.1} value={selOv.in} onChange={(e) => { const v = Number(e.target.value); patchOv(selOv.id, { in: v, dur: r2(Math.max(0.2, Math.min(selOv.dur, ovSrcLen(selOv) - v))) }); }} /><span className="cut-hint">{r2(selOv.in)}초</span></label>}
                {ovNote && <span className="cut-hint" style={{ color: "#fbbf24" }}>{ovNote}</span>}
              </div>
              <label className="cut-row-ctl">투명도 <input type="range" min={0} max={1} step={0.05} value={selOv.opacity} onChange={(e) => patchOv(selOv.id, { opacity: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">둥글게 <input type="range" min={0} max={100} value={selOv.radius} onChange={(e) => patchOv(selOv.id, { radius: Number(e.target.value) })} /></label>
              <label className="cut-row-ctl">소리 <input type="range" min={0} max={2} step={0.05} value={selOv.volume} onChange={(e) => patchOv(selOv.id, { volume: Number(e.target.value) })} /></label>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="cut-btn" disabled={busy} onClick={() => confirm("이 오버레이의 배경을 지우고 사람만 남길까요? (맥에서 무료, 영상은 20초 이하)") && mac({ action: "fx", itemId: selOv.id, fx: "bgremove" })}>✂️ 배경 제거</button>
                <button className="cut-btn" disabled={busy} onClick={() => setPanel("hd")}>✨ 화질 업</button>
                {selOv.kind === "video" && <button className="cut-btn" disabled={busy} onClick={() => setPanel("slow")}>🐢 슬로모션</button>}
              </div>
              <div className="row" style={{ gap: 6 }}><button className="cut-btn" onClick={() => setPickFor("overlay")}>＋ 하나 더</button><button className="cut-btn" onClick={openGrid}>🔲 나란히 놓기</button><button className="cut-btn" onClick={duplicate}>⧉ 복제</button><button className="cut-btn" onClick={remove}>🗑 삭제</button></div>
            </div>
          )}
          {(panel === "hd" || panel === "slow") && (selClip || selOv) && (() => {
            const it = (selClip ?? selOv)!;
            const isImg = it.kind === "image";
            if (panel === "slow" && isImg) return <span className="cut-hint">사진에는 슬로모션을 쓸 수 없어요.</span>;
            const opts: [string, string][] = panel === "hd" ? [["upscale2", "2배"], ["upscale4", "4배"]] : [["slow2", "2배 느리게"], ["slow4", "4배 느리게"]];
            return (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 6 }}>
                  {opts.map(([fx, l]) => <button key={fx} className="cut-btn primary" disabled={busy} onClick={() => mac({ action: "fx", itemId: it.id, fx })}>{panel === "hd" ? "✨ 화질 " : "🐢 "}{l}</button>)}
                </div>
                <span className="cut-hint">
                  {panel === "hd"
                    ? "AI가 흐린 영상·사진을 선명하게 키워요 (Real-ESRGAN, 맥에서 무료). 영상은 2배 15초·4배 10초 이하, 최대 4K. 원본은 영상공장에 그대로 남아요."
                    : "AI가 장면 사이 그림을 새로 그려 넣어 부드러운 슬로모션을 만들어요 (RIFE, 맥에서 무료). 2배 15초·4배 8초 이하. 소리도 같이 느려져요."}
                </span>
              </div>
            );
          })()}
          {panel === "tts" && (
            <div className="stack" style={{ gap: 6 }}>
              <textarea className="cut-input" rows={3} value={tts.text} onChange={(e) => setTts({ ...tts, text: e.target.value })} placeholder="읽어 줄 글 (예: 오늘은 집에서 5분 만에 만드는 감자전을 알려드릴게요!)" aria-label="AI 음성으로 읽을 글" />
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <select className="cut-input" style={{ width: "auto" }} value={tts.voice} onChange={(e) => setTts({ ...tts, voice: e.target.value })} aria-label="목소리">
                  {VOICE_LIST.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <label className="cut-row-ctl" style={{ flex: 1, minWidth: 160 }}>빠르기 {tts.rate > 0 ? "+" : ""}{tts.rate}% <input type="range" min={-30} max={50} step={5} value={tts.rate} onChange={(e) => setTts({ ...tts, rate: Number(e.target.value) })} /></label>
                <label className="cut-hint" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={tts.captions} onChange={(e) => setTts({ ...tts, captions: e.target.checked })} /> 자막도 넣기</label>
              </div>
              <button className="cut-btn primary" disabled={busy || !tts.text.trim()} onClick={() => mac({ action: "tts", text: tts.text, voice: tts.voice, rate: tts.rate, start: r2(t), captions: tts.captions })}>🗣 지금 위치에 AI 음성 넣기</button>
              <span className="cut-hint">마이크로소프트 무료 음성(edge-tts)으로 맥에서 만들어요. 인터넷 연결이 필요해요. 오디오 줄에 들어가고, 영상공장에도 남아요.</span>
            </div>
          )}
          {panel === "audio" && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 6 }}>
                <button className="cut-btn" onClick={() => setPickFor("audio")}>♪ 음악·소리 추가 (지금 위치)</button>
                <button className="cut-btn" onClick={() => setDoc((d) => ({ ...d, muteClips: !d.muteClips }))}>{doc.muteClips ? "🔊 클립 소리 켜기" : "🔇 클립 소리 끄기"}</button>
              </div>
              <span className="cut-hint">영상공장에 있는 영상의 소리나 올린 음악(mp3·m4a·wav)을 넣어요. 글을 읽어 주는 목소리는 아래 'AI 음성'에서.</span>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13 }}><b>🔍 무료 음원 찾기</b> <span className="cut-hint">(CC0·CC BY만)</span></summary>
                <div style={{ marginTop: 8 }}>
                  <MusicSearch dark onPick={async (m) => {
                    try {
                      const list = await api<{ videos: { id: string; title: string; duration: number | null; thumb_path: string | null; kind: string; status: string }[] }>("/api/videos");
                      setMedia(list.videos.filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, duration: v.duration, thumb: !!v.thumb_path, kind: v.kind })));
                    } catch { /* 목록은 다음에 */ }
                    // 지금 재생 위치에 오디오로 넣기
                    const id = sid();
                    const len = Math.max(1, Math.min(600, m.duration ?? 30));
                    setDoc((d) => ({ ...d, audios: [...d.audios, { id, src: m.videoId, start: r2(t), in: 0, dur: r2(len), volume: 0.8, label: `🎵 ${m.title}` }] }));
                    setSel({ kind: "audio", id }); setErr("");
                    setMusicCredit(m.credit);
                  }} />
                  {musicCredit && (
                    <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                      <span className="cut-hint">CC BY 음원이라 <b>릴스 캡션에 아래 출처를 적어야</b> 해요.</span>
                      <textarea className="cut-input" readOnly rows={2} value={musicCredit} aria-label="음원 출처 문구" />
                      <button className="cut-btn" style={{ alignSelf: "flex-start" }} onClick={async () => { try { await navigator.clipboard.writeText(musicCredit); } catch { /* 직접 복사 */ } }}>📋 출처 복사</button>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
          {panel === "caption" && (
            <div className="stack" style={{ gap: 6 }}>
              <button className="cut-btn primary" disabled={busy} onClick={() => mac({ action: "captions" })}>💬 자동 자막 만들기</button>
              <span className="cut-hint">맥이 클립의 말소리를 받아써서, 자르고 배속한 위치에 맞춰 자막을 넣어요 (무료). 다시 누르면 자동 자막만 새로 바꿔요. 만든 자막은 텍스트 줄에서 고칠 수 있어요.</span>
            </div>
          )}
          {panel === "ratio" && <div className="cut-chips">{(Object.keys(RATIO_SIZE) as Ratio[]).map((r) => <button key={r} className={doc.ratio === r && !doc.size ? "on" : ""} onClick={() => setDoc((d) => ({ ...d, ratio: r, size: undefined, clipBox: undefined }))}>{r}</button>)}<span className="cut-hint">9:16 릴스·쇼츠 · 16:9 유튜브 · 1:1·4:5 피드 · 미리보기 가장자리의 흰 손잡이를 끌면 화면을 원하는 만큼 늘릴 수 있어요{doc.size ? ` (지금 ${W}×${H})` : ""}</span></div>}
          {panel === "grid" && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="cut-chips"><span className="cut-hint">몇 칸</span>{[2, 3, 4, 5, 6, 8, 9].map((n) => <button key={n} className={grid.n === n ? "on" : ""} onClick={() => setGrid((g) => ({ ...g, n }))}>{n}컷</button>)}</div>
              <div className="cut-chips"><span className="cut-hint">놓는 방향</span>{GRID_DIR.map(([k, l]) => <button key={k} className={grid.dir === k ? "on" : ""} onClick={() => setGrid((g) => ({ ...g, dir: k }))}>{l}</button>)}</div>
              <div className="cut-chips"><span className="cut-hint">칸 모양</span>{GRID_SHAPE.map(([k, l]) => <button key={k} className={grid.shape === k ? "on" : ""} onClick={() => setGrid((g) => ({ ...g, shape: k }))}>{l}</button>)}</div>
              <label className="cut-row-ctl">칸 사이 <input type="range" min={0} max={10} step={0.5} value={grid.gap} onChange={(e) => setGrid((g) => ({ ...g, gap: Number(e.target.value) }))} /><span className="cut-hint">{grid.gap}%</span></label>
              <label className="cut-row-ctl">바깥 여백 <input type="range" min={0} max={15} step={0.5} value={grid.margin} onChange={(e) => setGrid((g) => ({ ...g, margin: Number(e.target.value) }))} /><span className="cut-hint">{grid.margin}%</span></label>
              <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ height: 120, background: "#111", borderRadius: 4, flexShrink: 0 }} aria-label="칸 나누기 미리보기">
                  {cells.map((c, i) => <g key={i}><rect x={((c.x - c.w / 2) / 100) * W} y={((c.y - c.h / 2) / 100) * H} width={(c.w / 100) * W} height={(c.h / 100) * H} fill={slots[i] ? "#7c5cff" : "#3a3a44"} stroke="#fff" strokeWidth={W / 200} /><text x={(c.x / 100) * W} y={(c.y / 100) * H} fill="#fff" fontSize={Math.min(W, H) / 10} textAnchor="middle" dominantBaseline="middle">{i + 1}</text></g>)}
                </svg>
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}>
                  <span className="cut-hint">칸에 넣을 영상 (순서대로 1, 2, 3…)</span>
                  {slots.map((k, i) => {
                    const ov = k.startsWith("m:") ? null : doc.overlays.find((o) => o.id === k);
                    const name = media.find((m) => m.id === (ov ? ov.src : k.slice(2)))?.title ?? "영상";
                    return (
                      <div key={k} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <b style={{ width: 18, opacity: i < cells.length ? 1 : 0.4 }}>{i + 1}</b>
                        <span className="ellipsis" style={{ flex: 1, fontSize: 12, opacity: i < cells.length ? 1 : 0.4 }}>{ov ? "▣ " : "＋ "}{name}</span>
                        <button className="cut-btn" style={{ padding: "2px 6px" }} disabled={i === 0} onClick={() => setSlots((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} aria-label="앞으로">↑</button>
                        <button className="cut-btn" style={{ padding: "2px 6px" }} onClick={() => setSlots((s) => s.filter((x) => x !== k))} aria-label="빼기">✕</button>
                      </div>
                    );
                  })}
                  {!slots.length && <span className="cut-hint">아직 없어요. 아래에서 영상을 골라 주세요.</span>}
                  {slots.length > cells.length && <span className="cut-hint">칸보다 {slots.length - cells.length}개 많아요 — 흐린 건 안 들어가요.</span>}
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <button className="cut-btn" onClick={() => setPickFor("grid")}>＋ 영상 고르기 (여러 개)</button>
                    {ovNow.some((o) => !slots.includes(o.id)) && <button className="cut-btn" onClick={() => setSlots((s) => [...s, ...ovNow.map((o) => o.id).filter((id) => !s.includes(id))])}>지금 화면의 오버레이 넣기</button>}
                  </div>
                  <label className="cut-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={grid.same} onChange={(e) => setGrid((g) => ({ ...g, same: e.target.checked }))} /> 모두 같은 때 시작·같은 길이로 (가장 짧은 영상에 맞춤)</label>
                  <button className="cut-btn primary" disabled={!slots.length} onClick={applyGrid}>✅ {Math.min(slots.length, cells.length) || grid.n}칸으로 놓기 ({fmt(t)}부터)</button>
                  <span className="cut-hint">놓은 뒤에도 칸마다 미리보기에서 끌어 옮기고 모서리로 크기를 바꿀 수 있어요.</span>
                </div>
              </div>
            </div>
          )}
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
        <Modal title={{ append: "영상·사진 추가", overlay: "오버레이 추가", audio: "오디오 추가", grid: "칸에 넣을 영상 고르기 (여러 개 눌러도 돼요)" }[pickFor]} onClose={() => setPickFor(null)}>
          <div className="stack" style={{ gap: 10 }}>
            <label className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>📁 내 파일 올리기<input type="file" hidden accept={pickFor === "audio" ? "audio/*,video/*" : "video/*,image/*"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            <div className="reel-files wide">
              {media.filter((m) => pickFor === "audio" || !m.title.startsWith("🎵")).map((m) => (
                <button key={m.id} className="reel-file" style={pickFor === "grid" && slots.includes(`m:${m.id}`) ? { outline: "3px solid #7c5cff", position: "relative" } : { position: "relative" }} onClick={() => pick(m)}>
                  {pickFor === "grid" && slots.includes(`m:${m.id}`) && <span className="cut-ovnum">{slots.indexOf(`m:${m.id}`) + 1}</span>}
                  {m.thumb ? <img src={`/api/videos/${m.id}/file?kind=thumb`} alt="" /> : m.id.startsWith("img_") ? <img src={`/api/img/${m.id}.jpg`} alt="" /> : <span className="reel-file-ph">{m.title.startsWith("🎵") ? "🎵" : "🎞"}</span>}
                  <span className="tiny ellipsis">{m.title}</span>
                  {m.duration != null && <span className="tiny muted">{Math.round(m.duration)}초</span>}
                </button>
              ))}
            </div>
            {err && <div className="notice notice-bad small">{err}</div>}
            {pickFor === "grid" && <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => setPickFor(null)}>다 골랐어요 ({slots.filter((k) => k.startsWith("m:")).length}개)</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
