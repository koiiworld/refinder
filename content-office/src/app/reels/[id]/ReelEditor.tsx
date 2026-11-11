"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { api } from "@/components/client-utils";
import { Reel } from "@/remotion/Reel";
import { docDuration, GUIDE_BOX, REEL_FONTS, sceneStarts, TEXT_PRESETS, type ReelBg, type ReelDoc, type ReelOverlay, type ReelText, type ReelTextStyle } from "@/remotion/types";
import * as op from "./ops";
import AiScriptBox from "../AiScriptBox";

/**
 * ✂️ 릴스 편집기
 * 위 = 프로젝트·저장·박스 밖 경고·화질·영상 뽑기
 * 왼쪽 = 내 파일 / 글자 / 장면 / 배경 · 가운데 = 편집 화면(가이드 박스) + 출력 미리보기 · 오른쪽 = 속성 / 원본 문구·색 / 메모
 * 아래 = 타임라인 (글자 · 위에 얹기 · 메인 · 소리)
 */
type FileVideo = { id: string; title: string; kind: string; duration: number | null; thumb: boolean };
type ReelInfo = { id: string; title: string; status: string; message: string; output_video_id: string | null; base_video_id: string | null; guide: { peaks?: number[]; segments?: { start: number; end: number; text: string }[] } };
type Sel = { kind: "scene" | "text" | "overlay"; id: string } | null;
type LTab = "files" | "text" | "scene" | "bg";
type RTab = "props" | "source" | "memo";
type XText = ReelText & { skipAll?: boolean };

const COLORS = ["#ffffff", "#f6f1f7", "#ffd6e8", "#ff9ec7", "#e0457b", "#ffcf99", "#ffe98a", "#c8f7dc", "#a8dcff", "#3355ff", "#c9b8ff", "#8a9aa8", "#1d1b29", "#000000"];
const GRADS: [string, string][] = [["#ffd1e8", "#e9d5ff"], ["#e9d5ff", "#bfdbfe"], ["#fde68a", "#fbcfe8"], ["#bae6fd", "#ddd6fe"], ["#eaeeff", "#ffffff"]];
const AURORAS: string[][] = [["#ff7eb3", "#7f7fff", "#ffd166", "#1a0b2e"], ["#9b5de5", "#f15bb5", "#00bbf9", "#10061f"]];
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const textBox = (x: ReelText) => ({ x: x.style.x - x.style.width / 2, y: x.style.y - x.style.size * 0.75, w: x.style.width, h: x.style.size * 1.5 });
const outside = (b: { x: number; y: number; w: number; h: number }) => b.x < GUIDE_BOX.x - 2 || b.y < GUIDE_BOX.y - 2 || b.x + b.w > GUIDE_BOX.x + GUIDE_BOX.w + 2 || b.y + b.h > GUIDE_BOX.y + GUIDE_BOX.h + 2;

