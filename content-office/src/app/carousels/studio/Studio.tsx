"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import type { Carousel, Slide } from "@/lib/carousel";
import { MOTIONS, SH, SW, baseEl, sceneFromSlide, type El, type ElType, type Motion, type Scene } from "@/lib/carousel-scene";
import { drawScene, layoutText } from "./scene-render";
import { makeMotionVideo } from "../motion-video";
import BlogPostPicker from "../BlogPostPicker";
import HashtagInput from "@/components/HashtagInput";
import CarouselTextAI from "../CarouselTextAI";
import { formatHashtags, hashtagTokens } from "@/lib/caption-styles";

/**
 * 🎞 캐러셀 편집 툴
 * 왼쪽 = 장 목록 · 가운데 = 미리보기(누르면 고르기, 끌면 옮기기, 파란 모서리 = 크기, 더블클릭 = 글자 고치기, Delete = 삭제)
 * 오른쪽 = 수정 칸(배경·스타일 / 위치·크기 / 글씨 / 모션 사전 / 수정 메모). 미리보기와 MP4 뽑기가 같은 값을 씀
 */
const imgKey = (url: string) => { let h = 5381; for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0; return h.toString(36); };
const TABS = [["note", "수정 메모"], ["bg", "배경·스타일"], ["pos", "위치·크기"], ["text", "글씨"], ["motion", "모션 사전"]] as const;
type Tab = (typeof TABS)[number][0];
const TYPE_KO: Record<ElType, string> = { text: "글자", image: "사진", rect: "네모", circle: "동그라미", line: "선", sparkle: "반짝이" };
const SWATCH = ["#ffffff", "#f5f6f8", "#16181d", "#3355ff", "#eaeeff", "#7b93ff", "#ffd84d", "#ff6b6b", "#ffe3e3", "#138a4b", "#e3f6ec", "#a15c00", "#fff3dc"];
const hashScene = (sc: Scene, urls: string[]) => imgKey(JSON.stringify(sc) + urls.join("|"));

function useImages(id: string, urls: string[]) {
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>([]);
  const keys = urls.map(imgKey).join(".");
  useEffect(() => {
    let alive = true;
    Promise.all(urls.map((u, n) => new Promise<HTMLImageElement | null>((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = `/api/carousels/${id}/img/${n}?k=${imgKey(u)}`; }))).then((l) => alive && setImgs(l));
    return () => { alive = false; };
  }, [id, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  return imgs;
}

function Thumb({ scene, imgs, ready }: { scene: Scene; imgs: (HTMLImageElement | null)[]; ready: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawScene(ref.current, scene, null, imgs); }, [scene, imgs, ready]);
  return <canvas ref={ref} style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, background: "var(--panel-2)" }} />;
}

function Num({ label, value, onChange, step = 1, w = 72 }: { label: string; value: number; onChange: (n: number) => void; step?: number; w?: number }) {
  return <label className="tiny stack" style={{ gap: 2 }}>{label}<input className="input" type="number" step={step} value={Math.round(value * 100) / 100} onChange={(e) => onChange(Number(e.target.value))} style={{ width: w, padding: "4px 6px" }} /></label>;
}
function Slider({ label, value, min, max, step = 1, onChange, unit = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <label className="small row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <span style={{ width: 64, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)" }} />
      <span className="tiny muted" style={{ width: 48, textAlign: "right" }}>{Math.round(value * 100) / 100}{unit}</span>
    </label>
  );
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <div className="small row" style={{ gap: 6, flexWrap: "wrap" }}>
      <span style={{ width: 64 }}>{label}</span>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ width: 34, height: 26, padding: 0, border: "1px solid var(--line)", borderRadius: 6 }} />
      {SWATCH.slice(0, 8).map((c) => <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} style={{ width: 18, height: 18, borderRadius: 9, border: value === c ? "2px solid var(--accent)" : "1px solid var(--line)", background: c, padding: 0, cursor: "pointer" }} />)}
    </div>
  );
}

