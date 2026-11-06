"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { api } from "@/components/client-utils";
import { Reel } from "@/remotion/Reel";
import { docDuration, sceneStarts, type ReelBg, type ReelDoc, type ReelText, type ReelTextStyle } from "@/remotion/types";
import * as op from "./ops";

type FileVideo = { id: string; title: string; kind: string; duration: number | null; thumb: boolean };
type ReelInfo = { id: string; title: string; status: string; message: string; output_video_id: string | null; base_video_id: string | null; guide: { peaks?: number[]; segments?: { start: number; end: number; text: string }[] } };
type Sel = { kind: "scene" | "text"; id: string } | null;
type Tab = "files" | "text" | "scene" | "bg";

const COLORS = ["#ffffff", "#f6f1f7", "#ffd6e8", "#ff9ec7", "#e0457b", "#ffcf99", "#ffe98a", "#c8f7dc", "#a8dcff", "#c9b8ff", "#8a9aa8", "#1d1b29", "#000000", "#ffb3c6"];
const GRADS: [string, string][] = [["#ffd1e8", "#e9d5ff"], ["#e9d5ff", "#bfdbfe"], ["#fde68a", "#fbcfe8"], ["#bae6fd", "#ddd6fe"]];
const AURORAS: string[][] = [["#ff7eb3", "#7f7fff", "#ffd166", "#1a0b2e"], ["#9b5de5", "#f15bb5", "#00bbf9", "#10061f"]];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export default function ReelEditor({ initial, initialDoc, files: initialFiles }: { initial: ReelInfo; initialDoc: ReelDoc; files: FileVideo[] }) {
  const [info, setInfo] = useState(initial);
  const [doc, setDocRaw] = useState<ReelDoc>(initialDoc);
  const [title, setTitle] = useState(initial.title);
  const hist = useRef<{ past: ReelDoc[]; future: ReelDoc[] }>({ past: [], future: [] });
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>("scene");
  const [scopeAll, setScopeAll] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [files, setFiles] = useState(initialFiles);
  const [upload, setUpload] = useState<{ pct: number; name: string } | null>(null);
  const [pps, setPps] = useState(40); // 타임라인 1초 = px
  const [err, setErr] = useState("");
  const player = useRef<PlayerRef>(null);
  const guide = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const tl = useRef<HTMLDivElement>(null);

  const fps = doc.fps;
  const total = docDuration(doc);
  const totalFrames = Math.max(1, Math.round(total * fps));
  const t = frame / fps;
  const starts = useMemo(() => sceneStarts(doc), [doc]);
  const srcs = useMemo(() => {
    const ids = new Set<string>([doc.baseVideoId, ...doc.scenes.map((s) => s.video.videoId)].filter(Boolean) as string[]);
    return Object.fromEntries(Array.from(ids).map((id) => [id, `/api/videos/${id}/file`]));
  }, [doc]);
  const inputProps = useMemo(() => ({ doc, srcs, fontUrl: "/api/reels/font" }), [doc, srcs]);
  const busy = info.status === "analyzing" || info.status === "rendering";

  /** 문서 바꾸기 (되돌리기 기록) */
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
  const undo = () => setDocRaw((cur) => {
    const p = hist.current.past.pop();
    if (!p) return cur;
    hist.current.future.push(cur);
    setSave("dirty");
    return p;
  });
  const redo = () => setDocRaw((cur) => {
    const f = hist.current.future.pop();
    if (!f) return cur;
    hist.current.past.push(cur);
    setSave("dirty");
    return f;
  });

  // 자동 저장
  useEffect(() => {
    if (save !== "dirty") return;
    const h = setTimeout(async () => {
      setSave("saving");
      try {
        await api(`/api/reels/${info.id}`, "PUT", { doc, title });
        setSave("saved");
      } catch (e) {
        setSave("error");
        setErr((e as Error).message);
      }
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
        if (info.status === "analyzing" && r.status !== "analyzing") {
          setDocRaw(r.doc);
          hist.current = { past: [], future: [] };
        }
      } catch {}
    }, 3000);
    return () => clearInterval(h);
  }, [busy, info.id, info.status]);

  // 재생 위치 따라가기 + 왼쪽 가이드(원본) 맞추기
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => { setPlaying(true); void guide.current?.play().catch(() => {}); };
    const onPause = () => { setPlaying(false); guide.current?.pause(); };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, [doc.scenes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const g = guide.current;
    const at = op.sceneAt(doc, t);
    if (!g || !at) return;
    const bt = at.scene.audioFrom + (t - at.start);
    if (Math.abs(g.currentTime - bt) > (playing ? 0.35 : 0.05)) g.currentTime = bt;
  }, [t, doc, playing]);

  const seek = (sec: number) => {
    const f = Math.max(0, Math.min(totalFrames - 1, Math.round(sec * fps)));
    player.current?.seekTo(f);
    setFrame(f);
  };
  const toggle = () => (player.current?.isPlaying() ? player.current.pause() : player.current?.play());

  const selScene = sel?.kind === "scene" ? doc.scenes.find((s) => s.id === sel.id) : undefined;
  const selText = sel?.kind === "text" ? doc.texts.find((x) => x.id === sel.id) : undefined;
  const curScene = selScene ?? op.sceneAt(doc, t)?.scene;

  function split() {
    if (sel?.kind === "text") setDoc((d) => op.splitText(d, sel.id, t));
    else {
      const at = op.sceneAt(doc, t);
      if (at) setDoc((d) => op.splitScene(d, at.scene.id, t));
    }
  }
  function remove() {
    if (!sel) return;
    if (sel.kind === "text") setDoc((d) => op.deleteText(d, sel.id));
    else setDoc((d) => op.deleteScene(d, sel.id));
    setSel(null);
  }
  function duplicate() {
    if (!sel) return;
    setDoc((d) => (sel.kind === "text" ? op.duplicateText(d, sel.id) : op.duplicateScene(d, sel.id)));
  }
  function newText() {
    const r = op.addText(doc, t, selText?.style ?? doc.texts[doc.texts.length - 1]?.style);
    setDoc(r.doc);
    setSel({ kind: "text", id: r.id });
    setTab("text");
  }
  const style = (patch: Partial<ReelTextStyle>) => {
    if (!selText && !scopeAll) return;
    setDoc((d) => op.styleTexts(d, scopeAll ? "all" : [selText!.id], patch));
  };
  const bg = (b: ReelBg) => setDoc((d) => op.setBg(d, scopeAll ? "all" : curScene ? [curScene.id] : "all", b));

  // 단축키: S 자르기 · Delete 지우기 · Ctrl+Z 되돌리기 · 스페이스 재생
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); split(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  async function exportReel() {
    setErr("");
    try {
      if (save !== "saved") await api(`/api/reels/${info.id}`, "PUT", { doc, title });
      setSave("saved");
      await api(`/api/reels/${info.id}/render`, "POST");
      setInfo({ ...info, status: "rendering", message: "내보내기 대기 중 (맥에서 만들어요)" });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function uploadFile(f: File) {
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
        if (curScene) setDoc((d) => op.patchScenes(d, [curScene.id], () => ({ video: { videoId: r.id, from: 0 } })));
      } catch (e) {
        setErr((e as Error).message);
      }
    };
    x.onerror = () => { setUpload(null); setErr("올리기 중 연결이 끊겼어요."); };
    x.send(fd);
  }

  // 편집 화면 위 자막 끌어 옮기기
  const drag = useRef<{ id: string; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null);
  const activeTexts = doc.texts.filter((x) => t >= x.start && t < x.end);
  function onTextDown(e: React.PointerEvent, x: ReelText) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: x.id, x: e.clientX, y: e.clientY, sx: x.style.x, sy: x.style.y, moved: false };
    setSel({ kind: "text", id: x.id });
    setTab("text");
  }
  function onTextMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = overlay.current?.getBoundingClientRect();
    if (!d || !box) return;
    const k = doc.width / box.width;
    const nx = Math.round(d.sx + (e.clientX - d.x) * k);
    const ny = Math.round(d.sy + (e.clientY - d.y) * k);
    if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 3) return;
    if (!d.moved) { d.moved = true; setDoc((dd) => op.styleTexts(dd, [d.id], {})); }
    setDocRaw((dd) => op.styleTexts(dd, [d.id], { x: Math.max(0, Math.min(doc.width, nx)), y: Math.max(0, Math.min(doc.height, ny)) }));
    setSave("dirty");
  }
  const onTextUp = () => (drag.current = null);

  // 타임라인 끌기 (자막 옮기기·길이, 장면 길이)
  const tdrag = useRef<{ kind: "text-move" | "text-start" | "text-end" | "scene-end"; id: string; x: number; a: number; b: number; base: ReelDoc } | null>(null);
  function tlDown(e: React.PointerEvent, kind: NonNullable<typeof tdrag.current>["kind"], id: string, a: number, b: number) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    tdrag.current = { kind, id, x: e.clientX, a, b, base: doc };
    setSel({ kind: kind === "scene-end" ? "scene" : "text", id });
  }
  function tlMove(e: React.PointerEvent) {
    const d = tdrag.current;
    if (!d) return;
    const dt = (e.clientX - d.x) / pps;
    if (Math.abs(dt) < 0.02) return;
    let n = d.base;
    if (d.kind === "scene-end") n = op.resizeScene(d.base, d.id, d.b - d.a + dt);
    else if (d.kind === "text-move") n = op.patchText(d.base, d.id, { start: Math.max(0, d.a + dt), end: Math.max(0, d.a + dt) + (d.b - d.a) });
    else if (d.kind === "text-start") n = op.patchText(d.base, d.id, { start: Math.min(d.b - 0.2, d.a + dt) });
    else n = op.patchText(d.base, d.id, { end: Math.max(d.a + 0.2, d.b + dt) });
    setDocRaw(n);
    setSave("dirty");
  }
  function tlUp() {
    const d = tdrag.current;
    tdrag.current = null;
    if (d) {
      hist.current.past = [...hist.current.past.slice(-60), d.base];
      hist.current.future = [];
    }
  }
  const tlSeek = (e: React.MouseEvent) => {
    const box = tl.current?.getBoundingClientRect();
    if (!box) return;
    seek((e.clientX - box.left + (tl.current?.scrollLeft ?? 0) - 64) / pps);
  };
  useEffect(() => {
    const w = tl.current?.clientWidth ?? 900;
    setPps(Math.max(8, Math.min(160, Math.floor((w - 80) / Math.max(1, total)))));
  }, [doc.scenes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const peaks = info.guide?.peaks ?? [];

  if (info.status === "analyzing" && !doc.scenes.length)
    return (
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <b><span className="spinner" /> 초안 만드는 중</b>
        <span className="small muted">{info.message}</span>
        <span className="tiny muted">맥에서 말 받아쓰기 → 문장마다 장면·자막을 나눠요. 맥이 꺼져 있으면 켜질 때 시작돼요. 이 화면을 닫아도 계속돼요.</span>
      </div>
    );
  if (!doc.scenes.length)
    return <div className="card card-pad"><b>초안을 만들지 못했어요</b><div className="small muted">{info.message}</div></div>;

  return (
    <div className="stack reel" style={{ gap: 12 }}>
      <div className="row between" style={{ gap: 8 }}>
        <input className="input" style={{ maxWidth: 360, fontWeight: 700 }} value={title} onChange={(e) => { setTitle(e.target.value); setSave("dirty"); }} aria-label="제목" />
        <div className="row" style={{ gap: 6 }}>
          <span className="tiny muted">{{ saved: "저장됨", saving: "저장 중…", dirty: "고치는 중", error: "저장 실패" }[save]}</span>
          <button className="btn btn-sm" onClick={undo} title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>
          <button className="btn btn-sm" onClick={redo} title="다시 (Ctrl+Shift+Z)">↷</button>
          <button className="btn btn-primary btn-sm" disabled={info.status === "rendering"} onClick={exportReel}>{info.status === "rendering" ? <><span className="spinner" /> {info.message}</> : "⬇ 내보내기"}</button>
        </div>
      </div>
      {(err || info.status === "error") && <div className="notice notice-bad small">{err || info.message}</div>}

      <div className="reel-main">
        {/* 왼쪽 탭 */}
        <aside className="card reel-panel">
          <div className="reel-tabs" role="tablist">
            {(["files", "text", "scene", "bg"] as Tab[]).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{{ files: "내 파일", text: "글자", scene: "장면", bg: "배경" }[k]}</button>
            ))}
          </div>
          <div className="reel-panel-body">
            {tab === "files" && (
              <div className="stack" style={{ gap: 8 }}>
                <label className="btn btn-sm btn-primary" style={{ alignSelf: "flex-start" }}>
                  + 내 영상 올리기
                  <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                </label>
                {upload && <div className="tiny">올리는 중 {upload.pct}% · {upload.name}</div>}
                <span className="tiny muted">{curScene ? `누르면 '${curScene.label.slice(0, 16)}' 장면이 그 영상으로 바뀌어요.` : "장면을 먼저 고르세요."}</span>
                <div className="reel-files">
                  {files.map((f) => (
                    <button key={f.id} className={`reel-file${curScene?.video.videoId === f.id ? " on" : ""}`} disabled={!curScene} onClick={() => curScene && setDoc((d) => op.patchScenes(d, [curScene.id], () => ({ video: { videoId: f.id, from: 0 } })))}>
                      {f.thumb ? <img src={`/api/videos/${f.id}/file?kind=thumb`} alt="" /> : <span className="reel-file-ph">🎞</span>}
                      <span className="tiny ellipsis">{f.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === "scene" && (
              <div className="stack" style={{ gap: 6 }}>
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={doc.audio === "base"} onChange={(e) => setDoc((d) => ({ ...d, audio: e.target.checked ? "base" : "none" }))} /> 원래 영상의 소리(목소리) 쓰기</label>
                {doc.scenes.map((s, i) => (
                  <div key={s.id} className={`reel-scene${sel?.id === s.id ? " on" : ""}`} onClick={() => { setSel({ kind: "scene", id: s.id }); seek(starts[i] + 0.01); }}>
                    <div className="row between" style={{ flexWrap: "nowrap" }}>
                      <span className="small"><b>{String(i + 1).padStart(2, "0")}</b> {s.label}</span>
                    </div>
                    <span className="tiny muted">{fmt(starts[i])} · {s.dur.toFixed(1)}초{s.video.videoId ? " · 내 영상" : ""}{s.bg.type !== "none" ? " · 배경" : ""}</span>
                    {sel?.id === s.id && (
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setTab("files"); }}>⇄ 내 영상으로</button>
                        {s.video.videoId && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setDoc((d) => op.patchScenes(d, [s.id], () => ({ video: { videoId: null, from: 0 } }))); }}>원래 영상</button>}
                        <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setDoc((d) => op.patchScenes(d, [s.id], (x) => ({ fit: x.fit === "cover" ? "contain" : "cover" }))); }}>{s.fit === "cover" ? "화면 가득" : "전체 보이기"}</button>
                        <input className="input" style={{ fontSize: 12 }} value={s.label} onClick={(e) => e.stopPropagation()} onChange={(e) => setDoc((d) => op.patchScenes(d, [s.id], () => ({ label: e.target.value })))} aria-label="장면 이름" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "text" && (
              <div className="stack" style={{ gap: 8 }}>
                <button className="btn btn-sm" onClick={newText} style={{ alignSelf: "flex-start" }}>+ 자막 추가 (지금 위치)</button>
                <div className="seg">
                  <button className={!scopeAll ? "on" : ""} onClick={() => setScopeAll(false)}>이 자막만</button>
                  <button className={scopeAll ? "on" : ""} onClick={() => setScopeAll(true)}>자막 전체 {doc.texts.length}개</button>
                </div>
                {!selText && !scopeAll ? (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="tiny muted">자막을 고르세요 (화면이나 타임라인에서 눌러도 돼요)</span>
                    {doc.texts.slice().sort((a, b) => a.start - b.start).map((x) => (
                      <button key={x.id} className="reel-scene" style={{ textAlign: "left" }} onClick={() => { setSel({ kind: "text", id: x.id }); seek(x.start + 0.01); }}>
                        <span className="small ellipsis">{x.text}</span>
                        <span className="tiny muted">{fmt(x.start)} ~ {fmt(x.end)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <TextControls t={selText ?? doc.texts[0]} scopeAll={scopeAll} onText={(patch) => selText && setDoc((d) => op.patchText(d, selText.id, patch))} onStyle={style} />
                )}
              </div>
            )}

            {tab === "bg" && (
              <div className="stack" style={{ gap: 10 }}>
                <div className="seg">
                  <button className={!scopeAll ? "on" : ""} onClick={() => setScopeAll(false)}>지금 장면{curScene ? ` · ${curScene.label.slice(0, 8)}` : ""}</button>
                  <button className={scopeAll ? "on" : ""} onClick={() => setScopeAll(true)}>전체 장면</button>
                </div>
                <button className="btn btn-sm" onClick={() => bg({ type: "none" })}>원래 배경으로</button>
                <span className="tiny muted strong">단색</span>
                <div className="reel-swatches">
                  {COLORS.map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => bg({ type: "color", color: c })} aria-label={`단색 ${c}`} />)}
                </div>
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

        {/* 가이드 · 편집 · 완성 */}
        <div className="reel-stage">
          <div className="reel-col">
            <span className="reel-label">가이드 (원본)</span>
            <div className="reel-frame">
              {info.base_video_id && <video ref={guide} src={`/api/videos/${info.base_video_id}/file`} muted playsInline preload="auto" />}
            </div>
          </div>
          <div className="reel-col">
            <span className="reel-label">편집 화면</span>
            <div className="reel-frame">
              <Player
                ref={player}
                component={Reel}
                inputProps={inputProps}
                durationInFrames={totalFrames}
                fps={fps}
                compositionWidth={doc.width}
                compositionHeight={doc.height}
                style={{ width: "100%", height: "100%" }}
                acknowledgeRemotionLicense
              />
              <div ref={overlay} className="reel-overlay" onPointerMove={onTextMove} onPointerUp={onTextUp} onClick={() => setSel(null)}>
                {activeTexts.map((x) => (
                  <div
                    key={x.id}
                    className={`reel-hit${sel?.id === x.id ? " on" : ""}`}
                    style={{ left: `${((x.style.x - x.style.width / 2) / doc.width) * 100}%`, top: `${(x.style.y / doc.height) * 100}%`, width: `${(x.style.width / doc.width) * 100}%`, height: `${((x.style.size * 1.5) / doc.height) * 100}%`, transform: `translateY(-50%) rotate(${x.style.rotate}deg)` }}
                    onPointerDown={(e) => onTextDown(e, x)}
                    onClick={(e) => e.stopPropagation()}
                    title="끌어서 옮기기"
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="reel-col">
            <span className="reel-label">완성 영상</span>
            <div className="reel-frame">
              {info.output_video_id ? <video key={info.output_video_id} src={`/api/videos/${info.output_video_id}/file`} controls playsInline /> : <div className="reel-empty tiny muted">⬇ 내보내기를 하면 여기서 볼 수 있어요</div>}
            </div>
            {info.output_video_id && <Link className="tiny" style={{ color: "var(--accent)" }} href={`/videos/${info.output_video_id}`}>영상공장에서 열기 · 받기 →</Link>}
          </div>
        </div>
      </div>

      {/* 타임라인 */}
      <section className="card reel-tl-card">
        <div className="row between reel-tools">
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-sm" onClick={toggle}>{playing ? "⏸" : "▶"}</button>
            <span className="small mono">{fmt(t)} / {fmt(total)}</span>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-sm" onClick={split} title="S">✂ 자르기</button>
            <button className="btn btn-sm" onClick={remove} disabled={!sel} title="Delete">🗑 지우기</button>
            <button className="btn btn-sm" onClick={duplicate} disabled={!sel}>⧉ 복제</button>
            <button className="btn btn-sm" onClick={newText}>T 자막</button>
            <input type="range" min={8} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="확대" style={{ width: 90 }} />
          </div>
        </div>
        <div className="reel-tl" ref={tl} onPointerMove={tlMove} onPointerUp={tlUp}>
          <div style={{ width: 64 + total * pps + 40, position: "relative" }}>
            <div className="reel-ruler" onClick={tlSeek}>
              {Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (pps >= 20 || s % 5 === 0) && <span key={s} style={{ left: 64 + s * pps }}>{s}s</span>)}
            </div>
            <div className="reel-track"><span className="reel-tname">장면</span>
              {doc.scenes.map((s, i) => (
                <div key={s.id} className={`reel-block scene${sel?.id === s.id ? " on" : ""}${s.video.videoId ? " mine" : ""}`} style={{ left: 64 + starts[i] * pps, width: Math.max(4, s.dur * pps - 2) }} onClick={(e) => { e.stopPropagation(); setSel({ kind: "scene", id: s.id }); setTab("scene"); if (t < starts[i] || t >= starts[i] + s.dur) seek(starts[i] + 0.01); }}>
                  <span className="ellipsis">{String(i + 1).padStart(2, "0")} {s.label}</span>
                  <i className="h r" onPointerDown={(e) => tlDown(e, "scene-end", s.id, starts[i], starts[i] + s.dur)} />
                </div>
              ))}
            </div>
            <div className="reel-track"><span className="reel-tname">자막</span>
              {doc.texts.map((x) => (
                <div key={x.id} className={`reel-block text${sel?.id === x.id ? " on" : ""}`} style={{ left: 64 + x.start * pps, width: Math.max(4, (x.end - x.start) * pps - 2) }} onPointerDown={(e) => { tlDown(e, "text-move", x.id, x.start, x.end); setTab("text"); }}>
                  <i className="h l" onPointerDown={(e) => tlDown(e, "text-start", x.id, x.start, x.end)} />
                  <span className="ellipsis">{x.text}</span>
                  <i className="h r" onPointerDown={(e) => tlDown(e, "text-end", x.id, x.start, x.end)} />
                </div>
              ))}
            </div>
            <div className="reel-track audio"><span className="reel-tname">소리</span>
              {doc.audio === "base" && doc.scenes.map((s, i) => (
                <div key={s.id} className="reel-wave" style={{ left: 64 + starts[i] * pps, width: Math.max(2, s.dur * pps - 2) }}>
                  {peaks.slice(Math.floor(s.audioFrom * 20), Math.floor((s.audioFrom + s.dur) * 20)).filter((_, k, arr) => arr.length < s.dur * pps / 2 || k % Math.ceil(arr.length / (s.dur * pps / 2)) === 0).map((p, k) => <b key={k} style={{ height: `${Math.max(4, p)}%` }} />)}
                </div>
              ))}
            </div>
            <div className="reel-playhead" style={{ left: 64 + t * pps }} />
          </div>
        </div>
        <p className="tiny muted" style={{ padding: "6px 12px" }}>S 자르기 · Delete 지우기 · Ctrl+Z 되돌리기 · 스페이스 재생 · 자막 칸은 끌어서 옮기고 양 끝을 끌어 길이 조절 · 장면은 오른쪽 끝을 끌어 길이 조절</p>
      </section>
    </div>
  );
}

function TextControls({ t, scopeAll, onText, onStyle }: { t: ReelText; scopeAll: boolean; onText: (p: Partial<ReelText>) => void; onStyle: (p: Partial<ReelTextStyle>) => void }) {
  const s = t.style;
  return (
    <div className="stack reel-ctl" style={{ gap: 8 }}>
      {!scopeAll && (
        <>
          <textarea className="textarea" rows={2} value={t.text} onChange={(e) => onText({ text: e.target.value })} aria-label="자막 글" />
          <div className="row" style={{ gap: 6 }}>
            <label className="tiny">시작 <input className="input" type="number" step={0.1} value={t.start} onChange={(e) => onText({ start: Number(e.target.value) })} /></label>
            <label className="tiny">끝 <input className="input" type="number" step={0.1} value={t.end} onChange={(e) => onText({ end: Number(e.target.value) })} /></label>
          </div>
        </>
      )}
      <label className="reel-row"><span>크기</span><input type="range" min={24} max={180} value={s.size} onChange={(e) => onStyle({ size: Number(e.target.value) })} /><b>{s.size}</b></label>
      <label className="reel-row"><span>굵게</span><button className={`btn btn-sm ${s.bold ? "btn-primary" : ""}`} onClick={() => onStyle({ bold: !s.bold })}>{s.bold ? "켬" : "끔"}</button></label>
      <label className="reel-row"><span>글자색</span><input type="color" value={s.color} onChange={(e) => onStyle({ color: e.target.value })} /><span className="tiny mono">{s.color}</span></label>
      <div className="reel-row"><span>상자</span>
        <div className="reel-swatches small">
          <button className="sw none" onClick={() => onStyle({ box: "" })} aria-label="상자 없음">없음</button>
          {["#ffd1e8", "#ffffff", "#000000", "#ffe98a", "#c8f7dc"].map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => onStyle({ box: c })} aria-label={`상자 ${c}`} />)}
        </div>
      </div>
      <div className="reel-row"><span>테두리</span>
        <div className="seg">
          {[["", "없음"], ["#000000", "검정"], ["#ffffff", "흰색"]].map(([v, l]) => <button key={l} className={s.stroke === v ? "on" : ""} onClick={() => onStyle({ stroke: v })}>{l}</button>)}
        </div>
      </div>
      <div className="reel-row"><span>한 줄 맞춤</span><button className={`btn btn-sm ${s.fit ? "btn-primary" : ""}`} onClick={() => onStyle({ fit: !s.fit })}>{s.fit ? "넘치면 줄여요" : "줄바꿈"}</button></div>
      <div className="reel-row"><span>정렬</span>
        <div className="seg">{(["left", "center", "right"] as const).map((a) => <button key={a} className={s.align === a ? "on" : ""} onClick={() => onStyle({ align: a })}>{{ left: "왼쪽", center: "가운데", right: "오른쪽" }[a]}</button>)}</div>
      </div>
      <div className="reel-row"><span>위치</span>
        <div className="row" style={{ gap: 4 }}>
          {[["위", { y: 360 }], ["가운데", { y: 960 }], ["자막 자리", { y: 1500 }], ["아래", { y: 1720 }], ["가로 가운데", { x: 540 }]].map(([l, p]) => <button key={l as string} className="btn btn-sm btn-ghost" onClick={() => onStyle(p as Partial<ReelTextStyle>)}>{l as string}</button>)}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <label className="tiny">가로 X <input className="input" type="number" value={s.x} onChange={(e) => onStyle({ x: Number(e.target.value) })} /></label>
        <label className="tiny">세로 Y <input className="input" type="number" value={s.y} onChange={(e) => onStyle({ y: Number(e.target.value) })} /></label>
      </div>
      <label className="reel-row"><span>글 폭</span><input type="range" min={200} max={1080} value={s.width} onChange={(e) => onStyle({ width: Number(e.target.value) })} /><b>{s.width}</b></label>
      <label className="reel-row"><span>회전</span><input type="range" min={-30} max={30} value={s.rotate} onChange={(e) => onStyle({ rotate: Number(e.target.value) })} /><b>{s.rotate}°</b></label>
      <span className="tiny muted">{scopeAll ? "자막 전체에 한 번에 적용돼요." : "편집 화면에서 자막을 끌어서 옮길 수도 있어요."}</span>
    </div>
  );
}