export default function ReelEditor({ initial, initialDoc, files: initialFiles }: { initial: ReelInfo; initialDoc: ReelDoc; files: FileVideo[] }) {
  const [info, setInfo] = useState(initial);
  const [doc, setDocRaw] = useState<ReelDoc>(initialDoc);
  const [title, setTitle] = useState(initial.title);
  const hist = useRef<{ past: ReelDoc[]; future: ReelDoc[] }>({ past: [], future: [] });
  const [sel, setSel] = useState<Sel>(null);
  const [ltab, setLtab] = useState<LTab>("text");
  const [rtab, setRtab] = useState<RTab>("props");
  const [scopeAll, setScopeAll] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [files, setFiles] = useState(initialFiles);
  const [pickFile, setPickFile] = useState<string | null>(null); // 영상공장 파일 id 또는 사진 주소(/api/img/…)
  const [scriptText, setScriptText] = useState("");
  const [upload, setUpload] = useState<{ pct: number; name: string } | null>(null);
  const [pps, setPps] = useState(40);
  const [snap, setSnap] = useState(true);
  const [side, setSide] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [quality, setQuality] = useState<"720" | "1080">("720");
  const [projects, setProjects] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [err, setErr] = useState("");
  const player = useRef<PlayerRef>(null), out = useRef<PlayerRef>(null);
  const overlay = useRef<HTMLDivElement>(null), tl = useRef<HTMLDivElement>(null);

  const fps = doc.fps;
  const total = docDuration(doc);
  const totalFrames = Math.max(1, Math.round(total * fps));
  const t = frame / fps;
  const starts = useMemo(() => sceneStarts(doc), [doc]);
  const srcs = useMemo(() => {
    const ids = new Set<string>([doc.baseVideoId, ...doc.scenes.map((s) => s.video.videoId), ...(doc.overlays ?? []).map((o) => o.videoId)].filter(Boolean) as string[]);
    return Object.fromEntries(Array.from(ids).map((id) => [id, `/api/videos/${id}/file`]));
  }, [doc]);
  const fontUrls = useMemo(() => Object.fromEntries(REEL_FONTS.map((f) => [f.id, `/api/reels/font?f=${f.id}`])), []);
  const inputProps = useMemo(() => ({ doc, srcs, fontUrl: "/api/reels/font", fontUrls }), [doc, srcs, fontUrls]);
  const busy = info.status === "analyzing" || info.status === "rendering";

  useEffect(() => { api<{ id: string; title: string; created_at: string }[]>("/api/reels").then(setProjects).catch(() => {}); }, []);

  const setDoc = useCallback((next: ReelDoc | ((d: ReelDoc) => ReelDoc)) => {
    setDocRaw((cur) => {
      const n = typeof next === "function" ? next(cur) : next;
      if (n === cur) return cur;
      hist.current.past = [...hist.current.past.slice(-60), cur];
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
      try { await api(`/api/reels/${info.id}`, "PUT", { doc, title }); setSave("saved"); } catch (e) { setSave("error"); setErr((e as Error).message); }
    }, 1000);
    return () => clearTimeout(h);
  }, [doc, title, save, info.id]);

  // 초안 만드는 중·내보내는 중이면 상태 새로고침
  useEffect(() => {
    if (!busy) return;
    const h = setInterval(async () => {
      try {
        const r = await api<ReelInfo & { doc: ReelDoc }>(`/api/reels/${info.id}`);
        setInfo(r);
        if (info.status === "analyzing" && r.status !== "analyzing") { setDocRaw(r.doc); hist.current = { past: [], future: [] }; }
      } catch {}
    }, 3000);
    return () => clearInterval(h);
  }, [busy, info.id, info.status]);

  // 재생 위치 따라가기 + 출력 미리보기 맞추기
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => { setPlaying(true); out.current?.seekTo(p.getCurrentFrame()); out.current?.play(); };
    const onPause = () => { setPlaying(false); out.current?.pause(); out.current?.seekTo(p.getCurrentFrame()); };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => { p.removeEventListener("frameupdate", onFrame); p.removeEventListener("seeked", onFrame); p.removeEventListener("play", onPlay); p.removeEventListener("pause", onPause); };
  }, [doc.scenes.length > 0, side]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!playing) out.current?.seekTo(frame); }, [frame, playing, side]);

  const seek = (sec: number) => { const f = Math.max(0, Math.min(totalFrames - 1, Math.round(sec * fps))); player.current?.seekTo(f); setFrame(f); };
  const toggle = () => (player.current?.isPlaying() ? player.current.pause() : player.current?.play());

  const selScene = sel?.kind === "scene" ? doc.scenes.find((s) => s.id === sel.id) : undefined;
  const selText = sel?.kind === "text" ? (doc.texts.find((x) => x.id === sel.id) as XText | undefined) : undefined;
  const selOv = sel?.kind === "overlay" ? (doc.overlays ?? []).find((x) => x.id === sel.id) : undefined;
  const curScene = selScene ?? op.sceneAt(doc, t)?.scene;
  const outCount = doc.texts.filter((x) => outside(textBox(x))).length + (doc.overlays ?? []).filter((o) => outside(o)).length;

  function split() {
    if (sel?.kind === "text") setDoc((d) => op.splitText(d, sel.id, t));
    else { const at = op.sceneAt(doc, t); if (at) setDoc((d) => op.splitScene(d, at.scene.id, t)); }
  }
  function remove() {
    if (!sel) return;
    if (sel.kind === "text") setDoc((d) => op.deleteText(d, sel.id));
    else if (sel.kind === "overlay") setDoc((d) => op.deleteOverlay(d, sel.id));
    else setDoc((d) => op.deleteScene(d, sel.id));
    setSel(null);
  }
  function duplicate() {
    if (!sel) return;
    setDoc((d) => (sel.kind === "text" ? op.duplicateText(d, sel.id) : sel.kind === "overlay" ? op.duplicateOverlay(d, sel.id) : op.duplicateScene(d, sel.id)));
  }
  function newText() {
    const r = op.addText(doc, t, selText?.style ?? doc.texts[doc.texts.length - 1]?.style);
    setDoc(r.doc); setSel({ kind: "text", id: r.id }); setRtab("props");
  }
  function swap() { const at = selScene ?? op.sceneAt(doc, t)?.scene; if (at) { setSel({ kind: "scene", id: at.id }); setLtab("files"); } }
  const style = (patch: Partial<ReelTextStyle>) => {
    if (!selText && !scopeAll) return;
    setDoc((d) => op.styleTexts(d, scopeAll ? "all" : [selText!.id], patch));
  };
  const bg = (b: ReelBg) => setDoc((d) => op.setBg(d, scopeAll ? "all" : curScene ? [curScene.id] : "all", b));

  // 단축키
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); split(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seek(t - (e.shiftKey ? 1 : 1 / fps)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seek(t + (e.shiftKey ? 1 : 1 / fps)); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  async function exportReel() {
    setErr("");
    if (outCount && !confirm(`가이드 박스 밖에 있는 글자·얹기가 ${outCount}개 있어요. 인스타 화면에서 가려질 수 있어요. 그래도 영상을 뽑을까요?`)) return;
    try {
      if (save !== "saved") await api(`/api/reels/${info.id}`, "PUT", { doc, title });
      setSave("saved");
      await api(`/api/reels/${info.id}/render`, "POST", { quality });
      setInfo({ ...info, status: "rendering", message: "영상 뽑기 대기 중 (맥에서 만들어요)" });
    } catch (e) { setErr((e as Error).message); }
  }

  async function uploadPhoto(f: File) {
    setUpload({ pct: 30, name: f.name });
    try {
      const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
      const r = await api<{ url: string }>(`/api/reels/${info.id}/photo`, "POST", { dataUrl });
      setDoc((d) => ({ ...d, photos: [...(d.photos ?? []), r.url] }));
      setPickFile(r.url);
    } catch (e) { setErr((e as Error).message); }
    setUpload(null);
  }
  function uploadFile(f: File) {
    if (f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name)) { void uploadPhoto(f); return; }
    const fd = new FormData();
    fd.append("file", f);
    const x = new XMLHttpRequest();
    x.open("POST", "/api/videos/upload");
    setUpload({ pct: 0, name: f.name });
    x.upload.onprogress = (e) => e.lengthComputable && setUpload({ pct: Math.round((e.loaded / e.total) * 100), name: f.name });
    x.onload = async () => {
      setUpload(null);
      try {
        const r = JSON.parse(x.responseText);
        if (x.status >= 400) throw new Error(r.error ?? "올리기 실패");
        const list = await api<{ videos: (FileVideo & { status: string; thumb_path: string | null })[] }>("/api/videos");
        setFiles(list.videos.filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, kind: v.kind, duration: v.duration, thumb: !!v.thumb_path })));
        setPickFile(r.id);
      } catch (e) { setErr((e as Error).message); }
    };
    x.onerror = () => { setUpload(null); setErr("올리기 중 연결이 끊겼어요."); };
    x.send(fd);
  }
  const isPhoto = (k: string | null) => !!k && k.startsWith("/api/img/");
  const fileOf = (k: string | null) => files.find((f) => f.id === k);
  const isAudio = (k: string | null) => { const f = fileOf(k); return !!f && (f.title.startsWith("🎵") || f.kind === "audio"); };
  /** 메인 끝에 넣기: 사진 = 3초 장면, 영상 = 영상 길이(최대 15초) 장면 */
  function appendMain(k: string) {
    const f = fileOf(k);
    const dur = isPhoto(k) ? 3 : Math.max(1, Math.min(15, f?.duration ?? 5));
    const label = isPhoto(k) ? "사진" : (f?.title ?? "영상").slice(0, 20);
    setDoc((d) => ({ ...d, scenes: [...d.scenes, { id: op.nid(), label, dur, audioFrom: 0, video: { videoId: isPhoto(k) ? null : k, from: 0 }, fit: "cover", bg: { type: "none" }, image: isPhoto(k) ? k : null, kenburns: true }] }));
  }
  function replaceScene(k: string) {
    if (!curScene) return;
    setDoc((d) => op.patchScenes(d, [curScene.id], () => (isPhoto(k) ? { image: k, video: { videoId: null, from: 0 } } : { image: null, video: { videoId: k, from: 0 } })));
  }
  function overlayIt(k: string) {
    const r = op.addOverlay(doc, isPhoto(k) ? "" : k, t);
    const d2 = isPhoto(k) ? op.patchOverlay(r.doc, r.id, { videoId: undefined, image: k }) : r.doc;
    setDoc(d2); setSel({ kind: "overlay", id: r.id }); setRtab("props");
  }
  /** 대본 붙여넣기 → 글자 한 번에 (줄 수 = 장면 수면 장면마다, 아니면 글자 길이대로 차례로) */
  function scriptToTexts(replace: boolean) {
    const lines = scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const base = (replace ? undefined : doc.texts[doc.texts.length - 1]?.style) ?? doc.texts[0]?.style ?? { ...op.defaultStyle(), y: 960 };
    let ranges: [number, number][];
    if (lines.length === doc.scenes.length) ranges = doc.scenes.map((s, i) => [starts[i], starts[i] + s.dur]);
    else {
      const w = lines.map((l) => Math.max(4, Array.from(l).length));
      const sum = w.reduce((a, b) => a + b, 0);
      let a = 0;
      ranges = w.map((x) => { const b = a + (total * x) / sum; const r: [number, number] = [a, b]; a = b; return r; });
    }
    const made: ReelText[] = lines.map((l, i) => ({ id: op.nid(), start: Math.round(ranges[i][0] * 100) / 100, end: Math.round(ranges[i][1] * 100) / 100, text: l, style: { ...base } }));
    setDoc((d) => ({ ...d, texts: replace ? made : [...d.texts, ...made] }));
    setScriptText("");
  }

  // 붙여넣기(Ctrl+V)로 파일 올리기
  useEffect(() => {
    const h = (e: ClipboardEvent) => { if (ltab !== "files") return; const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); uploadFile(f); } };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  });

  // 편집 화면 위 자막·얹기 끌어 옮기기 / 얹기 크기
  const drag = useRef<{ kind: "text" | "ov" | "ov-size"; id: string; x: number; y: number; sx: number; sy: number; sw: number; sh: number; moved: boolean } | null>(null);
  const activeTexts = doc.texts.filter((x) => t >= x.start && t < x.end);
  const activeOvs = (doc.overlays ?? []).filter((o) => t >= o.start && t < o.end);
  function onDown(e: React.PointerEvent, kind: "text" | "ov" | "ov-size", id: string, sx: number, sy: number, sw = 0, sh = 0) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, id, x: e.clientX, y: e.clientY, sx, sy, sw, sh, moved: false };
    setSel({ kind: kind === "text" ? "text" : "overlay", id });
    setRtab("props");
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = overlay.current?.getBoundingClientRect();
    if (!d || !box) return;
    const k = doc.width / box.width;
    const dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) { d.moved = true; setDoc((dd) => ({ ...dd })); }
    if (d.kind === "text") setDocRaw((dd) => op.styleTexts(dd, [d.id], { x: Math.round(Math.max(0, Math.min(doc.width, d.sx + dx))), y: Math.round(Math.max(0, Math.min(doc.height, d.sy + dy))) }));
    else if (d.kind === "ov") setDocRaw((dd) => op.patchOverlay(dd, d.id, { x: Math.round(d.sx + dx), y: Math.round(d.sy + dy) }));
    else setDocRaw((dd) => op.patchOverlay(dd, d.id, { w: Math.max(40, Math.round(d.sw + dx)), h: Math.max(40, Math.round(d.sh + dy)) }));
    setSave("dirty");
  }
  const onUp = () => (drag.current = null);

  // 타임라인 끌기 (자석: 장면 경계·다른 자막 끝·재생 위치에 붙음)
  const tdrag = useRef<{ kind: "text-move" | "text-start" | "text-end" | "scene-end" | "ov-move" | "ov-start" | "ov-end"; id: string; x: number; a: number; b: number; base: ReelDoc } | null>(null);
  const snapPts = useMemo(() => [0, ...starts, total, ...doc.texts.flatMap((x) => [x.start, x.end])], [starts, total, doc.texts]);
  const snapT = (v: number, skip: number[] = []) => {
    if (!snap) return v;
    const tol = 8 / pps;
    let best = v, bd = tol;
    for (const p of [...snapPts, t]) { if (skip.some((s) => Math.abs(s - p) < 1e-6)) continue; const dd = Math.abs(p - v); if (dd < bd) { bd = dd; best = p; } }
    return Math.round(best * 100) / 100;
  };
  function tlDown(e: React.PointerEvent, kind: NonNullable<typeof tdrag.current>["kind"], id: string, a: number, b: number) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    tdrag.current = { kind, id, x: e.clientX, a, b, base: doc };
    setSel({ kind: kind === "scene-end" ? "scene" : kind.startsWith("ov") ? "overlay" : "text", id });
    if (!kind.startsWith("scene")) setRtab("props");
  }
  function tlMove(e: React.PointerEvent) {
    const d = tdrag.current;
    if (!d) return;
    const dt = (e.clientX - d.x) / pps;
    if (Math.abs(dt) < 0.02) return;
    let n = d.base;
    const len = d.b - d.a;
    if (d.kind === "scene-end") n = op.resizeScene(d.base, d.id, len + dt);
    else if (d.kind === "text-move") { const s = snapT(Math.max(0, d.a + dt), [d.a, d.b]); n = op.patchText(d.base, d.id, { start: s, end: s + len }); }
    else if (d.kind === "text-start") n = op.patchText(d.base, d.id, { start: Math.min(d.b - 0.2, snapT(d.a + dt, [d.a])) });
    else if (d.kind === "text-end") n = op.patchText(d.base, d.id, { end: Math.max(d.a + 0.2, snapT(d.b + dt, [d.b])) });
    else if (d.kind === "ov-move") { const s = snapT(Math.max(0, d.a + dt)); n = op.patchOverlay(d.base, d.id, { start: s, end: s + len }); }
    else if (d.kind === "ov-start") n = op.patchOverlay(d.base, d.id, { start: Math.min(d.b - 0.2, snapT(d.a + dt)) });
    else n = op.patchOverlay(d.base, d.id, { end: Math.max(d.a + 0.2, snapT(d.b + dt)) });
    setDocRaw(n); setSave("dirty");
  }
  function tlUp() {
    const d = tdrag.current;
    tdrag.current = null;
    if (d) { hist.current.past = [...hist.current.past.slice(-60), d.base]; hist.current.future = []; }
  }
  const tlSeek = (e: React.MouseEvent) => { const box = tl.current?.getBoundingClientRect(); if (!box) return; seek((e.clientX - box.left + (tl.current?.scrollLeft ?? 0) - 64) / pps); };
  useEffect(() => { const w = tl.current?.clientWidth ?? 900; setPps(Math.max(8, Math.min(160, Math.floor((w - 80) / Math.max(1, total))))); }, [doc.scenes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const peaks = info.guide?.peaks ?? [];
  const sortedTexts = useMemo(() => doc.texts.slice().sort((a, b) => a.start - b.start), [doc.texts]);

  if (info.status === "analyzing" && !doc.scenes.length)
    return (
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <b><span className="spinner" /> 초안 만드는 중</b>
        <span className="small muted">{info.message}</span>
        <span className="tiny muted">맥에서 말 받아쓰기 → 문장마다 장면·자막을 나눠요. 맥이 꺼져 있으면 켜질 때 시작돼요. 이 화면을 닫아도 계속돼요.</span>
      </div>
    );
  if (!doc.scenes.length) return <div className="card card-pad"><b>초안을 만들지 못했어요</b><div className="small muted">{info.message}</div></div>;

  const stageBox = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${(b.x / doc.width) * 100}%`, top: `${(b.y / doc.height) * 100}%`, width: `${(b.w / doc.width) * 100}%`, height: `${(b.h / doc.height) * 100}%` });
  const trackBlock = (a: number, b: number) => ({ left: 64 + a * pps, width: Math.max(4, (b - a) * pps - 2) });

  return (
    <div className="stack reel reel-dark" style={{ gap: 10 }}>
      <style>{`.reel-dark { --bg:#141418; --panel:#1e1e24; --panel-2:#26262d; --text:#ececf1; --muted:#9a9aa8; --line:#34343d; --accent:#e8578f; --accent-ink:#ffffff; --accent-soft:#3b2531; --shadow:none; color: var(--text); background: var(--bg); padding: 10px; border-radius: 14px; }
        .reel-dark .input, .reel-dark .textarea, .reel-dark select { background: var(--panel-2); color: var(--text); border-color: var(--line); }
        .reel-dark .btn { background: var(--panel-2); color: var(--text); border-color: var(--line); }
        .reel-dark .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .reel-dark .btn-ghost { background: transparent; }
        .reel-dark .card { background: var(--panel); border-color: var(--line); }
        .reel-dark input[type=range] { accent-color: var(--accent); }`}</style>
      {/* 위 막대 */}
      <div className="card row between" style={{ gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <b style={{ color: "var(--accent)" }}>✂️ 릴스 편집기</b>
          <select className="input" style={{ width: "auto", maxWidth: 260 }} value={info.id} onChange={(e) => { if (e.target.value !== info.id) location.href = `/reels/${e.target.value}`; }} aria-label="프로젝트">
            {(projects.some((p) => p.id === info.id) ? projects : [{ id: info.id, title, created_at: "" }, ...projects]).map((p) => <option key={p.id} value={p.id}>{p.id === info.id ? title : p.title}{p.created_at ? ` (${new Date(p.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })})` : ""}</option>)}
          </select>
          <Link className="btn btn-sm" href="/reels">+ 새 프로젝트</Link>
          <input className="input" style={{ width: 200 }} value={title} onChange={(e) => { setTitle(e.target.value); setSave("dirty"); }} aria-label="제목" />
          <span className="tiny muted">{{ saved: "저장됨", saving: "저장 중…", dirty: "고치는 중", error: "저장 실패" }[save]}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {outCount > 0 && <button className="btn btn-sm" style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn)" }} onClick={() => setShowGuide(true)} title="가이드 박스 밖에 있어 인스타 화면에서 가려질 수 있어요">⚠ 박스 밖 {outCount}개</button>}
          <select className="input" style={{ width: "auto" }} value={quality} onChange={(e) => setQuality(e.target.value as "720" | "1080")} aria-label="화질">
            <option value="720">720 초안 (빠름)</option>
            <option value="1080">1080 고화질</option>
          </select>
          <button className="btn btn-primary btn-sm" disabled={info.status === "rendering"} onClick={exportReel}>{info.status === "rendering" ? <><span className="spinner" /> {info.message}</> : "영상 뽑기"}</button>
        </div>
      </div>
      {(err || info.status === "error") && <div className="notice notice-bad small">{err || info.message}</div>}
      {info.output_video_id && info.status !== "rendering" && <div className="notice notice-ok small row between">마지막으로 뽑은 영상이 영상공장에 있어요. <Link style={{ color: "var(--accent)" }} href={`/videos/${info.output_video_id}`}>열기 · 받기 →</Link></div>}

      <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0, 1fr) 320px", gap: 10, alignItems: "start" }} className="reel-main3">
        {/* 왼쪽 */}
        <aside className="card reel-panel">
          <div className="reel-tabs" role="tablist">
            {(["files", "text", "scene", "bg"] as LTab[]).map((k) => <button key={k} role="tab" aria-selected={ltab === k} className={ltab === k ? "on" : ""} onClick={() => setLtab(k)}>{{ files: "내 파일", text: "글자", scene: "장면", bg: "배경" }[k]}</button>)}
          </div>
          <div className="reel-panel-body">
            {ltab === "files" && (
              <div className="stack" style={{ gap: 8 }}>
                <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }} style={{ border: "1.5px dashed var(--accent)", borderRadius: 10, padding: 14, textAlign: "center", cursor: "pointer", background: "var(--accent-soft)" }}>
                  <b className="small">+ 영상·사진·음악 올리기</b>
                  <div className="tiny muted">눌러서 고르거나 끌어다 놓기, Ctrl+V</div>
                  <input type="file" accept="video/*,audio/*,image/*" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                </label>
                {upload && <div className="tiny">올리는 중 {upload.pct}% · {upload.name}</div>}
                <span className="tiny muted">올린 파일은 원본 그대로 써요. 파일을 고른 뒤 아래 버튼으로 쓰세요.</span>
                {!!(doc.photos ?? []).length && <b className="tiny">이 릴스 사진</b>}
                <div className="reel-files">
                  {(doc.photos ?? []).map((u) => (
                    <button key={u} className={`reel-file${pickFile === u ? " on" : ""}`} onClick={() => setPickFile(u)} title="사진">
                      <img src={u} alt="" />
                      <span className="tiny ellipsis">사진</span>
                    </button>
                  ))}
                </div>
                <b className="tiny">영상·음악 (영상공장)</b>
                <div className="reel-files">
                  {files.map((f) => (
                    <button key={f.id} className={`reel-file${pickFile === f.id ? " on" : ""}`} onClick={() => setPickFile(f.id)} title={f.title}>
                      {f.thumb ? <img src={`/api/videos/${f.id}/file?kind=thumb`} alt="" /> : <span className="reel-file-ph">🎞</span>}
                      <span className="tiny ellipsis">{f.title}</span>
                    </button>
                  ))}
                </div>
                {pickFile && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="tiny muted">고른 것: {isPhoto(pickFile) ? "사진" : fileOf(pickFile)?.title ?? ""}</span>
                    {!isAudio(pickFile) && <button className="btn btn-sm btn-primary" onClick={() => appendMain(pickFile)}>＋ 메인 끝에 넣기</button>}
                    {!isAudio(pickFile) && <button className="btn btn-sm" disabled={!curScene} onClick={() => replaceScene(pickFile)}>⇄ {curScene ? `'${curScene.label.slice(0, 10)}' 장면을 이걸로` : "장면을 먼저 고르세요"}</button>}
                    {!isAudio(pickFile) && <button className="btn btn-sm" onClick={() => overlayIt(pickFile)}>⬆ 지금 위치에 위에 얹기 (3초)</button>}
                    {!isPhoto(pickFile) && <button className="btn btn-sm" onClick={() => setDoc((d) => ({ ...d, music: { videoId: pickFile, from: 0, volume: 0.8 } }))}>🎵 소리 트랙으로 쓰기</button>}
                  </div>
                )}
              </div>
            )}

            {ltab === "text" && (
              <div className="stack" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={newText} style={{ alignSelf: "flex-start", marginBottom: 4 }}>+ 글자 추가 (지금 위치)</button>
                <details style={{ marginBottom: 6 }}>
                  <summary className="small"><b>📝 대본 붙여넣기 · ✨ AI 대본 → 글자 한 번에</b></summary>
                  <div style={{ marginTop: 6 }}><AiScriptBox defaultTopic={title} onScript={(r) => setScriptText(r.lines.join("\n"))} /></div>
                  <textarea className="textarea" style={{ minHeight: 110, marginTop: 6 }} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder={"한 줄에 자막 하나\n줄 수가 장면 수와 같으면 장면마다 하나씩,\n아니면 글자 길이대로 차례로 나눠요"} />
                  <div className="row" style={{ gap: 4, marginTop: 4 }}>
                    <button className="btn btn-sm btn-primary" disabled={!scriptText.trim()} onClick={() => scriptToTexts(true)}>기존 글자 바꾸기</button>
                    <button className="btn btn-sm" disabled={!scriptText.trim()} onClick={() => scriptToTexts(false)}>뒤에 더하기</button>
                  </div>
                </details>
                {sortedTexts.map((x) => (
                  <div key={x.id} className="row" style={{ gap: 4, flexWrap: "nowrap", background: sel?.id === x.id ? "var(--accent-soft)" : undefined, borderRadius: 8, padding: 2 }}>
                    <button className="btn btn-sm btn-ghost mono" style={{ width: 62, padding: "0 2px", fontSize: 11 }} onClick={() => { setSel({ kind: "text", id: x.id }); setRtab("props"); seek(x.start + 0.01); }}>{fmt(x.start)}</button>
                    <input className="input" style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontSize: 13, fontWeight: 700 }} value={x.text} onFocus={() => { setSel({ kind: "text", id: x.id }); seek(x.start + 0.01); }} onChange={(e) => setDoc((d) => op.patchText(d, x.id, { text: e.target.value }))} aria-label={`${fmt(x.start)} 글자`} />
                    <button className="btn btn-sm btn-ghost" style={{ padding: "0 6px" }} onClick={() => { setDoc((d) => op.deleteText(d, x.id)); if (sel?.id === x.id) setSel(null); }} aria-label="지우기">×</button>
                  </div>
                ))}
              </div>
            )}

            {ltab === "scene" && (
              <div className="stack" style={{ gap: 6 }}>
                {doc.baseVideoId && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={doc.audio === "base"} onChange={(e) => setDoc((d) => ({ ...d, audio: e.target.checked ? "base" : "none" }))} /> 원래 영상의 소리(목소리) 쓰기</label>}
                <span className="tiny muted">장면 = 메인 트랙 조각이에요. 내 파일에서 영상·사진을 &apos;메인 끝에 넣기&apos;로 이어 붙여요.</span>
                {doc.scenes.map((s, i) => (
                  <div key={s.id} className={`reel-scene${sel?.id === s.id ? " on" : ""}`} onClick={() => { setSel({ kind: "scene", id: s.id }); seek(starts[i] + 0.01); }}>
                    <span className="small"><b style={{ color: "var(--accent)" }}>{String(i + 1).padStart(2, "0")}</b> <b>{s.label}</b></span>
                    <span className="tiny muted">{fmt(starts[i])} · {s.dur.toFixed(1)}초{s.image ? " · 사진" : s.video.videoId ? " · 내 영상" : ""}{s.bg.type !== "none" ? " · 배경" : ""}</span>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setSel({ kind: "scene", id: s.id }); setLtab("files"); }}>⇄ 내 영상으로</button>
                      {sel?.id === s.id && s.video.videoId && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setDoc((d) => op.patchScenes(d, [s.id], () => ({ video: { videoId: null, from: 0 } }))); }}>원래 영상</button>}
                      {sel?.id === s.id && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setDoc((d) => op.patchScenes(d, [s.id], (x) => ({ fit: x.fit === "cover" ? "contain" : "cover" }))); }}>{s.fit === "cover" ? "화면 가득" : "전체 보이기"}</button>}
                    </div>
                    {sel?.id === s.id && <input className="input" style={{ fontSize: 12, marginTop: 4 }} value={s.label} onClick={(e) => e.stopPropagation()} onChange={(e) => setDoc((d) => op.patchScenes(d, [s.id], () => ({ label: e.target.value })))} aria-label="장면 이름" />}
                  </div>
                ))}
              </div>
            )}

            {ltab === "bg" && (
              <div className="stack" style={{ gap: 10 }}>
                <div className="seg">
                  <button className={!scopeAll ? "on" : ""} onClick={() => setScopeAll(false)}>지금 장면{curScene ? ` · ${curScene.label.slice(0, 8)}` : ""}</button>
                  <button className={scopeAll ? "on" : ""} onClick={() => setScopeAll(true)}>전체 장면</button>
                </div>
                <button className="btn btn-sm" onClick={() => bg({ type: "none" })}>원래 배경으로</button>
                <span className="tiny muted strong">단색</span>
                <div className="reel-swatches">{COLORS.map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => bg({ type: "color", color: c })} aria-label={`단색 ${c}`} />)}</div>
                <span className="tiny muted strong">그라데이션</span>
                <div className="reel-swatches big">
                  {GRADS.map((g) => <button key={g.join()} className="sw" style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }} onClick={() => bg({ type: "gradient", colors: g, angle: 160 })} aria-label="그라데이션" />)}
                  {AURORAS.map((a) => <button key={a.join()} className="sw" style={{ background: `radial-gradient(60% 50% at 20% 20%, ${a[0]}, transparent 70%), radial-gradient(60% 50% at 80% 60%, ${a[1]}, transparent 70%), ${a[3]}`, color: "#fff" }} onClick={() => bg({ type: "aurora", colors: a })}>오로라</button>)}
                </div>
                <span className="tiny muted">배경을 넣으면 영상이 가운데 카드로 작아지고 둘레에 배경이 보여요.</span>
              </div>
            )}
          </div>
        </aside>

        {/* 가운데: 편집 화면 + 출력 미리보기 */}
        <div className="card" style={{ padding: 10, background: "#16181d" }}>
          <div style={{ display: "grid", gridTemplateColumns: side ? "1fr 1fr" : "1fr", gap: 12, maxWidth: side ? 760 : 400, margin: "0 auto" }}>
            <div>
              <span className="tiny" style={{ color: "#aab" }}>편집 화면</span>
              <div className="reel-frame" style={{ position: "relative" }}>
                <Player ref={player} component={Reel} inputProps={inputProps} durationInFrames={totalFrames} fps={fps} compositionWidth={doc.width} compositionHeight={doc.height} style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
                <div ref={overlay} className="reel-overlay" onPointerMove={onMove} onPointerUp={onUp} onClick={() => setSel(null)}>
                  {showGuide && <div style={{ position: "absolute", ...stageBox(GUIDE_BOX), border: "2px dashed rgba(255,255,255,0.85)", borderRadius: 4, pointerEvents: "none" }}><span className="tiny" style={{ position: "absolute", top: -18, left: 0, color: "#fff", textShadow: "0 1px 2px #000" }}>가이드 박스 · 밖은 배경만</span></div>}
                  {activeOvs.map((o) => (
                    <div key={o.id} className={`reel-hit${sel?.id === o.id ? " on" : ""}`} style={{ position: "absolute", ...stageBox(o), cursor: "move" }} onPointerDown={(e) => onDown(e, "ov", o.id, o.x, o.y)} onClick={(e) => e.stopPropagation()} title="얹은 영상 · 끌어서 옮기기">
                      {sel?.id === o.id && <i onPointerDown={(e) => onDown(e, "ov-size", o.id, o.x, o.y, o.w, o.h)} style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#fff", border: "2px solid var(--accent)", borderRadius: 3, cursor: "nwse-resize" }} />}
                    </div>
                  ))}
                  {activeTexts.map((x) => (
                    <div key={x.id} className={`reel-hit${sel?.id === x.id ? " on" : ""}`} style={{ position: "absolute", ...stageBox(textBox(x)), transform: `rotate(${x.style.rotate}deg)` }} onPointerDown={(e) => onDown(e, "text", x.id, x.style.x, x.style.y)} onClick={(e) => e.stopPropagation()} title="끌어서 옮기기">
                      {sel?.id === x.id && (
                        <div className="row" style={{ position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)", gap: 0, background: "#16181d", borderRadius: 8, padding: 2, flexWrap: "nowrap", whiteSpace: "nowrap" }} onPointerDown={(e) => e.stopPropagation()}>
                          <span className="tiny" style={{ color: "#ccd", padding: "2px 6px" }}>위치</span>
                          <button className="tiny" style={{ border: 0, borderRadius: 6, padding: "2px 8px", cursor: "pointer", background: !scopeAll ? "var(--accent)" : "transparent", color: "#fff" }} onClick={() => setScopeAll(false)}>이 자막만</button>
                          <button className="tiny" style={{ border: 0, borderRadius: 6, padding: "2px 8px", cursor: "pointer", background: scopeAll ? "var(--accent)" : "transparent", color: "#fff" }} onClick={() => setScopeAll(true)}>자막 전체</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {side && (
              <div>
                <span className="tiny" style={{ color: "#aab" }}>출력 미리보기</span>
                <div className="reel-frame">
                  <Player ref={out} component={Reel} inputProps={inputProps} durationInFrames={totalFrames} fps={fps} compositionWidth={doc.width} compositionHeight={doc.height} style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense initiallyMuted />
                </div>
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: "center", flexWrap: "wrap", color: "#dde" }}>
            <button className="btn btn-sm" onClick={() => seek(0)} aria-label="처음으로">⏮</button>
            <button className="btn btn-sm" onClick={() => seek(t - 1)} aria-label="1초 뒤로">◀</button>
            <button className="btn btn-sm" onClick={toggle} aria-label="재생">{playing ? "⏸" : "▶"}</button>
            <button className="btn btn-sm" onClick={() => seek(t + 1)} aria-label="1초 앞으로">▶|</button>
            <span className="small mono">{fmt(t)} / {fmt(total)}</span>
            <button className="btn btn-sm btn-primary" onClick={() => { seek(0); setTimeout(() => player.current?.play(), 50); }}>▶ 미리보기</button>
            <label className="tiny row" style={{ gap: 4 }}><input type="checkbox" checked={side} onChange={(e) => setSide(e.target.checked)} /> 옆 미리보기</label>
            <label className="tiny row" style={{ gap: 4 }}><input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} /> 가이드 박스</label>
          </div>
        </div>

        {/* 오른쪽 */}
        <aside className="card reel-panel">
          <div className="reel-tabs" role="tablist" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {(["props", "source", "memo"] as RTab[]).map((k) => <button key={k} role="tab" aria-selected={rtab === k} className={rtab === k ? "on" : ""} onClick={() => setRtab(k)}>{{ props: "속성", source: "원본 문구·색", memo: "메모" }[k]}</button>)}
          </div>
          <div className="reel-panel-body">
            {rtab === "props" && (selText || (scopeAll && doc.texts.length) ? (
              <TextControls t={selText ?? (doc.texts[0] as XText)} scopeAll={scopeAll} total={doc.texts.length} onScope={setScopeAll}
                onText={(patch) => selText && setDoc((d) => op.patchText(d, selText.id, patch as Partial<ReelText>))} onStyle={style} />
            ) : selOv ? (
              <OverlayControls o={selOv} onPatch={(p) => setDoc((d) => op.patchOverlay(d, selOv.id, p))} onDelete={() => { setDoc((d) => op.deleteOverlay(d, selOv.id)); setSel(null); }} />
            ) : selScene ? (
              <div className="stack" style={{ gap: 6 }}>
                <b className="small">장면 · {selScene.label}</b>
                <span className="tiny muted">{selScene.dur.toFixed(1)}초 · 타임라인에서 오른쪽 끝을 끌어 길이를 바꿔요.</span>
                <button className="btn btn-sm" onClick={swap}>⇄ 이 장면 영상 갈아끼우기</button>
                <button className="btn btn-sm" onClick={() => setDoc((d) => op.patchScenes(d, [selScene.id], (x) => ({ fit: x.fit === "cover" ? "contain" : "cover" })))}>{selScene.fit === "cover" ? "화면 가득 → 전체 보이기" : "전체 보이기 → 화면 가득"}</button>
              </div>
            ) : <p className="small muted">편집 화면이나 타임라인에서 글자·얹기·장면을 누르면 여기서 고쳐요.</p>)}

            {rtab === "source" && (
              <div className="stack" style={{ gap: 6 }}>
                <b className="small">원본 말 (받아쓰기)</b>
                <span className="tiny muted">누르면 그 시간으로 가요. ＋를 누르면 그 문장을 글자로 넣어요.</span>
                {(info.guide?.segments ?? []).map((g, i) => (
                  <div key={i} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button className="btn btn-sm btn-ghost mono" style={{ width: 62, fontSize: 11, padding: 0 }} onClick={() => seek(g.start + 0.01)}>{fmt(g.start)}</button>
                    <span className="small" style={{ flex: 1 }}>{g.text}</span>
                    <button className="btn btn-sm" style={{ padding: "0 6px" }} onClick={() => { const r = op.addText(doc, g.start, selText?.style ?? doc.texts[0]?.style); setDoc(op.patchText(r.doc, r.id, { text: g.text.trim(), start: g.start, end: g.end })); setSel({ kind: "text", id: r.id }); }}>＋</button>
                  </div>
                ))}
                {!(info.guide?.segments ?? []).length && <span className="small muted">받아쓰기 내용이 없어요.</span>}
                <b className="small" style={{ marginTop: 8 }}>자주 쓰는 색</b>
                <span className="tiny muted">글자를 고른 상태에서 누르면 글자색이 바뀌어요.</span>
                <div className="reel-swatches">{COLORS.map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => style({ color: c })} aria-label={`글자색 ${c}`} />)}</div>
              </div>
            )}

            {rtab === "memo" && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="small">수정 메모 (영상엔 안 나와요)</span>
                <textarea className="textarea" style={{ minHeight: 220 }} value={doc.memo ?? ""} onChange={(e) => { setDocRaw((d) => ({ ...d, memo: e.target.value })); setSave("dirty"); }} placeholder={"예) 3초 자막 더 크게\n10초쯤 사진 얹기\n마지막에 팔로우 문구"} />
                <button className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(`릴스 '${title}' 수정 메모:\n${doc.memo ?? ""}`); } catch {} }}>📋 메모 복사 (Claude에게 붙여넣기)</button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 타임라인 */}
      <section className="card reel-tl-card">
        <div className="row between reel-tools" style={{ flexWrap: "wrap" }}>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            <button className="btn btn-sm" onClick={undo} title="Ctrl+Z">↶ 되돌리기</button>
            <button className="btn btn-sm" onClick={redo} title="Ctrl+Shift+Z">↷</button>
            <button className="btn btn-sm" onClick={split} title="S">✂ 자르기</button>
            <button className="btn btn-sm" onClick={remove} disabled={!sel} title="Delete">🗑 지우기</button>
            <button className="btn btn-sm" onClick={duplicate} disabled={!sel}>⧉ 복제</button>
            <button className="btn btn-sm" onClick={newText}>T 글자</button>
            <button className="btn btn-sm" onClick={swap}>⇄ 갈아끼우기</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <label className="tiny row" style={{ gap: 4 }}><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> 자석</label>
            <button className="btn btn-sm btn-ghost" onClick={() => setPps((p) => Math.max(8, p - 10))} aria-label="축소">−</button>
            <input type="range" min={8} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="확대" style={{ width: 100, accentColor: "var(--accent)" }} />
            <button className="btn btn-sm btn-ghost" onClick={() => setPps((p) => Math.min(200, p + 10))} aria-label="확대">+</button>
          </div>
        </div>
        <div className="reel-tl" ref={tl} onPointerMove={tlMove} onPointerUp={tlUp}>
          <div style={{ width: 64 + total * pps + 40, position: "relative" }}>
            <div className="reel-ruler" onClick={tlSeek}>{Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (pps >= 20 || s % 5 === 0) && <span key={s} style={{ left: 64 + s * pps }}>{fmt(s).slice(0, 5)}</span>)}</div>
            <div className="reel-track"><span className="reel-tname">글자</span>
              {doc.texts.map((x) => (
                <div key={x.id} className={`reel-block text${sel?.id === x.id ? " on" : ""}`} style={trackBlock(x.start, x.end)} onPointerDown={(e) => tlDown(e, "text-move", x.id, x.start, x.end)}>
                  <i className="h l" onPointerDown={(e) => tlDown(e, "text-start", x.id, x.start, x.end)} />
                  <span className="ellipsis">{x.text}</span>
                  <i className="h r" onPointerDown={(e) => tlDown(e, "text-end", x.id, x.start, x.end)} />
                </div>
              ))}
            </div>
            <div className="reel-track"><span className="reel-tname">위에 얹기</span>
              {(doc.overlays ?? []).map((o) => (
                <div key={o.id} className={`reel-block text${sel?.id === o.id ? " on" : ""}`} style={{ ...trackBlock(o.start, o.end), background: "#0ea5e9" }} onPointerDown={(e) => tlDown(e, "ov-move", o.id, o.start, o.end)}>
                  <i className="h l" onPointerDown={(e) => tlDown(e, "ov-start", o.id, o.start, o.end)} />
                  <span className="ellipsis">⬆ {o.image ? "🖼 사진" : files.find((f) => f.id === o.videoId)?.title ?? "얹은 영상"}</span>
                  <i className="h r" onPointerDown={(e) => tlDown(e, "ov-end", o.id, o.start, o.end)} />
                </div>
              ))}
            </div>
            <div className="reel-track" style={{ height: 64 }}><span className="reel-tname">메인</span>
              {doc.scenes.map((s, i) => (
                <div key={s.id} className={`reel-block scene${sel?.id === s.id ? " on" : ""}${s.video.videoId ? " mine" : ""}`} style={{ ...trackBlock(starts[i], starts[i] + s.dur), height: 58, flexDirection: "column", alignItems: "stretch", justifyContent: "space-between" }} onClick={(e) => { e.stopPropagation(); setSel({ kind: "scene", id: s.id }); setRtab("props"); if (t < starts[i] || t >= starts[i] + s.dur) seek(starts[i] + 0.01); }}>
                  <span className="ellipsis">{s.label}</span>
                  {doc.audio === "base" && <div className="reel-wave" style={{ position: "relative", left: 0, width: "100%", height: 22 }}>{peaks.slice(Math.floor(s.audioFrom * 20), Math.floor((s.audioFrom + s.dur) * 20)).filter((_, k, arr) => arr.length < (s.dur * pps) / 2 || k % Math.ceil(arr.length / ((s.dur * pps) / 2)) === 0).map((p, k) => <b key={k} style={{ height: `${Math.max(4, p)}%` }} />)}</div>}
                  <i className="h r" onPointerDown={(e) => tlDown(e, "scene-end", s.id, starts[i], starts[i] + s.dur)} />
                </div>
              ))}
            </div>
            <div className="reel-track audio"><span className="reel-tname">소리</span>
              {doc.music ? (
                <div className="reel-block text" style={{ left: 64, width: Math.max(40, total * pps - 2), background: "#16a34a" }} title="소리 트랙">
                  <span className="ellipsis">🎵 {fileOf(doc.music.videoId)?.title ?? "음악"} · 볼륨 {Math.round(doc.music.volume * 100)}%</span>
                  <button className="btn btn-sm btn-ghost" style={{ padding: "0 4px", color: "#fff" }} onClick={() => setDoc((d) => ({ ...d, music: null }))} aria-label="소리 빼기">×</button>
                </div>
              ) : <span className="tiny muted" style={{ position: "absolute", left: 72, top: 8 }}>{doc.audio === "base" && doc.baseVideoId ? "원래 영상 소리 (메인 장면 안 파형)" : "내 파일에서 음악을 골라 '소리 트랙으로 쓰기'"}</span>}
            </div>
            <div className="reel-playhead" style={{ left: 64 + t * pps }} />
          </div>
        </div>
        <p className="tiny muted" style={{ padding: "6px 12px" }}>S 자르기 · Delete 지우기 · Ctrl+Z 되돌리기 · 스페이스 재생 · ←→ 한 프레임(Shift = 1초) · 글자·얹기는 끌어서 옮기고 양 끝을 끌어 길이 조절 · 자석을 켜면 장면 경계·다른 글자 끝·재생 위치에 붙어요</p>
      </section>
      <style>{`@media (max-width: 1200px) { .reel-main3 { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function TextControls({ t, scopeAll, total, onScope, onText, onStyle }: { t: XText; scopeAll: boolean; total: number; onScope: (v: boolean) => void; onText: (p: Partial<XText>) => void; onStyle: (p: Partial<ReelTextStyle>) => void }) {
  const s = t.style;
  return (
    <div className="stack reel-ctl" style={{ gap: 8 }}>
      <b className="small">글자</b>
      {!scopeAll && <textarea className="textarea" rows={2} value={t.text} onChange={(e) => onText({ text: e.target.value })} aria-label="자막 글" />}
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {TEXT_PRESETS.map((p) => <button key={p.id} className="btn btn-sm" style={{ borderRadius: 999 }} onClick={() => onStyle(p.style)}>{p.label}</button>)}
      </div>
      <label className="reel-row"><span>글꼴</span>
        <select className="input" value={s.font ?? "noto"} onChange={(e) => onStyle({ font: e.target.value as ReelTextStyle["font"] })} style={{ fontFamily: `ReelFont-${s.font ?? "noto"}` }}>
          {REEL_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <label className="reel-row"><span>크기</span><input type="range" min={24} max={180} value={s.size} onChange={(e) => onStyle({ size: Number(e.target.value) })} /><input className="input" type="number" style={{ width: 56, padding: "2px 4px" }} value={s.size} onChange={(e) => onStyle({ size: Number(e.target.value) })} /></label>
      <label className="reel-row"><span>굵게</span><button className={`btn btn-sm ${s.bold ? "btn-primary" : ""}`} onClick={() => onStyle({ bold: !s.bold })}>{s.bold ? "켬" : "끔"}</button></label>
      <label className="reel-row"><span>글자색</span><input type="color" value={s.color} onChange={(e) => onStyle({ color: e.target.value })} /><span className="tiny mono">{s.color.toUpperCase()}</span></label>
      <div className="reel-row"><span>상자</span>
        <div className="reel-swatches small">
          <button className="sw none" onClick={() => onStyle({ box: "" })} aria-label="상자 없음">없음</button>
          {["#ffd6e8", "#ffffff", "#000000", "#eaeeff", "#ffe98a"].map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => onStyle({ box: c })} aria-label={`상자 ${c}`} />)}
        </div>
      </div>
      <div className="reel-row"><span>테두리</span>
        <div className="seg">{[["", "없음"], ["#000000", "검정"], ["#ffffff", "흰색"]].map(([v, l]) => <button key={l} className={s.stroke === v ? "on" : ""} onClick={() => onStyle({ stroke: v })}>{l}</button>)}</div>
      </div>
      <div className="reel-row"><span>빛</span>
        <div className="seg">{[["", "없음"], ["#ff5fa2", "핑크"], ["#7b93ff", "파랑"], ["#ffffff", "흰빛"]].map(([v, l]) => <button key={l} className={(s.glow ?? "") === v ? "on" : ""} onClick={() => onStyle({ glow: v })}>{l}</button>)}</div>
      </div>
      <div className="reel-row"><span>한 줄 맞춤</span><button className={`btn btn-sm ${s.fit ? "btn-primary" : ""}`} onClick={() => onStyle({ fit: !s.fit })}>{s.fit ? "넘치면 줄여요" : "줄바꿈"}</button></div>
      <div className="reel-row"><span>정렬</span><div className="seg">{(["left", "center", "right"] as const).map((a) => <button key={a} className={s.align === a ? "on" : ""} onClick={() => onStyle({ align: a })}>{{ left: "왼쪽", center: "가운데", right: "오른쪽" }[a]}</button>)}</div></div>
      <div className="reel-row"><span>등장 효과</span>
        <div className="seg" style={{ flexWrap: "wrap" }}>{([["none", "없음"], ["fade", "페이드"], ["pop", "팝"], ["slide", "올라오기"], ["bounce", "통통"], ["type", "타자"]] as const).map(([v, l]) => <button key={v} className={(s.anim ?? "none") === v ? "on" : ""} onClick={() => onStyle({ anim: v })}>{l}</button>)}</div>
      </div>
      <b className="small" style={{ marginTop: 6 }}>위치</b>
      <div className="seg"><button className={!scopeAll ? "on" : ""} onClick={() => onScope(false)}>이 자막만</button><button className={scopeAll ? "on" : ""} onClick={() => onScope(true)}>자막 전체 {total}개</button></div>
      <span className="tiny muted">{scopeAll ? "'자막 전체에 포함'이 켜진 자막에 한 번에 적용돼요." : "이 자막 하나만 옮겨요. 화면에서 끌어도 돼요."}</span>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {([["위", { y: 360 }], ["가운데", { y: 960 }], ["자막 자리", { y: 1500 }], ["아래", { y: 1640 }], ["가로 가운데", { x: 540 }]] as const).map(([l, p]) => <button key={l} className="btn btn-sm" onClick={() => onStyle(p)}>{l}</button>)}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <label className="tiny">가로 X <input className="input" type="number" value={s.x} onChange={(e) => onStyle({ x: Number(e.target.value) })} /></label>
        <label className="tiny">세로 Y <input className="input" type="number" value={s.y} onChange={(e) => onStyle({ y: Number(e.target.value) })} /></label>
      </div>
      {!scopeAll && <div className="reel-row"><span>일괄 수정</span><button className={`btn btn-sm ${!t.skipAll ? "btn-primary" : ""}`} onClick={() => onText({ skipAll: !t.skipAll })}>{t.skipAll ? "자막 전체에서 빼기" : "자막 전체에 포함"}</button></div>}
      <label className="reel-row"><span>글 폭</span><input type="range" min={200} max={1080} value={s.width} onChange={(e) => onStyle({ width: Number(e.target.value) })} /><b>{s.width}</b></label>
      <label className="reel-row"><span>회전</span><input type="range" min={-30} max={30} value={s.rotate} onChange={(e) => onStyle({ rotate: Number(e.target.value) })} /><b>{s.rotate}°</b></label>
      {!scopeAll && (
        <div className="row" style={{ gap: 6 }}>
          <label className="tiny">시작 <input className="input" type="number" step={0.1} value={t.start} onChange={(e) => onText({ start: Number(e.target.value) })} /></label>
          <label className="tiny">끝 <input className="input" type="number" step={0.1} value={t.end} onChange={(e) => onText({ end: Number(e.target.value) })} /></label>
        </div>
      )}
    </div>
  );
}

function OverlayControls({ o, onPatch, onDelete }: { o: ReelOverlay; onPatch: (p: Partial<ReelOverlay>) => void; onDelete: () => void }) {
  const n = (label: string, k: keyof ReelOverlay, step = 1) => <label className="tiny">{label} <input className="input" type="number" step={step} value={o[k] as number} onChange={(e) => onPatch({ [k]: Number(e.target.value) } as Partial<ReelOverlay>)} /></label>;
  return (
    <div className="stack reel-ctl" style={{ gap: 8 }}>
      <b className="small">⬆ 위에 얹은 영상</b>
      <span className="tiny muted">편집 화면에서 끌어 옮기고, 오른쪽 아래 모서리로 크기를 바꿔요.</span>
      <div className="row" style={{ gap: 6 }}>{n("시작", "start", 0.1)}{n("끝", "end", 0.1)}</div>
      <div className="row" style={{ gap: 6 }}>{n("가로 X", "x")}{n("세로 Y", "y")}</div>
      <div className="row" style={{ gap: 6 }}>{n("너비", "w")}{n("높이", "h")}</div>
      <label className="reel-row"><span>모서리</span><input type="range" min={0} max={300} value={o.radius} onChange={(e) => onPatch({ radius: Number(e.target.value) })} /><b>{o.radius}</b></label>
      <div className="reel-row"><span>맞춤</span><div className="seg"><button className={o.fit === "cover" ? "on" : ""} onClick={() => onPatch({ fit: "cover" })}>꽉 채우기</button><button className={o.fit === "contain" ? "on" : ""} onClick={() => onPatch({ fit: "contain" })}>전체 보이기</button></div></div>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn btn-sm" onClick={() => onPatch({ x: Math.round((1080 - o.w) / 2) })}>가로 가운데</button>
        <button className="btn btn-sm" onClick={() => onPatch({ x: 60, y: 250, w: 960, h: 1420 })}>가이드 박스에 맞추기</button>
      </div>
      <button className="btn btn-sm" style={{ color: "var(--bad)" }} onClick={onDelete}>🗑 얹기 지우기</button>
    </div>
  );
}