export default function Studio({ initial, recent = [] }: { initial: Carousel; recent?: { title: string; url: string; blog: string }[] }) {
  const accentFallback = "#3355ff"; // 오피스 앱 강조색 (예전 캐러셀 주황 대신)
  const [c, setC] = useState(initial);
  const [scenes, setScenes] = useState<Scene[]>(() => initial.slides.map((s, i) => s.scene ?? sceneFromSlide(s, i, initial.slides.length, accentFallback, initial.style?.handle || "")));
  const [cur, setCur] = useState(0);
  const [sels, setSels] = useState<string[]>([]);
  const sel = sels[sels.length - 1] ?? null;
  const setSel = (id: string | null) => setSels(id ? [id] : []);
  const [tab, setTab] = useState<Tab>("pos");
  const [hideTop, setHideTop] = useState(false);
  const [view, setView] = useState<"preview" | "mp4">("preview");
  const [time, setTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [rendered, setRendered] = useState<Record<number, { url: string; hash: string; name: string }>>({});
  const [renderedHash, setRenderedHash] = useState<Record<number, string>>({});
  const [caption, setCaption] = useState(initial.caption);
  const [tags, setTags] = useState(initial.hashtags.map((h) => "#" + h).join(" "));
  const [importUrl, setImportUrl] = useState("");
  const past = useRef<Scene[][]>([]), future = useRef<Scene[][]>([]);
  const original = useRef<Scene[]>(JSON.parse(JSON.stringify(scenes)));
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const imgs = useImages(c.id, c.images.map((x) => x.url));
  const scene = scenes[cur];
  const el = scene?.els.find((e) => e.id === sel) ?? null;
  const urls = c.images.map((x) => x.url);
  const [stageW, setStageW] = useState(560);
  useEffect(() => { const n = stage.current; if (!n || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setStageW(n.clientWidth || 560)); ro.observe(n); setStageW(n.clientWidth || 560); return () => ro.disconnect(); }, [view]);
  const accent = accentFallback;

  useEffect(() => { document.fonts?.load(`800 80px "Noto Sans KR"`).then(() => document.fonts.load(`500 40px "Noto Sans KR"`)).finally(() => setFontReady(true)); }, []);
  useEffect(() => { try { setRenderedHash(JSON.parse(localStorage.getItem(`carousel-rendered:${c.id}`) ?? "{}")); } catch {} }, [c.id]);

  // ── 바꾸기 + 되돌리기 기록 ──
  const commit = useCallback((next: Scene[], record = true) => {
    if (record) { past.current.push(scenes); if (past.current.length > 80) past.current.shift(); future.current = []; }
    setScenes(next); setSaveState("dirty");
  }, [scenes]);
  const patchScene = (fn: (s: Scene) => Scene, record = true) => commit(scenes.map((s, i) => (i === cur ? fn(s) : s)), record);
  const patchEl = (id: string, p: Partial<El>, record = true) => patchScene((s) => ({ ...s, els: s.els.map((e) => (e.id === id ? { ...e, ...p } : e)) }), record);
  /** 여러 개 고른 경우: 고른 요소 모두에 (fn이 요소마다 바꿀 값을 돌려줌) */
  const patchSel = (fn: (e: El) => Partial<El>, record = true) => patchScene((s) => ({ ...s, els: s.els.map((e) => (sels.includes(e.id) ? { ...e, ...fn(e) } : e)) }), record);
  const multi = sels.length > 1;
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(scenes); setScenes(p); setSaveState("dirty"); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(scenes); setScenes(f); setSaveState("dirty"); };

  // ── 자동 저장 ──
  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const slides: Slide[] = c.slides.map((s, i) => ({ ...s, scene: scenes[i] }));
      // 장 수가 바뀌었으면 (추가·삭제) 장면 수에 맞춤
      const all = scenes.map((sc, i) => ({ ...(slides[i] ?? { kind: "content" as const, headline: "", body: "", image: null }), scene: sc }));
      const next = await api<Carousel>(`/api/carousels/${c.id}`, "PUT", { title: c.title, slides: all, caption, hashtags: hashtagTokens(tags), style: c.style });
      setC(next);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setMsg({ ok: false, text: `저장하지 못했어요: ${(e as Error).message}` });
    }
  }, [c, scenes, caption, tags]);
  useEffect(() => { if (saveState !== "dirty") return; const t = setTimeout(() => void save(), 1500); return () => clearTimeout(t); }, [saveState, save]);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving") e.preventDefault(); }; window.addEventListener("beforeunload", f); return () => window.removeEventListener("beforeunload", f); }, [saveState]);

  // ── 미리보기 그리기 · 재생 ──
  useEffect(() => { if (canvas.current && scene && view === "preview") drawScene(canvas.current, scene, time, imgs); }, [scene, time, imgs, fontReady, view]);
  useEffect(() => {
    if (!playing || !scene) return;
    let raf = 0; const t0 = performance.now() - (time ?? 0) * 1000;
    const tick = () => { const t = (performance.now() - t0) / 1000; if (t >= scene.dur) { setTime(scene.dur); setPlaying(false); return; } setTime(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = () => { setSel(null); setEditing(null); if ((time ?? scene.dur) >= scene.dur - 0.05) setTime(0); setPlaying(true); };

  // ── 키보드: Delete 삭제 · 방향키 이동 · Ctrl+Z ──
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (typing || !sels.length) return;
      if (e.key === "Escape") { setSels([]); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); patchScene((s) => ({ ...s, els: s.els.filter((x) => !sels.includes(x.id)) })); setSels([]); }
      const d = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft") { e.preventDefault(); patchSel((x) => ({ x: x.x - d })); }
      if (e.key === "ArrowRight") { e.preventDefault(); patchSel((x) => ({ x: x.x + d })); }
      if (e.key === "ArrowUp") { e.preventDefault(); patchSel((x) => ({ y: x.y - d })); }
      if (e.key === "ArrowDown") { e.preventDefault(); patchSel((x) => ({ y: x.y + d })); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSels(scene.els.filter((x) => !x.locked && !x.hidden).map((x) => x.id)); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  // ── 요소 추가·삭제 ──
  function addEl(type: ElType) {
    const e = baseEl(type, accent, type === "image" ? { image: c.images.length ? 0 : 0 } : {});
    if (type === "image" && !c.images.length) { setMsg({ ok: false, text: "먼저 '배경·스타일' 칸에서 블로그 글 사진을 가져오거나 사진을 올려 주세요." }); setTab("bg"); return; }
    patchScene((s) => ({ ...s, els: [...s.els, e] }));
    setSel(e.id); setTab(type === "text" ? "text" : "pos"); setTime(null);
  }
  function removeEl(id: string) { patchScene((s) => ({ ...s, els: s.els.filter((e) => e.id !== id) })); setSel(null); }
  function moveLayer(id: string, dir: 1 | -1) {
    patchScene((s) => { const i = s.els.findIndex((e) => e.id === id), j = i + dir; if (i < 0 || j < 0 || j >= s.els.length) return s; const els = s.els.slice(); [els[i], els[j]] = [els[j], els[i]]; return { ...s, els }; });
  }

  // ── 장 추가·복제·삭제·순서 ──
  function addSlide(copy = false) {
    const sc: Scene = copy ? JSON.parse(JSON.stringify(scene)) : { v: 1, bg: { color: "#ffffff", pattern: "grid", glow: true }, els: [baseEl("text", accent, { name: "제목", y: 520, size: 80, weight: 900, text: "새 장 제목" })], dur: 5 };
    if (copy) sc.els = sc.els.map((e) => ({ ...e, id: baseEl(e.type, accent).id }));
    const next = [...scenes.slice(0, cur + 1), sc, ...scenes.slice(cur + 1)];
    setC((x) => ({ ...x, slides: [...x.slides.slice(0, cur + 1), { kind: "content", headline: "", body: "", image: null }, ...x.slides.slice(cur + 1)] }));
    commit(next); setCur(cur + 1); setSel(null);
  }
  function removeSlide() {
    if (scenes.length <= 1) return;
    if (!confirm(`${cur + 1}장을 지울까요? (되돌리기로 살릴 수 있어요)`)) return;
    setC((x) => ({ ...x, slides: x.slides.filter((_, i) => i !== cur) }));
    commit(scenes.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); setSel(null);
  }
  function moveSlide(dir: 1 | -1) {
    const j = cur + dir; if (j < 0 || j >= scenes.length) return;
    const sw = <T,>(a: T[]) => { const b = a.slice(); [b[cur], b[j]] = [b[j], b[cur]]; return b; };
    setC((x) => ({ ...x, slides: sw(x.slides) })); commit(sw(scenes)); setCur(j);
  }

  // ── 미리보기에서 고르기·끌기·크기 ──
  const scale = () => stageW / SW;
  function startDrag(e: React.PointerEvent, target: El, mode: "move" | "resize") {
    e.preventDefault(); e.stopPropagation();
    // Ctrl(맥은 ⌘)·Shift + 누르기 = 여러 개 고르기 / 빼기
    if (mode === "move" && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      setSels((cur) => (cur.includes(target.id) ? cur.filter((x) => x !== target.id) : [...cur, target.id]));
      return;
    }
    if (target.locked) { setSel(target.id); return; }
    const group = mode === "move" && sels.includes(target.id) && sels.length > 1 ? sels : [target.id];
    if (group.length === 1) setSel(target.id);
    setPlaying(false); setTime(null);
    const starts0 = Object.fromEntries(scene.els.filter((x) => group.includes(x.id) && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }]));
    const k = scale(), sx = e.clientX, sy = e.clientY, o = { x: target.x, y: target.y, w: target.w, h: target.h };
    const before = scenes;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      if (mode === "move") {
        setScenes((all) => all.map((s, i) => (i === cur ? { ...s, els: s.els.map((x) => (starts0[x.id] ? { ...x, x: Math.round(starts0[x.id].x + dx), y: Math.round(starts0[x.id].y + dy) } : x)) } : s)));
        return;
      }
      const p = { w: Math.max(20, Math.round(o.w + dx)), h: Math.max(target.type === "line" ? 2 : 20, Math.round(o.h + dy)) };
      setScenes((all) => all.map((s, i) => (i === cur ? { ...s, els: s.els.map((x) => (x.id === target.id ? { ...x, ...p } : x)) } : s)));
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      if (moved) { past.current.push(before); future.current = []; setSaveState("dirty"); }
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  /** 글자 상자 높이를 글자에 맞춤 */
  function fitTextHeight(e: El): number {
    const cv = document.createElement("canvas").getContext("2d")!;
    return Math.max(20, Math.ceil(layoutText(cv, e).height));
  }

  // ── 사진 가져오기·올리기·지우기 ──
  async function importPhotos() {
    setBusy("import");
    try {
      const r = await api<{ added: number; carousel: Carousel }>(`/api/carousels/${c.id}`, "POST", { action: "import_images", url: importUrl.trim() });
      setC((x) => ({ ...x, images: r.carousel.images, style: { ...x.style, removedImages: r.carousel.style?.removedImages } }));
      setMsg({ ok: true, text: `사진 ${r.added}장을 가져왔어요. 사진을 누르면 이 장 배경이 돼요.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy("");
  }
  async function upload(files: File[]) {
    setBusy("upload");
    try {
      for (const f of files.filter((x) => x.type.startsWith("image/")).slice(0, 6)) {
        const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
        const r = await api<{ index: number; carousel: Carousel }>(`/api/carousels/${c.id}`, "POST", { action: "upload", dataUrl });
        setC((x) => ({ ...x, images: r.carousel.images }));
      }
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy("");
  }
  async function removePhoto(n: number) {
    if (!confirm(`사진 ${n + 1}을(를) 지울까요? 이 사진을 쓰던 배경·사진 요소는 빠져요. '지운 사진'에서 30일 안에 되살릴 수 있어요.`)) return;
    if (saveState !== "saved") await save();
    setBusy("photo");
    try {
      const next = await api<Carousel>(`/api/carousels/${c.id}`, "POST", { action: "remove_image", index: n, slides: scenes.map((sc, i) => ({ ...(c.slides[i] ?? { kind: "content", headline: "", body: "", image: null }), scene: sc })) });
      setC(next); setScenes(next.slides.map((s, i) => s.scene ?? scenes[i])); past.current = []; future.current = [];
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy("");
  }
  async function restorePhoto(at: string, url: string) {
    try { const next = await api<Carousel>(`/api/carousels/${c.id}`, "POST", { action: "restore_image", at, url }); setC((x) => ({ ...x, images: next.images, style: { ...x.style, removedImages: next.style?.removedImages } })); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  // ── MP4 뽑기 ──
  const hashes = useMemo(() => scenes.map((s) => hashScene(s, urls)), [scenes, urls.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = scenes.map((_, i) => i).filter((i) => renderedHash[i] !== hashes[i]);
  async function render(which: number[]) {
    if (!which.length) { setMsg({ ok: true, text: "고친 장이 없어요. 모든 장이 마지막으로 뽑은 그대로예요." }); return; }
    setBusy("render"); setMsg(null); setPlaying(false);
    if (saveState !== "saved") await save();
    try {
      await document.fonts?.ready;
      const out = { ...rendered }, hs = { ...renderedHash };
      for (const [n, i] of which.entries()) {
        const sc = scenes[i];
        const { blob, ext } = await makeMotionVideo((cv, t) => drawScene(cv, sc, t * sc.dur, imgs), sc.dur, (p) => setMsg({ ok: true, text: `🎞 ${i + 1}장 영상 만드는 중… (${n + 1}/${which.length}) ${Math.round(p * 100)}%` }));
        const name = `carousel-${String(i + 1).padStart(2, "0")}.${ext}`;
        if (out[i]?.url) URL.revokeObjectURL(out[i].url);
        out[i] = { url: URL.createObjectURL(blob), hash: hashes[i], name };
        hs[i] = hashes[i];
        const a = document.createElement("a"); a.href = out[i].url; a.download = name; a.click();
        await new Promise((r) => setTimeout(r, 350));
      }
      setRendered(out); setRenderedHash(hs);
      try { localStorage.setItem(`carousel-rendered:${c.id}`, JSON.stringify(hs)); } catch {}
      setMsg({ ok: true, text: `${which.length}장을 MP4로 뽑아 내려받았어요. 인스타 새 게시물에서 번호 순서대로 고르면 돼요.` });
      setView("mp4");
    } catch (e) { setMsg({ ok: false, text: `영상을 만들지 못했어요: ${(e as Error).message}` }); }
    setBusy("");
  }
  async function savePngs() {
    setBusy("png");
    try {
      for (const [i, sc] of scenes.entries()) {
        const cv = document.createElement("canvas"); drawScene(cv, sc, null, imgs);
        const blob = await new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("이미지 만들기 실패"))), "image/png"));
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `carousel-${String(i + 1).padStart(2, "0")}.png`; a.click();
        await new Promise((r) => setTimeout(r, 300)); URL.revokeObjectURL(a.href);
      }
      setMsg({ ok: true, text: `${scenes.length}장을 사진(PNG)으로 내려받았어요.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy("");
  }

  if (!scene) return null;
  const k = stageW / SW;
  const motionsFor = MOTIONS.filter((m) => m.for === "all" || !el || multi || m.for.includes(el.type));
  const setMotion = (p: Partial<Motion>) => el && patchEl(el.id, { motion: { ...el.motion, ...p } });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" />
      {/* 위 막대 */}
      <div className="card card-pad row between" style={{ gap: 8, flexWrap: "wrap", padding: "10px 14px" }}>
        <div className="row" style={{ gap: 8 }}>
          <b style={{ color: "var(--accent)" }}>🎞 캐러셀 편집 툴</b>
          <span className="tiny muted" role="status">{saveState === "saved" ? "저장됨" : saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 실패" : "고치는 중"}</span>
          <button className="btn btn-sm" onClick={undo} disabled={!past.current.length}>↶ 되돌리기</button>
          <button className="btn btn-sm" onClick={redo} disabled={!future.current.length}>↷ 다시 하기</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void savePngs()}>{busy === "png" ? <span className="spinner" /> : "🖼 사진(PNG)으로 저장"}</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void render(scenes.map((_, i) => i))}>전체 MP4</button>
          <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void render(changed)}>{busy === "render" ? <span className="spinner" /> : `고친 장만 MP4 (${changed.length}장)`}</button>
        </div>
      </div>
      {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`} role="status">{msg.text}</div>}

      <div className="studio-grid" style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr) 360px", gap: 10, alignItems: "start" }}>
        {/* 왼쪽: 장 목록 */}
        <div className="card" style={{ padding: 8, maxHeight: "calc(100vh - 140px)", overflowY: "auto", position: "sticky", top: 8 }}>
          {scenes.map((s, i) => (
            <button key={i} type="button" onClick={() => { setCur(i); setSel(null); setTime(null); setPlaying(false); setEditing(null); }} className="stack" style={{ gap: 4, width: "100%", padding: 6, marginBottom: 6, border: i === cur ? "2px solid var(--accent)" : "1px solid var(--line)", borderRadius: 10, background: i === cur ? "var(--accent-soft)" : "var(--panel)", cursor: "pointer", textAlign: "left" }} aria-current={i === cur}>
              <Thumb scene={s} imgs={imgs} ready={fontReady} />
              <span className="tiny"><b>{String(i + 1).padStart(2, "0")}</b> {s.els.find((e) => e.type === "text" && e.name === "제목")?.text?.replace(/==/g, "").slice(0, 14) || (i === 0 ? "표지" : "")}{renderedHash[i] && renderedHash[i] !== hashes[i] ? <span className="badge" style={{ marginLeft: 4, padding: "0 5px", background: "var(--warn-soft)", color: "var(--warn)" }}>고침</span> : null}</span>
            </button>
          ))}
          <div className="stack" style={{ gap: 4 }}>
            <button className="btn btn-sm" onClick={() => addSlide(false)}>+ 장 추가</button>
            <button className="btn btn-sm" onClick={() => addSlide(true)}>⧉ 이 장 복제</button>
            <div className="row" style={{ gap: 4 }}><button className="btn btn-sm" style={{ flex: 1 }} disabled={cur === 0} onClick={() => moveSlide(-1)}>↑</button><button className="btn btn-sm" style={{ flex: 1 }} disabled={cur === scenes.length - 1} onClick={() => moveSlide(1)}>↓</button></div>
            <button className="btn btn-sm btn-ghost" disabled={scenes.length <= 1} onClick={removeSlide}>🗑 이 장 지우기</button>
          </div>
        </div>

        {/* 가운데: 미리보기 */}
        <div className="card" style={{ padding: 10, background: "var(--panel-2)" }}>
          <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button className={`btn btn-sm ${view === "preview" ? "btn-primary" : ""}`} onClick={() => setView("preview")}>미리보기</button>
            <button className={`btn btn-sm ${view === "mp4" ? "btn-primary" : ""}`} onClick={() => setView("mp4")}>뽑은 mp4</button>
            <span className="tiny muted">요소를 누르면 골라져요. 글자는 더블클릭하면 바로 고쳐져요. 끌면 옮겨지고, 파란 모서리는 크기, Delete는 삭제예요. Ctrl(⌘)+누르기로 여러 개를 함께 골라요.</span>
          </div>
          {view === "mp4" ? (
            rendered[cur] ? <video key={rendered[cur].url} src={rendered[cur].url} controls autoPlay loop muted playsInline style={{ width: "100%", maxWidth: 560, display: "block", margin: "0 auto", borderRadius: 8 }} />
              : <p className="small muted" style={{ textAlign: "center", padding: 40 }}>이 장은 아직 뽑은 MP4가 없어요. 위 &apos;고친 장만 MP4&apos;나 &apos;전체 MP4&apos;를 눌러 주세요. (뽑은 영상은 이 창을 닫으면 사라지고, 내려받은 파일은 남아요)</p>
          ) : (
            <>
              <div ref={stage} style={{ position: "relative", width: "100%", maxWidth: 560, margin: "0 auto", aspectRatio: `${SW} / ${SH}`, userSelect: "none", touchAction: "none" }} onPointerDown={() => { setSel(null); setEditing(null); }}>
                <canvas ref={canvas} aria-label={`${cur + 1}장 미리보기`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 6, boxShadow: "var(--shadow)" }} />
                {!playing && scene.els.map((e) => !e.hidden && (
                  <div key={e.id} onPointerDown={(ev) => startDrag(ev, e, "move")} onDoubleClick={() => { if (e.type === "text" && !e.locked) { setEditing(e.id); setSel(e.id); } }}
                    title={`${e.name || TYPE_KO[e.type]}${e.locked ? " (잠김)" : ""}`}
                    style={{ position: "absolute", left: e.x * k, top: e.y * k, width: e.w * k, height: e.h * k, transform: `rotate(${e.rot}deg)`, cursor: e.locked ? "default" : "move", outline: sels.includes(e.id) ? "2px solid var(--accent)" : "1px dashed transparent", outlineOffset: 1 }}
                    onMouseEnter={(ev) => { if (!sels.includes(e.id)) (ev.currentTarget as HTMLDivElement).style.outline = "1px dashed var(--accent)"; }}
                    onMouseLeave={(ev) => { if (!sels.includes(e.id)) (ev.currentTarget as HTMLDivElement).style.outline = "1px dashed transparent"; }}>
                    {sel === e.id && !multi && !e.locked && <div onPointerDown={(ev) => startDrag(ev, e, "resize")} aria-label="크기 조절" style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "var(--panel)", border: "2px solid var(--accent)", borderRadius: 3, cursor: "nwse-resize" }} />}
                    {editing === e.id && e.type === "text" && (
                      <textarea autoFocus value={e.text ?? ""} onFocus={() => { past.current.push(scenes); future.current = []; }} onPointerDown={(ev) => ev.stopPropagation()} onChange={(ev) => { const text = ev.target.value; patchEl(e.id, { text, h: Math.max(e.h, fitTextHeight({ ...e, text })) }, false); }} onBlur={() => setEditing(null)}
                        onKeyDown={(ev) => { if (ev.key === "Escape") (ev.target as HTMLTextAreaElement).blur(); }}
                        style={{ position: "absolute", inset: 0, width: "100%", minHeight: "100%", font: `${e.weight} ${(e.size ?? 60) * k}px "Noto Sans KR", sans-serif`, lineHeight: e.lineHeight, color: "#16181d", background: "rgba(255,255,255,0.92)", border: "2px solid var(--accent)", borderRadius: 4, padding: 0, resize: "none", textAlign: e.align }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "nowrap" }}>
                <button className="btn btn-sm" onClick={() => (playing ? setPlaying(false) : play())}>{playing ? "■ 멈춤" : "▶ 재생"}</button>
                <input type="range" min={0} max={scene.dur} step={0.05} value={time ?? scene.dur} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} style={{ flex: 1, accentColor: "var(--accent)" }} aria-label="재생 위치" />
                <span className="tiny muted" style={{ width: 84, textAlign: "right" }}>{(time ?? scene.dur).toFixed(1)}초 / {scene.dur}초</span>
                <button className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setTime(null); }}>완성 모습</button>
              </div>
            </>
          )}
        </div>

        {/* 오른쪽: 수정 칸 */}
        <div className="card" style={{ padding: 10, maxHeight: "calc(100vh - 140px)", overflowY: "auto", position: "sticky", top: 8 }}>
          {!hideTop && (
            <div className="stack" style={{ gap: 6, paddingBottom: 8 }}>
              <select className="input" value={sel ?? ""} onChange={(e) => { setSel(e.target.value || null); if (e.target.value) setTab("pos"); }} aria-label="요소 고르기">
                <option value="">요소 고르기 ({scene.els.length}개)</option>
                {scene.els.map((e, i) => <option key={e.id} value={e.id}>{i + 1}. {TYPE_KO[e.type]} · {e.name || (e.type === "text" ? (e.text ?? "").replace(/==/g, "").slice(0, 16) : "")}{e.hidden ? " (숨김)" : ""}{e.locked ? " 🔒" : ""}</option>)}
              </select>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {(["text", "image", "rect", "circle", "line", "sparkle"] as ElType[]).map((t) => <button key={t} className="btn btn-sm" onClick={() => addEl(t)}>+ {TYPE_KO[t]}</button>)}
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>미리보기에서 요소를 누르거나 위 목록에서 고르면, 위치·크기·문구·모션을 바로 고칠 수 있어요.</p>
            </div>
          )}
          <button className="btn btn-sm btn-ghost" style={{ width: "100%", background: "var(--accent-soft)" }} onClick={() => setHideTop(!hideTop)}>{hideTop ? "▼ 위 메뉴 보이기" : "▲ 위 메뉴 숨기기"}</button>
          <div className="row" style={{ gap: 0, borderBottom: "1px solid var(--line)", margin: "6px 0 10px" }} role="tablist">
            {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="btn btn-sm btn-ghost" style={{ flex: 1, borderRadius: 0, padding: "6px 2px", fontSize: 12, color: tab === id ? "var(--accent)" : undefined, borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent", fontWeight: tab === id ? 700 : 500 }}>{label}</button>)}
          </div>

          {tab === "note" && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small">이 장 수정 메모 (나만 보는 메모, 영상엔 안 나와요)</span>
              <textarea className="textarea" style={{ minHeight: 160 }} value={scene.note ?? ""} onChange={(e) => patchScene((s) => ({ ...s, note: e.target.value }), false)} placeholder="예) 표지 글씨 더 크게, 3장 사진 바꾸기" />
              <Slider label="이 장 길이" value={scene.dur} min={1} max={15} step={0.5} unit="초" onChange={(v) => patchScene((s) => ({ ...s, dur: v }))} />
            </div>
          )}

          {tab === "bg" && (
            <div className="stack" style={{ gap: 8 }}>
              <Color label="배경색" value={scene.bg.color} onChange={(v) => patchScene((s) => ({ ...s, bg: { ...s.bg, color: v } }))} />
              <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!scene.bg.color2} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, color2: e.target.checked ? "#eaeeff" : undefined } }))} /> 그라데이션</label>
              {scene.bg.color2 && <Color label="아래 색" value={scene.bg.color2} onChange={(v) => patchScene((s) => ({ ...s, bg: { ...s.bg, color2: v } }))} />}
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={scene.bg.pattern === "grid"} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, pattern: e.target.checked ? "grid" : "none" } }))} /> 격자</label>
                <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={scene.bg.pattern === "dots"} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, pattern: e.target.checked ? "dots" : "none" } }))} /> 점</label>
                <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={scene.bg.pattern === "stripes"} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, pattern: e.target.checked ? "stripes" : "none" } }))} /> 줄무늬</label>
                <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={!!scene.bg.glow} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, glow: e.target.checked } }))} /> 모서리 빛</label>
              </div>
              {scene.bg.image != null && <>
                <Slider label="사진 흐리게" value={scene.bg.blur ?? 0} min={0} max={20} onChange={(v) => patchScene((s) => ({ ...s, bg: { ...s.bg, blur: v } }), false)} unit="px" />
                <Slider label="사진 어둡게" value={scene.bg.dim ?? 0} min={0} max={0.85} step={0.05} onChange={(v) => patchScene((s) => ({ ...s, bg: { ...s.bg, dim: v } }), false)} />
                <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!scene.bg.kenburns} onChange={(e) => patchScene((s) => ({ ...s, bg: { ...s.bg, kenburns: e.target.checked } }))} /> 배경 사진 천천히 확대</label>
              </>}
              <div className="row between"><b className="small">이 캐러셀 사진 {c.images.length}</b><span className="row" style={{ gap: 4 }}><button className="btn btn-sm" disabled={scene.bg.image == null} onClick={() => patchScene((s) => ({ ...s, bg: { ...s.bg, image: null } }))}>사진 없음</button><button className="btn btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "upload" ? <span className="spinner" /> : "📷 올리기"}</button></span></div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void upload(Array.from(e.target.files))} />
              <p className="tiny muted" style={{ margin: 0 }}>사진을 누르면 이 장 배경이 바뀌어요. 사진 요소를 고른 상태면 그 사진이 바뀌어요.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {c.images.map((im, n) => (
                  <div key={im.url} style={{ position: "relative" }}>
                    {imgs.length === c.images.length && imgs[n] === null
                      ? <div className="tiny" style={{ aspectRatio: "4/5", borderRadius: 6, border: "1px dashed var(--bad)", color: "var(--bad)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 2 }}>⚠️ 블로그에서 지워진 사진</div>
                      : <button type="button" onClick={() => { if (el?.type === "image") patchEl(el.id, { image: n }); else patchScene((s) => ({ ...s, bg: { ...s.bg, image: n, dim: s.bg.dim ?? 0.35 } })); }} style={{ padding: 0, border: (el?.type === "image" ? el.image === n : scene.bg.image === n) ? "2px solid var(--accent)" : "1px solid var(--line)", borderRadius: 6, overflow: "hidden", cursor: "pointer", width: "100%", aspectRatio: "4/5", background: "var(--panel-2)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/carousels/${c.id}/img/${n}?k=${imgKey(im.url)}`} alt={im.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>}
                    <span className="tiny" style={{ position: "absolute", left: 3, top: 2, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 4, padding: "0 4px" }}>{n + 1}</span>
                    <button type="button" aria-label={`사진 ${n + 1} 지우기`} disabled={!!busy} onClick={() => void removePhoto(n)} style={{ position: "absolute", right: 2, top: 2, width: 18, height: 18, border: 0, borderRadius: 9, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 11, lineHeight: "18px", cursor: "pointer", padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              {!!c.style?.removedImages?.length && (
                <details><summary className="small">🗑 지운 사진 ({c.style.removedImages.length}) · 30일 안에 되살리기</summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
                    {c.style.removedImages.map((im, k2) => (
                      <div key={im.at + im.url} style={{ position: "relative", opacity: 0.8 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/carousels/${c.id}/img/r${k2}?k=${imgKey(im.url)}`} alt={im.alt} style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: 6, display: "block", background: "var(--panel-2)" }} />
                        <button className="btn btn-sm" style={{ position: "absolute", left: 2, right: 2, bottom: 2, fontSize: 11, padding: "0 2px" }} onClick={() => void restorePhoto(im.at, im.url)}>되살리기</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <details open={!c.images.length}>
                <summary className="small"><b>📥 블로그 글 사진 불러오기</b></summary>
                <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                  <BlogPostPicker id={c.id} recent={recent} value={importUrl} onChange={setImportUrl} />
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input className="input" style={{ flex: 1, minWidth: 0 }} value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="또는 블로그 글 주소 붙여넣기" aria-label="블로그 글 주소" />
                    <button className="btn btn-sm" disabled={!!busy || !importUrl.trim()} onClick={() => void importPhotos()}>{busy === "import" ? <span className="spinner" /> : "가져오기"}</button>
                  </div>
                </div>
              </details>
            </div>
          )}

          {(tab === "pos" || tab === "text") && !el && <p className="small muted">미리보기에서 요소를 누르거나 위 &apos;요소 고르기&apos;에서 골라 주세요.</p>}

          {multi && (tab === "pos" || tab === "text") && (
            <div className="stack" style={{ gap: 8, marginBottom: 10, padding: 8, background: "var(--accent-soft)", borderRadius: 10 }}>
              <b className="small">{sels.length}개 함께 고름 · 아래 값은 모두에 적용돼요</b>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                <button className="btn btn-sm" onClick={() => { const m = Math.min(...scene.els.filter((x) => sels.includes(x.id)).map((x) => x.x)); patchSel(() => ({ x: m })); }}>왼쪽 맞춤</button>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ x: Math.round((SW - x.w) / 2) }))}>가로 가운데</button>
                <button className="btn btn-sm" onClick={() => { const m = Math.max(...scene.els.filter((x) => sels.includes(x.id)).map((x) => x.x + x.w)); patchSel((x) => ({ x: m - x.w })); }}>오른쪽 맞춤</button>
                <button className="btn btn-sm" onClick={() => { const m = Math.min(...scene.els.filter((x) => sels.includes(x.id)).map((x) => x.y)); patchSel(() => ({ y: m })); }}>위 맞춤</button>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ y: x.y - 10 }))}>↑10</button>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ y: x.y + 10 }))}>↓10</button>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ x: x.x - 10 }))}>←10</button>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ x: x.x + 10 }))}>→10</button>
              </div>
              {scene.els.some((x) => sels.includes(x.id) && x.type === "text") && <>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  <span className="small" style={{ width: 64 }}>글씨 크기</span>
                  <button className="btn btn-sm" onClick={() => patchSel((x) => (x.type === "text" ? { size: Math.round((x.size ?? 60) * 0.9) } : {}))}>－10%</button>
                  <button className="btn btn-sm" onClick={() => patchSel((x) => (x.type === "text" ? { size: Math.round((x.size ?? 60) * 1.1) } : {}))}>＋10%</button>
                </div>
                <Color label="글씨 색" value={scene.els.find((x) => sels.includes(x.id) && x.type === "text")?.color ?? "#16181d"} onChange={(v) => patchSel((x) => (x.type === "text" ? { color: v } : {}))} />
                <div className="row" style={{ gap: 4 }}><span className="small" style={{ width: 64 }}>정렬</span>{(["left", "center", "right"] as const).map((a) => <button key={a} className="btn btn-sm" onClick={() => patchSel((x) => (x.type === "text" ? { align: a } : {}))}>{a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}</button>)}</div>
                <label className="small row" style={{ gap: 8 }}><span style={{ width: 64 }}>굵기</span>
                  <select className="input" style={{ width: "auto" }} defaultValue="" onChange={(e) => e.target.value && patchSel((x) => (x.type === "text" ? { weight: Number(e.target.value) } : {}))}>
                    <option value="">고르기</option>{[[400, "보통"], [500, "중간"], [700, "굵게"], [800, "아주 굵게"], [900, "가장 굵게"]].map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                  </select>
                </label>
              </>}
              <Slider label="투명도" value={scene.els.find((x) => sels.includes(x.id))?.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => patchSel(() => ({ opacity: v }), false)} />
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={() => patchSel((x) => ({ hidden: !x.hidden }))}>숨기기/보이기</button>
                <button className="btn btn-sm" style={{ color: "var(--bad)" }} onClick={() => { patchScene((s) => ({ ...s, els: s.els.filter((x) => !sels.includes(x.id)) })); setSels([]); }}>모두 삭제</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setSels([])}>고르기 풀기</button>
              </div>
            </div>
          )}
          {tab === "pos" && el && !multi && (
            <div className="stack" style={{ gap: 8 }}>
              <b className="small">{TYPE_KO[el.type]} · {el.name || ""}</b>
              <div className="row" style={{ gap: 6 }}>
                <Num label="가로" value={el.x} onChange={(v) => patchEl(el.id, { x: v })} />
                <Num label="세로" value={el.y} onChange={(v) => patchEl(el.id, { y: v })} />
                <Num label="회전" value={el.rot} onChange={(v) => patchEl(el.id, { rot: v })} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Num label="너비" value={el.w} onChange={(v) => patchEl(el.id, { w: Math.max(4, v) })} />
                <Num label="높이" value={el.h} onChange={(v) => patchEl(el.id, { h: Math.max(2, v) })} />
              </div>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                <span className="small" style={{ width: 64 }}>크기</span>
                {[-10, 10].map((d) => <button key={d} className="btn btn-sm" onClick={() => { const f = 1 + d / 100; patchEl(el.id, { x: Math.round(el.x - (el.w * (f - 1)) / 2), y: Math.round(el.y - (el.h * (f - 1)) / 2), w: Math.round(el.w * f), h: Math.round(el.h * f), ...(el.type === "text" ? { size: Math.round((el.size ?? 60) * f) } : {}) }); }}>{d > 0 ? "＋10%" : "－10%"}</button>)}
              </div>
              <Slider label="투명도" value={el.opacity} min={0} max={1} step={0.05} onChange={(v) => patchEl(el.id, { opacity: v }, false)} />
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                <span className="small" style={{ width: 64 }}>맞추기</span>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { x: 88 })}>왼쪽</button>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { x: Math.round((SW - el.w) / 2) })}>가로 가운데</button>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { x: SW - 88 - el.w })}>오른쪽</button>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { y: Math.round((SH - el.h) / 2) })}>세로 가운데</button>
              </div>
              {(el.type === "rect" || el.type === "circle" || el.type === "line" || el.type === "sparkle") && <>
                <Color label="채우기" value={el.fill ?? "#ffffff"} onChange={(v) => patchEl(el.id, { fill: v })} />
                {el.type !== "sparkle" && el.type !== "line" && <><Color label="테두리" value={el.stroke || "#3355ff"} onChange={(v) => patchEl(el.id, { stroke: v, strokeW: el.strokeW || 4 })} /><Slider label="테두리 두께" value={el.strokeW ?? 0} min={0} max={30} onChange={(v) => patchEl(el.id, { strokeW: v }, false)} /></>}
                {el.type === "rect" && <Slider label="모서리" value={el.radius ?? 0} min={0} max={300} onChange={(v) => patchEl(el.id, { radius: v }, false)} />}
              </>}
              {el.type === "image" && <>
                <Slider label="모서리" value={el.radius ?? 0} min={0} max={400} onChange={(v) => patchEl(el.id, { radius: v }, false)} />
                <div className="row" style={{ gap: 4 }}><span className="small" style={{ width: 64 }}>맞춤</span><button className={`btn btn-sm ${el.fit !== "contain" ? "btn-primary" : ""}`} onClick={() => patchEl(el.id, { fit: "cover" })}>꽉 채우기</button><button className={`btn btn-sm ${el.fit === "contain" ? "btn-primary" : ""}`} onClick={() => patchEl(el.id, { fit: "contain" })}>전체 보이기</button></div>
                <p className="tiny muted" style={{ margin: 0 }}>사진 바꾸기: &apos;배경·스타일&apos; 칸에서 사진을 누르세요.</p>
              </>}
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { hidden: !el.hidden })}>{el.hidden ? "보이기" : "숨기기"}</button>
                <button className="btn btn-sm" onClick={() => patchEl(el.id, { locked: !el.locked })}>{el.locked ? "🔓 잠금 풀기" : "🔒 잠그기"}</button>
                <button className="btn btn-sm" onClick={() => moveLayer(el.id, 1)}>앞으로</button>
                <button className="btn btn-sm" onClick={() => moveLayer(el.id, -1)}>뒤로</button>
                <button className="btn btn-sm" onClick={() => { const o = original.current[cur]?.els.find((x) => x.id === el.id); if (o) patchEl(el.id, o); else setMsg({ ok: false, text: "새로 넣은 요소라 원래 모습이 없어요." }); }}>이 요소 원래대로</button>
                <button className="btn btn-sm" style={{ color: "var(--bad)" }} onClick={() => removeEl(el.id)}>삭제</button>
              </div>
              <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
              <b className="small">이 장 요소 한눈에</b>
              {scene.els.map((e) => (
                <div key={e.id} className="row" style={{ gap: 4, flexWrap: "nowrap", background: e.id === sel ? "var(--accent-soft)" : undefined, borderRadius: 6, padding: "2px 4px" }}>
                  <button className="btn btn-sm btn-ghost" style={{ width: 86, justifyContent: "flex-start", overflow: "hidden", whiteSpace: "nowrap" }} onClick={() => setSel(e.id)}>{e.name || TYPE_KO[e.type]}</button>
                  <input className="input" type="number" value={Math.round(e.x)} onChange={(ev) => patchEl(e.id, { x: Number(ev.target.value) })} aria-label="가로" style={{ width: 58, padding: "2px 4px" }} />
                  <input className="input" type="number" value={Math.round(e.y)} onChange={(ev) => patchEl(e.id, { y: Number(ev.target.value) })} aria-label="세로" style={{ width: 58, padding: "2px 4px" }} />
                  <button className="btn btn-sm" style={{ padding: "0 4px" }} onClick={() => patchEl(e.id, { y: e.y - 10 })}>↑10</button>
                  <button className="btn btn-sm" style={{ padding: "0 4px" }} onClick={() => patchEl(e.id, { y: e.y + 10 })}>↓10</button>
                  <button className="btn btn-sm" style={{ padding: "0 4px" }} onClick={() => patchEl(e.id, { y: e.y + 50 })}>↓50</button>
                </div>
              ))}
            </div>
          )}

          {tab === "text" && el && !multi && (el.type !== "text" ? <p className="small muted">글자 요소를 골라 주세요.</p> : (
            <div className="stack" style={{ gap: 8 }}>
              <label className="small stack" style={{ gap: 4 }}>문구 (<code>==글자==</code> 는 형광펜)
                <textarea className="textarea" style={{ minHeight: 90 }} value={el.text ?? ""} onChange={(e) => patchEl(el.id, { text: e.target.value, h: Math.max(el.h, fitTextHeight({ ...el, text: e.target.value })) }, false)} onBlur={() => { past.current.push(scenes); }} />
              </label>
              <Slider label="글씨 크기" value={el.size ?? 60} min={12} max={220} onChange={(v) => patchEl(el.id, { size: v, h: Math.max(el.h, fitTextHeight({ ...el, size: v })) }, false)} unit="px" />
              <label className="small row" style={{ gap: 8 }}><span style={{ width: 64 }}>굵기</span>
                <select className="input" style={{ width: "auto" }} value={el.weight ?? 700} onChange={(e) => patchEl(el.id, { weight: Number(e.target.value) })}>
                  {[[400, "보통"], [500, "중간"], [700, "굵게"], [800, "아주 굵게"], [900, "가장 굵게"]].map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                </select>
              </label>
              <div className="row" style={{ gap: 4 }}><span className="small" style={{ width: 64 }}>정렬</span>{(["left", "center", "right"] as const).map((a) => <button key={a} className={`btn btn-sm ${el.align === a ? "btn-primary" : ""}`} onClick={() => patchEl(el.id, { align: a })}>{a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}</button>)}</div>
              <Color label="글씨 색" value={el.color ?? "#16181d"} onChange={(v) => patchEl(el.id, { color: v })} />
              <Color label="강조 색" value={el.mark ?? accent} onChange={(v) => patchEl(el.id, { mark: v })} />
              <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!el.textBg} onChange={(e) => patchEl(el.id, { textBg: e.target.checked ? "#ffffff" : "" })} /> 글자 바탕</label>
              {el.textBg && <Color label="바탕 색" value={el.textBg} onChange={(v) => patchEl(el.id, { textBg: v })} />}
              <Slider label="줄 간격" value={el.lineHeight ?? 1.25} min={0.8} max={2.4} step={0.05} onChange={(v) => patchEl(el.id, { lineHeight: v }, false)} />
              <Slider label="문자 간격" value={el.letter ?? 0} min={-10} max={30} onChange={(v) => patchEl(el.id, { letter: v }, false)} unit="px" />
              <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!el.shadow} onChange={(e) => patchEl(el.id, { shadow: e.target.checked })} /> 그림자</label>
              <button className="btn btn-sm" onClick={() => patchEl(el.id, { h: fitTextHeight(el) })}>상자 높이를 글자에 맞추기</button>
            </div>
          ))}

          {tab === "motion" && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="tiny muted" style={{ margin: 0 }}>{el ? `${multi ? `${sels.length}개` : `${TYPE_KO[el.type]} · ${el.name || ""}`}에 걸 모션을 누르세요. 누르면 바로 재생돼요.` : "먼저 미리보기에서 요소를 누르고(여러 개는 Ctrl·⌘+누르기), 아래 모션 카드를 누르면 걸려요."}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {motionsFor.map((m) => (
                  <button key={m.id} type="button" onClick={() => { if (!el) { setMsg({ ok: false, text: "모션을 걸 요소를 먼저 미리보기에서 눌러 주세요." }); return; } if (multi) patchSel((x) => (m.for === "all" || m.for.includes(x.type) ? { motion: { ...x.motion, id: m.id, dur: x.motion.dur || 0.6 } } : {})); else setMotion({ id: m.id, dur: el.motion.dur || 0.6 }); setTime(0); setPlaying(true); }} className="stack" style={{ gap: 2, padding: 8, textAlign: "left", borderRadius: 10, cursor: "pointer", border: el?.motion.id === m.id ? "2px solid var(--accent)" : "1px solid var(--line)", background: el?.motion.id === m.id ? "var(--accent-soft)" : "var(--panel)" }}>
                    <b className="small">{m.label}</b>
                    <span className="tiny muted">{m.en}</span>
                    <span className="tiny">{m.desc}</span>
                  </button>
                ))}
              </div>
              {el && <><Slider label="시작" value={el.motion.delay} min={0} max={Math.max(1, scene.dur)} step={0.1} onChange={(v) => setMotion({ delay: v })} unit="초" />
              <Slider label="걸리는 시간" value={el.motion.dur} min={0.1} max={Math.max(1, scene.dur)} step={0.1} onChange={(v) => setMotion({ dur: v })} unit="초" /></>}
            </div>
          )}
        </div>
      </div>

      {/* 아래: 캡션·해시태그 */}
      <details className="card card-pad">
        <summary><b className="small">캡션 · 해시태그</b></summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <textarea className="textarea" style={{ minHeight: 140 }} value={caption} onChange={(e) => { setCaption(e.target.value); setSaveState("dirty"); }} aria-label="캡션" />
          <HashtagInput value={tags} onChange={(v) => { setTags(v); setSaveState("dirty"); }} placeholder="#해시태그 입력 후 스페이스 (3~5개)" />
          <CarouselTextAI id={c.id} kind="caption" slides={c.slides} caption={caption} hashtags={hashtagTokens(tags)} disabled={!!busy} onBusy={(b) => setBusy(b ? "text" : "")} onApply={(d) => { setCaption(d.caption ?? caption); setTags((d.hashtags ?? []).map((t) => "#" + t).join(" ")); setSaveState("dirty"); }} />
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={async () => { await navigator.clipboard.writeText(`${caption.trim()}\n\n${formatHashtags(tags, false)}`.trim()); setMsg({ ok: true, text: "캡션+해시태그를 복사했어요." }); }}>📋 캡션 복사</button>
        </div>
      </details>
      <style>{`@media (max-width: 1100px) { .studio-grid { grid-template-columns: 1fr !important; } .studio-grid > .card { position: static !important; max-height: none !important; } }`}</style>
    </div>
  );
}
