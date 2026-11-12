"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import { ColorField, FontPicker } from "@/components/FontPicker";
import { isTyping, undoKey } from "@/components/shortcuts";
import { applyTemplate, defaultTemplate, emptyDoc, THUMB_RATIOS, THUMB_W, thumbH, type ThumbDoc, type ThumbEl, type ThumbItem, type ThumbRatio, type ThumbShape, type ThumbState, type ThumbSticker, type ThumbTemplate } from "@/lib/thumb-types";
import { drawThumb, ensureFonts, getImg, injectFonts, thumbPng, type Box } from "./render";

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
const dead = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !!x.deletedAt);

/** 파일 → dataURL (사진은 긴 변 2400px JPG로 줄여서, 스티커는 투명 그대로 PNG) */
async function fileToDataUrl(f: File, kind: "photo" | "sticker") {
  const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  if (f.type === "image/gif") return raw;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
  const max = kind === "photo" ? 2400 : 1200;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && kind === "sticker" && f.type === "image/png") return raw;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return kind === "photo" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
}
const imageFiles = (list: FileList | File[] | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(name || "썸네일").replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|]/g, "_")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function ThumbFactory() {
  const [st, setSt] = useState<ThumbState | null>(null);
  const [curId, setCurId] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tplId, setTplId] = useState("tpl_default");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [save, setSave] = useState<"saved" | "dirty" | "saving">("saved");
  const [dragOver, setDragOver] = useState<"" | "photo" | "sticker">("");
  const [guide, setGuide] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [, force] = useState(0);
  const hist = useRef<{ past: ThumbDoc[]; future: ThumbDoc[] }>({ past: [], future: [] });

  useEffect(() => { injectFonts(); api<ThumbState>("/api/thumbs").then((s) => { setSt(s); setCurId(live(s.items)[0]?.id ?? null); setTplId(live(s.templates)[0]?.id ?? "tpl_default"); }).catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, []);

  const items = useMemo(() => live(st?.items ?? []), [st]);
  const stickers = useMemo(() => live(st?.stickers ?? []), [st]);
  const templates = useMemo(() => { const t = live(st?.templates ?? []); return t.length ? t : [defaultTemplate()]; }, [st]);
  const cur = items.find((x) => x.id === curId) ?? null;
  const doc = cur?.doc ?? null;
  const selEl = doc?.els.find((e) => e.id === sel) ?? null;
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];

  // ── 저장 (꾸민 내용은 0.8초 모아서) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((part: Partial<ThumbState>, delay = 0) => {
    setSave("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const run = async () => { setSave("saving"); try { await api("/api/thumbs", "PUT", part); setSave("saved"); } catch (e) { setSave("dirty"); setMsg({ ok: false, text: `저장 실패: ${(e as Error).message}` }); } };
    if (delay) saveTimer.current = setTimeout(run, delay); else void run();
  }, []);
  const setItems = (fn: (xs: ThumbItem[]) => ThumbItem[], delay = 800) => setSt((s) => { if (!s) return s; const next = { ...s, items: fn(s.items) }; persist({ items: next.items }, delay); return next; });
  const setStickers = (fn: (xs: ThumbSticker[]) => ThumbSticker[]) => setSt((s) => { if (!s) return s; const next = { ...s, stickers: fn(s.stickers) }; persist({ stickers: next.stickers }); return next; });
  const setTemplates = (fn: (xs: ThumbTemplate[]) => ThumbTemplate[]) => setSt((s) => { if (!s) return s; const base = live(s.templates).length ? s.templates : [defaultTemplate(), ...s.templates]; const next = { ...s, templates: fn(base) }; persist({ templates: next.templates }); return next; });

  /** 지금 사진의 꾸민 내용 바꾸기 (되돌리기 기록 포함) */
  const setDoc = (fn: (d: ThumbDoc) => ThumbDoc, record = true) => {
    if (!cur) return;
    if (record) { hist.current.past = [...hist.current.past.slice(-80), cur.doc]; hist.current.future = []; }
    setItems((xs) => xs.map((x) => (x.id === cur.id ? { ...x, doc: fn(x.doc) } : x)));
  };
  const patchEl = (id: string, p: Partial<ThumbEl>, record = true) => setDoc((d) => ({ ...d, els: d.els.map((e) => (e.id === id ? { ...e, ...p } : e)) }), record);
  const undo = () => { const p = hist.current.past.pop(); if (!p || !cur) return; hist.current.future.push(cur.doc); setItems((xs) => xs.map((x) => (x.id === cur.id ? { ...x, doc: p } : x))); };
  const redo = () => { const f = hist.current.future.pop(); if (!f || !cur) return; hist.current.past.push(cur.doc); setItems((xs) => xs.map((x) => (x.id === cur.id ? { ...x, doc: f } : x))); };
  useEffect(() => { hist.current = { past: [], future: [] }; setSel(null); }, [curId]);

  // ── 올리기 ──
  async function addPhotos(files: File[]) {
    if (!files.length) return;
    setBusy("photo"); setMsg(null);
    const made: ThumbItem[] = [];
    try {
      for (const f of files) {
        const { url } = await api<{ url: string }>("/api/thumbs/upload", "POST", { dataUrl: await fileToDataUrl(f, "photo"), kind: "photo" });
        made.push({ id: uid("th_"), name: (f.name || "붙여넣은 사진").replace(/\.[a-z0-9]+$/i, ""), photo: url, doc: applyTemplate(emptyDoc(tpl.ratio), tpl), templateId: tpl.id, updatedAt: new Date().toISOString() });
      }
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    if (made.length) { setItems((xs) => [...made, ...xs], 0); setCurId(made[0].id); setMsg({ ok: true, text: `사진 ${made.length}장을 올리고 '${tpl.name}' 템플릿을 입혔어요.` }); }
    setBusy("");
  }
  async function addStickers(files: File[]) {
    if (!files.length) return;
    setBusy("sticker"); setMsg(null);
    const made: ThumbSticker[] = [];
    try {
      for (const f of files) {
        const { url } = await api<{ url: string }>("/api/thumbs/upload", "POST", { dataUrl: await fileToDataUrl(f, "sticker"), kind: "sticker" });
        made.push({ id: uid("st_"), name: (f.name || "스티커").replace(/\.[a-z0-9]+$/i, ""), url });
      }
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    if (made.length) setStickers((xs) => [...made, ...xs]);
    setBusy("");
  }
  // 붙여넣기: 스티커 칸에 포커스가 있으면 스티커로, 아니면 사진으로
  const stickerBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent)) return;
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      if (stickerBox.current?.contains(document.activeElement)) void addStickers(files); else void addPhotos(files);
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  });

  // ── 보드 그리기 ──
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(560);
  useEffect(() => {
    const ro = new ResizeObserver(() => { const w = wrap.current?.clientWidth ?? 560; setStageW(Math.max(260, Math.min(640, w))); });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const H = doc ? thumbH(doc.ratio) : 1080;
  const k = stageW / THUMB_W;
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [tick, setTick] = useState(0);
  void force;
  useEffect(() => {
    if (!doc || !cur || !canvas.current) return;
    const c = canvas.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(stageW * dpr); c.height = Math.round(stageW * dpr * (H / THUMB_W));
    let off = false;
    const bump = () => { if (!off) setTick((n) => n + 1); };
    // 위치가 바뀔 때만 상자 갱신 (같으면 그대로 → 무한 다시 그리기 방지)
    const redraw = () => { if (off) return; const b = drawThumb(c, doc, getImg(cur.photo, bump), { placeholder: true, onImg: bump }); setBoxes((old) => (JSON.stringify(old) === JSON.stringify(b) ? old : b)); };
    redraw();
    void ensureFonts(doc).then(redraw);
    return () => { off = true; };
  }, [doc, cur, stageW, H, tick]);

  // ── 끌기: 옮기기 · 크기 · 회전 · 사진 위치 ──
  const drag = useRef<{ mode: "move" | "size" | "rot" | "photo"; id?: string; sx: number; sy: number; el?: ThumbEl; photo?: ThumbDoc["photo"]; box?: Box; moved: boolean } | null>(null);
  const toStage = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
  function down(e: React.PointerEvent, mode: "move" | "size" | "rot" | "photo", id?: string) {
    if (!doc) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toStage(e);
    const el = id ? doc.els.find((x) => x.id === id) : undefined;
    if (id) setSel(id); else setSel(null);
    hist.current.past = [...hist.current.past.slice(-80), doc]; hist.current.future = [];
    drag.current = { mode, id, sx: p.x, sy: p.y, el, photo: doc.photo, box: boxes.find((b) => b.id === id), moved: false };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !doc) return;
    const p = toStage(e);
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
    if (d.mode === "photo" && d.photo) {
      const z = d.photo.zoom || 1;
      setDoc((x) => ({ ...x, photo: { ...x.photo, x: Math.min(1, Math.max(0, d.photo!.x - dx / (THUMB_W * Math.max(0.2, z - 0.8)))), y: Math.min(1, Math.max(0, d.photo!.y - dy / (H * Math.max(0.2, z - 0.8)))) } }), false);
      return;
    }
    if (!d.el || !d.id) return;
    if (d.mode === "move") {
      let nx = d.el.x + dx / THUMB_W, ny = d.el.y + dy / H;
      const sv = Math.abs(nx - 0.5) < 0.012, sh = Math.abs(ny - 0.5) < 0.012;
      if (sv) nx = 0.5; if (sh) ny = 0.5;
      setGuide({ v: sv, h: sh });
      patchEl(d.id, { x: nx, y: ny }, false);
    } else if (d.mode === "size" && d.box) {
      // 가운데에서 끌어간 거리 비율로 크기 조절
      const r0 = Math.hypot(d.sx - d.box.cx, d.sy - d.box.cy), r1 = Math.hypot(p.x - d.box.cx, p.y - d.box.cy);
      const f = Math.max(0.1, r1 / Math.max(1, r0));
      if (d.el.kind === "text") patchEl(d.id, { size: Math.round(Math.min(600, Math.max(8, (d.el.size ?? 80) * f))) }, false);
      else patchEl(d.id, { w: Math.min(3, Math.max(0.02, d.el.w * f)) }, false);
    } else if (d.mode === "rot" && d.box) {
      const a = (Math.atan2(p.y - d.box.cy, p.x - d.box.cx) * 180) / Math.PI + 90;
      let r = Math.round(a);
      if (Math.abs(r % 90) < 4) r = Math.round(r / 90) * 90;
      patchEl(d.id, { rot: ((r + 540) % 360) - 180 }, false);
    }
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    setGuide({ v: false, h: false });
    if (d && !d.moved) hist.current.past.pop();
  }

  // ── 단축키 ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const u = undoKey(e);
      if (u) { e.preventDefault(); return u === "redo" ? redo() : undo(); }
      if (!sel || !doc) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(sel); }
      const st = e.shiftKey ? 0.02 : 0.004;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
      if (mv[e.key]) { e.preventDefault(); const el = doc.els.find((x) => x.id === sel); if (el) patchEl(sel, { x: el.x + mv[e.key][0], y: el.y + mv[e.key][1] }); }
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── 요소 더하기·지우기·순서 ──
  const nextSlot = (base: string) => { const used = new Set(doc?.els.map((e) => e.slot)); let i = 1; while (used.has(`${base} ${i}`)) i++; return `${base} ${i}`; };
  function addEl(p: Partial<ThumbEl> & { kind: ThumbEl["kind"] }) {
    const el: ThumbEl = { id: uid("e"), x: 0.5, y: 0.5, w: 0.2, rot: 0, ...p };
    setDoc((d) => ({ ...d, els: [...d.els, el] }));
    setSel(el.id);
  }
  const addText = () => addEl({ kind: "text", slot: nextSlot("글자"), text: "글자를 입력하세요", font: "jua", size: 80, color: "#5b4231", stroke: "#ffffff", strokeW: 10, align: "center", lineHeight: 1.1, letter: -1 });
  const addShape = (shape: ThumbShape, fill: string) => addEl({ kind: "shape", slot: nextSlot(shape === "heart" ? "하트" : shape === "star" ? "별" : shape === "circle" ? "동그라미" : "반짝이"), shape, fill, w: 0.07, x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.5 + (Math.random() - 0.5) * 0.3 });
  function pickSticker(s: ThumbSticker) {
    if (selEl?.kind === "sticker") { patchEl(selEl.id, { src: s.url }); return; }
    // 비어 있는 캐릭터 자리가 있으면 거기에 먼저
    const empty = doc?.els.find((e) => e.kind === "sticker" && !e.src);
    if (empty) { patchEl(empty.id, { src: s.url }); setSel(empty.id); return; }
    addEl({ kind: "sticker", slot: nextSlot("스티커"), src: s.url, w: 0.26, x: 0.78, y: 0.8 });
  }
  function removeEl(id: string) { setDoc((d) => ({ ...d, els: d.els.filter((e) => e.id !== id) })); setSel(null); }
  function order(id: string, dir: 1 | -1) { setDoc((d) => { const i = d.els.findIndex((e) => e.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= d.els.length) return d; const els = [...d.els]; [els[i], els[j]] = [els[j], els[i]]; return { ...d, els }; }); }
  function duplicate(id: string) { const e = doc?.els.find((x) => x.id === id); if (!e) return; addEl({ ...e, id: uid("e"), slot: e.slot ? nextSlot(e.slot.replace(/\s*\d+$/, "")) : undefined, x: e.x + 0.03, y: e.y + 0.03 }); }

  // ── 템플릿 ──
  function applyTo(ids: string[]) {
    setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, doc: applyTemplate(x.doc, tpl), templateId: tpl.id } : x)));
    setMsg({ ok: true, text: `'${tpl.name}' 템플릿을 ${ids.length}장에 입혔어요. 글자 내용·고른 캐릭터는 그대로예요. 마음에 안 들면 Ctrl+Z.` });
  }
  function saveAsTemplate(overwrite: boolean) {
    if (!doc) return;
    if (overwrite && tpl) {
      if (!confirm(`'${tpl.name}' 템플릿을 지금 모양으로 바꿀까요? (위치·글꼴·크기·색·캐릭터 크기)`)) return;
      setTemplates((ts) => ts.map((t) => (t.id === tpl.id ? { ...t, ratio: doc.ratio, els: doc.els.map((e) => ({ ...e })) } : t)));
      setMsg({ ok: true, text: `'${tpl.name}' 템플릿을 저장했어요. '모든 사진에 적용'을 누르면 다른 사진도 같은 모양이 돼요.` });
      return;
    }
    const name = prompt("새 템플릿 이름", `템플릿 ${templates.length + 1}`);
    if (!name) return;
    const t: ThumbTemplate = { id: uid("tpl_"), name: name.slice(0, 60), ratio: doc.ratio, els: doc.els.map((e) => ({ ...e })) };
    setTemplates((ts) => [...ts, t]);
    setTplId(t.id);
    setMsg({ ok: true, text: `'${t.name}' 템플릿을 만들었어요.` });
  }

  // ── 저장(PNG) ──
  async function exportOne(it: ThumbItem) { download(await thumbPng(it.doc, it.photo), it.name); }
  async function exportAll() {
    setBusy("export");
    try { for (const it of items) { await exportOne(it); await new Promise((r) => setTimeout(r, 400)); } setMsg({ ok: true, text: `${items.length}장을 PNG로 저장했어요. 브라우저가 '여러 파일 받기'를 물으면 허용해 주세요.` }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy("");
  }

  if (!st) return <section className="card card-pad"><span className="tiny muted">{msg?.text ?? <><span className="spinner" /> 불러오는 중…</>}</span></section>;

  const boxOf = (id: string) => boxes.find((b) => b.id === id);
  const hiddenItems = dead(st.items), hiddenStickers = dead(st.stickers), hiddenTpls = dead(st.templates);
  return (
    <div className="thumb-factory" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 14, alignItems: "start" }}>
      {/* ── 왼쪽: 올린 사진 ── */}
      <section
        className={`card card-pad stack${dragOver === "photo" ? " drop-on" : ""}`}
        style={{ gap: 8, outline: dragOver === "photo" ? "3px dashed var(--accent)" : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragOver("photo"); }} onDragLeave={() => setDragOver("")}
        onDrop={(e) => { e.preventDefault(); setDragOver(""); void addPhotos(imageFiles(e.dataTransfer.files)); }}
      >
        <b>📷 사진 {items.length}장</b>
        <label className="card" style={{ padding: 12, textAlign: "center", cursor: "pointer", borderStyle: "dashed" }}>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(imageFiles(e.target.files)); e.target.value = ""; }} />
          <div className="small">{busy === "photo" ? <><span className="spinner" /> 올리는 중…</> : <>＋ 사진 올리기</>}</div>
          <div className="tiny muted">끌어다 놓기 · Ctrl+V 붙여넣기 · 눌러서 고르기 (여러 장 한 번에)</div>
        </label>
        <div className="stack" style={{ gap: 4, maxHeight: 640, overflowY: "auto" }}>
          {items.map((it) => (
            <div key={it.id} className="row" style={{ gap: 6, flexWrap: "nowrap", padding: 4, borderRadius: 8, background: it.id === curId ? "var(--accent-soft)" : undefined, cursor: "pointer" }} onClick={() => setCurId(it.id)}>
              <img src={it.photo} alt="" width={52} height={52} style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              <input className="input" style={{ flex: 1, minWidth: 0, padding: "3px 6px", fontSize: 13 }} value={it.name} onChange={(e) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} aria-label="사진 이름 (저장 파일 이름)" />
              <button className="btn btn-sm btn-ghost" title="휴지통으로 (30일 안에 되살리기)" onClick={(e) => { e.stopPropagation(); setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, deletedAt: new Date().toISOString() } : x)), 0); if (curId === it.id) setCurId(items.find((x) => x.id !== it.id)?.id ?? null); }}>🗑</button>
            </div>
          ))}
          {!items.length && <p className="tiny muted" style={{ margin: 0 }}>사진을 올리면 지금 고른 템플릿이 자동으로 입혀져요.</p>}
        </div>
        {hiddenItems.length > 0 && (
          <details><summary className="tiny muted">지운 사진 {hiddenItems.length}장 (30일 보관)</summary>
            {hiddenItems.map((it) => <div key={it.id} className="row tiny" style={{ gap: 6, marginTop: 4 }}><img src={it.photo} alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: 4 }} /><span className="ellipsis" style={{ flex: 1 }}>{it.name}</span><button className="btn btn-sm" onClick={() => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, deletedAt: null } : x)), 0)}>↺ 되살리기</button></div>)}
          </details>
        )}
        {items.length > 0 && <button className="btn btn-sm" disabled={busy === "export"} onClick={() => void exportAll()}>{busy === "export" ? "저장 중…" : `⬇ 전체 ${items.length}장 PNG 저장`}</button>}
      </section>

      {/* ── 오른쪽: 꾸미기 보드 ── */}
      <section className="card card-pad stack" style={{ gap: 10, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <b>🎨 꾸미기 보드</b>
          <span className="tiny muted">{save === "saved" ? "저장됨" : save === "saving" ? "저장 중…" : "고치는 중"}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" disabled={!doc} onClick={undo} title="Ctrl+Z">↶</button>
          <button className="btn btn-sm" disabled={!doc} onClick={redo} title="Ctrl+Shift+Z">↷</button>
          <button className="btn btn-sm btn-primary" disabled={!cur || !!busy} onClick={() => cur && void exportOne(cur)}>⬇ PNG 저장</button>
        </div>
        {/* 템플릿 줄 */}
        <div className="row" style={{ gap: 6, flexWrap: "wrap", padding: 8, borderRadius: 10, background: "var(--accent-soft)" }}>
          <span className="small"><b>템플릿</b></span>
          <select className="input" style={{ width: "auto" }} value={tpl?.id} onChange={(e) => setTplId(e.target.value)} aria-label="템플릿">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.ratio}</option>)}
          </select>
          <button className="btn btn-sm" disabled={!cur} onClick={() => cur && applyTo([cur.id])}>이 사진에 적용</button>
          <button className="btn btn-sm" disabled={!items.length} onClick={() => { if (confirm(`사진 ${items.length}장 모두에 '${tpl.name}' 템플릿을 입힐까요? (글자 내용·고른 캐릭터는 그대로)`)) applyTo(items.map((x) => x.id)); }}>모든 사진에 적용</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" disabled={!doc} onClick={() => saveAsTemplate(true)} title="위치·글꼴·크기·색·캐릭터 크기를 이 템플릿에 저장">💾 지금 모양으로 템플릿 저장</button>
          <button className="btn btn-sm btn-ghost" disabled={!doc} onClick={() => saveAsTemplate(false)}>＋ 새 템플릿</button>
          {templates.length > 1 && <button className="btn btn-sm btn-ghost" title="템플릿 휴지통으로" onClick={() => { if (confirm(`'${tpl.name}' 템플릿을 휴지통으로 옮길까요? (30일 안에 되살릴 수 있어요)`)) { setTemplates((ts) => ts.map((t) => (t.id === tpl.id ? { ...t, deletedAt: new Date().toISOString() } : t))); setTplId(templates.find((t) => t.id !== tpl.id)?.id ?? "tpl_default"); } }}>🗑</button>}
        </div>
        {hiddenTpls.length > 0 && <details><summary className="tiny muted">지운 템플릿 {hiddenTpls.length}개</summary>{hiddenTpls.map((t) => <div key={t.id} className="row tiny" style={{ gap: 6, marginTop: 4 }}><span style={{ flex: 1 }}>{t.name}</span><button className="btn btn-sm" onClick={() => setTemplates((ts) => ts.map((x) => (x.id === t.id ? { ...x, deletedAt: null } : x)))}>↺ 되살리기</button></div>)}</details>}
        {msg && <p className={`notice small ${msg.ok ? "" : "notice-bad"}`} style={{ margin: 0 }}>{msg.text}</p>}

        {!doc ? (
          <p className="small muted" style={{ margin: 0 }}>왼쪽에 사진을 올리면 여기서 꾸밀 수 있어요.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)", gap: 12, alignItems: "start" }} className="thumb-board">
            <div className="stack" style={{ gap: 8, minWidth: 0 }}>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                <button className="btn btn-sm" onClick={addText}>＋ 글자</button>
                <button className="btn btn-sm" onClick={() => addShape("sparkle", "#ffd84d")}>＋ ✦ 반짝이</button>
                <button className="btn btn-sm" onClick={() => addShape("heart", "#ff8fa8")}>＋ ♥ 하트</button>
                <button className="btn btn-sm" onClick={() => addShape("star", "#ffd84d")}>＋ ★ 별</button>
                <button className="btn btn-sm" onClick={() => addEl({ kind: "sticker", slot: nextSlot("캐릭터"), src: "", w: 0.26, x: 0.8, y: 0.82 })}>＋ 캐릭터 자리</button>
                <select className="input" style={{ width: "auto", marginLeft: "auto" }} value={doc.ratio} onChange={(e) => setDoc((d) => ({ ...d, ratio: e.target.value as ThumbRatio }))} aria-label="비율">
                  {THUMB_RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div ref={wrap} style={{ width: "100%" }}>
                <div style={{ position: "relative", width: stageW, height: stageW * (H / THUMB_W), touchAction: "none", userSelect: "none" }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                  <canvas ref={canvas} style={{ width: stageW, height: stageW * (H / THUMB_W), display: "block", borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,.12)", cursor: "grab" }} onPointerDown={(e) => down(e, "photo")} aria-label="썸네일 보드 (빈 곳을 끌면 사진 위치 이동)" />
                  {guide.v && <div style={{ position: "absolute", left: stageW / 2, top: 0, bottom: 0, width: 1, background: "#ff3d8b", pointerEvents: "none" }} />}
                  {guide.h && <div style={{ position: "absolute", top: (stageW * (H / THUMB_W)) / 2, left: 0, right: 0, height: 1, background: "#ff3d8b", pointerEvents: "none" }} />}
                  {doc.els.map((el) => {
                    const b = boxOf(el.id);
                    if (!b) return null;
                    const on = el.id === sel;
                    return (
                      <div key={el.id} onPointerDown={(e) => down(e, "move", el.id)} onDoubleClick={() => { setSel(el.id); setTimeout(() => (document.getElementById("thumb-text") as HTMLTextAreaElement | null)?.focus(), 30); }}
                        style={{ position: "absolute", left: (b.cx - b.w / 2) * k, top: (b.cy - b.h / 2) * k, width: b.w * k, height: b.h * k, transform: `rotate(${b.rot}deg)`, outline: on ? "2px solid #3b82f6" : undefined, cursor: "move", borderRadius: 4 }}
                        title={el.slot ?? ""}>
                        {on && <>
                          <span onPointerDown={(e) => down(e, "size", el.id)} style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#fff", border: "2px solid #3b82f6", borderRadius: 3, cursor: "nwse-resize" }} title="끌어서 크기" />
                          <span onPointerDown={(e) => down(e, "rot", el.id)} style={{ position: "absolute", left: "50%", top: -26, marginLeft: -7, width: 14, height: 14, background: "#3b82f6", borderRadius: 999, cursor: "grab" }} title="끌어서 돌리기" />
                        </>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <label className="row tiny" style={{ gap: 6 }}>사진 확대<input type="range" min={1} max={4} step={0.01} value={doc.photo.zoom} onChange={(e) => setDoc((d) => ({ ...d, photo: { ...d.photo, zoom: Number(e.target.value) } }), false)} style={{ flex: 1 }} /><b>{doc.photo.zoom.toFixed(2)}×</b><button className="btn btn-sm btn-ghost" onClick={() => setDoc((d) => ({ ...d, photo: { zoom: 1, x: 0.5, y: 0.5 } }))}>원래대로</button></label>
              <span className="tiny muted">빈 곳을 끌면 사진 위치가 움직여요 · 요소는 끌어서 옮기고 ■ 모서리로 크기, ● 로 회전 · 가운데에 오면 분홍 선에 붙어요 · 방향키로 미세 이동(Shift=크게) · Delete 지우기 · Ctrl+Z 되돌리기</span>
            </div>

            {/* 속성 + 스티커 */}
            <div className="stack" style={{ gap: 10 }}>
              {selEl ? <ElPanel el={selEl} onPatch={(p, rec) => patchEl(selEl.id, p, rec)} onRemove={() => removeEl(selEl.id)} onOrder={(d) => order(selEl.id, d)} onDup={() => duplicate(selEl.id)} /> : <p className="tiny muted" style={{ margin: 0 }}>보드에서 글자·스티커를 누르면 여기서 고칠 수 있어요. 글자는 두 번 누르면 바로 쓸 수 있어요.</p>}
              <div ref={stickerBox} tabIndex={0} className="card card-pad stack" style={{ gap: 6, outline: dragOver === "sticker" ? "3px dashed var(--accent)" : undefined }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver("sticker"); }} onDragLeave={() => setDragOver("")}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(""); void addStickers(imageFiles(e.dataTransfer.files)); }}>
                <div className="row" style={{ gap: 6 }}>
                  <b className="small">🐑 내 스티커 {stickers.length}</b>
                  <label className="btn btn-sm" style={{ marginLeft: "auto" }}>{busy === "sticker" ? <span className="spinner" /> : "＋ 올리기"}<input type="file" accept="image/*" multiple hidden onChange={(e) => { void addStickers(imageFiles(e.target.files)); e.target.value = ""; }} /></label>
                </div>
                <span className="tiny muted">여기를 한 번 누른 뒤 Ctrl+V 하면 스티커로 들어가요 · 끌어다 놓기 · 투명 배경 PNG 추천</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                  {stickers.map((s) => (
                    <div key={s.id} style={{ position: "relative" }}>
                      <button className="card" style={{ width: "100%", aspectRatio: "1", padding: 4, cursor: "pointer", background: "repeating-conic-gradient(#f2f2f2 0 25%, #fff 0 50%) 0 0/12px 12px" }} title={`${s.name} — ${selEl?.kind === "sticker" ? "고른 스티커를 이걸로 바꾸기" : "보드에 붙이기"}`} onClick={() => pickSticker(s)}>
                        <img src={s.url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ position: "absolute", top: -6, right: -6, padding: "0 4px", fontSize: 11 }} title="휴지통으로" onClick={() => setStickers((xs) => xs.map((x) => (x.id === s.id ? { ...x, deletedAt: new Date().toISOString() } : x)))}>✕</button>
                    </div>
                  ))}
                </div>
                {hiddenStickers.length > 0 && <details><summary className="tiny muted">지운 스티커 {hiddenStickers.length}개</summary><div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 4 }}>{hiddenStickers.map((s) => <button key={s.id} className="card" style={{ width: 48, height: 48, padding: 2 }} title="↺ 되살리기" onClick={() => setStickers((xs) => xs.map((x) => (x.id === s.id ? { ...x, deletedAt: null } : x)))}><img src={s.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.5 }} /></button>)}</div></details>}
              </div>
            </div>
          </div>
        )}
      </section>
      <style>{`@media (max-width: 900px) { .thumb-factory, .thumb-board { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/** 고른 요소 고치기 */
function ElPanel({ el, onPatch, onRemove, onOrder, onDup }: { el: ThumbEl; onPatch: (p: Partial<ThumbEl>, record?: boolean) => void; onRemove: () => void; onOrder: (d: 1 | -1) => void; onDup: () => void }) {
  const num = (label: string, v: number, min: number, max: number, step: number, key: keyof ThumbEl, unit = "") => (
    <label className="row tiny" style={{ gap: 6, flexWrap: "nowrap" }}>
      <span style={{ width: 56, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onPatch({ [key]: Number(e.target.value) } as Partial<ThumbEl>, false)} onPointerUp={() => onPatch({}, true)} style={{ flex: 1, minWidth: 0 }} />
      <input className="input" type="number" min={min} max={max} step={step} value={Math.round(v * 1000) / 1000} onChange={(e) => onPatch({ [key]: Number(e.target.value) } as Partial<ThumbEl>)} style={{ width: 62, padding: "2px 4px" }} aria-label={label} />{unit}
    </label>
  );
  return (
    <div className="card card-pad stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 4 }}>
        <b className="small">{el.kind === "text" ? "✏️ 글자" : el.kind === "sticker" ? "🐑 스티커" : "✦ 모양"}</b>
        <input className="input" style={{ flex: 1, minWidth: 0, padding: "2px 6px", fontSize: 12 }} value={el.slot ?? ""} onChange={(e) => onPatch({ slot: e.target.value })} placeholder="칸 이름" title="칸 이름: 템플릿을 입힐 때 같은 이름끼리 글 내용·캐릭터를 지켜요" aria-label="칸 이름" />
      </div>
      {el.kind === "text" && <>
        <textarea id="thumb-text" className="textarea" rows={2} value={el.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} aria-label="글자 내용" />
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>글꼴</span><FontPicker value={el.font ?? "noto"} onPick={(font) => onPatch({ font })} /></div>
        {num("크기", el.size ?? 80, 16, 300, 1, "size", "px")}
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>글자색</span><ColorField value={el.color ?? "#222222"} onChange={(color) => onPatch({ color })} label="글자색" /></div>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>테두리색</span><ColorField value={el.stroke || "#ffffff"} onChange={(stroke) => onPatch({ stroke })} label="테두리색" /></div>
        {num("테두리", el.strokeW ?? 0, 0, 40, 1, "strokeW", "px")}
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>배경 상자</span>
          <button className={`btn btn-sm ${el.bg ? "btn-primary" : ""}`} onClick={() => onPatch({ bg: el.bg ? undefined : "#ffffff" })}>{el.bg ? "켬" : "끔"}</button>
          {el.bg && <ColorField value={el.bg} onChange={(bg) => onPatch({ bg })} label="배경 상자 색" />}
        </div>
        <div className="row tiny" style={{ gap: 4, flexWrap: "wrap" }}>
          <button className={`btn btn-sm ${el.bold ? "btn-primary" : ""}`} onClick={() => onPatch({ bold: !el.bold })}>굵게</button>
          <button className={`btn btn-sm ${el.shadow ? "btn-primary" : ""}`} onClick={() => onPatch({ shadow: !el.shadow })}>그림자</button>
          <div className="seg">{(["left", "center", "right"] as const).map((a) => <button key={a} className={(el.align ?? "center") === a ? "on" : ""} onClick={() => onPatch({ align: a })}>{{ left: "왼쪽", center: "가운데", right: "오른쪽" }[a]}</button>)}</div>
        </div>
        {num("자간", el.letter ?? 0, -10, 30, 0.5, "letter", "px")}
        {num("줄 간격", el.lineHeight ?? 1.15, 0.7, 2.5, 0.05, "lineHeight")}
      </>}
      {el.kind === "sticker" && <>
        {!el.src && <p className="tiny muted" style={{ margin: 0 }}>아래 &apos;내 스티커&apos;에서 하나를 누르면 이 자리에 들어가요.</p>}
        {el.src && <span className="tiny muted">아래 스티커를 누르면 이걸로 바뀌어요.</span>}
        <button className={`btn btn-sm ${el.flip ? "btn-primary" : ""}`} style={{ alignSelf: "flex-start" }} onClick={() => onPatch({ flip: !el.flip })}>↔ 좌우 뒤집기</button>
      </>}
      {el.kind === "shape" && <>
        <div className="seg">{([["sparkle", "✦"], ["heart", "♥"], ["star", "★"], ["circle", "●"]] as const).map(([s, l]) => <button key={s} className={el.shape === s ? "on" : ""} onClick={() => onPatch({ shape: s })}>{l}</button>)}</div>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>색</span><ColorField value={el.fill ?? "#ffd84d"} onChange={(fill) => onPatch({ fill })} label="모양 색" /></div>
      </>}
      {el.kind !== "text" && (
        <label className="row tiny" style={{ gap: 6, flexWrap: "nowrap" }}>
          <span style={{ width: 56, flexShrink: 0 }}>크기</span>
          <input type="range" min={2} max={150} step={0.5} value={Math.round(el.w * 1000) / 10} onChange={(e) => onPatch({ w: Number(e.target.value) / 100 }, false)} onPointerUp={() => onPatch({}, true)} style={{ flex: 1, minWidth: 0 }} />
          <input className="input" type="number" min={2} max={150} step={0.5} value={Math.round(el.w * 1000) / 10} onChange={(e) => onPatch({ w: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="크기 %" />%
        </label>
      )}
      {num("회전", el.rot ?? 0, -180, 180, 1, "rot", "°")}
      {num("투명도", el.opacity ?? 1, 0.1, 1, 0.05, "opacity")}
      <div className="row tiny" style={{ gap: 6 }}>
        <span style={{ width: 56 }}>위치</span>
        <label>가로 <input className="input" type="number" step={0.5} value={Math.round(el.x * 1000) / 10} onChange={(e) => onPatch({ x: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="가로 위치 %" />%</label>
        <label>세로 <input className="input" type="number" step={0.5} value={Math.round(el.y * 1000) / 10} onChange={(e) => onPatch({ y: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="세로 위치 %" />%</label>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={() => onOrder(1)}>앞으로</button>
        <button className="btn btn-sm" onClick={() => onOrder(-1)}>뒤로</button>
        <button className="btn btn-sm" onClick={onDup}>복제</button>
        <button className="btn btn-sm btn-ghost" onClick={onRemove}>🗑 지우기</button>
      </div>
    </div>
  );
}
