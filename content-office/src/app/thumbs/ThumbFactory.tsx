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
  const [sels, setSels] = useState<string[]>([]);
  const sel = sels.length === 1 ? sels[0] : null;
  const setSel = (id: string | null) => setSels(id ? [id] : []);
  const [tplId, setTplId] = useState("tpl_default");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [save, setSave] = useState<"saved" | "dirty" | "saving">("saved");
  const [dragOver, setDragOver] = useState<"" | "photo" | "sticker">("");
  const [snapLines, setSnapLines] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // 📏 줄자·간격 (이 브라우저에 기억)
  const [ruler, setRuler] = useState(false);
  const [step, setStep] = useState(0);
  const [panMode, setPanMode] = useState(false);
  useEffect(() => { try { setRuler(localStorage.getItem("thumb_ruler") === "1"); setStep(Number(localStorage.getItem("thumb_step") ?? 0) || 0); } catch { /* 저장 안 돼도 됨 */ } }, []);
  useEffect(() => { try { localStorage.setItem("thumb_ruler", ruler ? "1" : "0"); localStorage.setItem("thumb_step", String(step)); } catch { /* 무시 */ } }, [ruler, step]);
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
  // ── 스티커 묶음 ──
  const groups = useMemo(() => st?.stickerGroups ?? [], [st]);
  const [stickerTab, setStickerTab] = useState<string>("all"); // all | none | 묶음 이름
  useEffect(() => { try { const t = localStorage.getItem("thumb_sticker_tab"); if (t) setStickerTab(t); } catch { /* 무시 */ } }, []);
  useEffect(() => { try { localStorage.setItem("thumb_sticker_tab", stickerTab); } catch { /* 무시 */ } }, [stickerTab]);
  useEffect(() => { if (st && stickerTab !== "all" && stickerTab !== "none" && !groups.includes(stickerTab)) setStickerTab("all"); }, [st, groups, stickerTab]);
  const setGroupsAndStickers = (g: string[], fn?: (xs: ThumbSticker[]) => ThumbSticker[]) => setSt((s) => { if (!s) return s; const next = { ...s, stickerGroups: g, stickers: fn ? fn(s.stickers) : s.stickers }; persist(fn ? { stickerGroups: g, stickers: next.stickers } : { stickerGroups: g }); return next; });
  function newGroup() {
    const name = prompt("새 스티커 묶음 이름 (예: 양 캐릭터, 반짝이, 말풍선)")?.trim().slice(0, 40);
    if (!name) return;
    if (!groups.includes(name)) setGroupsAndStickers([...groups, name]);
    setStickerTab(name);
  }
  function renameGroup(old: string) {
    const name = prompt("묶음 이름 바꾸기", old)?.trim().slice(0, 40);
    if (!name || name === old) return;
    setGroupsAndStickers([...new Set(groups.map((g) => (g === old ? name : g)))], (xs) => xs.map((x) => (x.group === old ? { ...x, group: name } : x)));
    setStickerTab(name);
  }
  function dropGroup(name: string) {
    if (!confirm(`'${name}' 묶음을 없앨까요? 안의 스티커는 지워지지 않고 '묶음 없음'으로 가요.`)) return;
    setGroupsAndStickers(groups.filter((g) => g !== name), (xs) => xs.map((x) => (x.group === name ? { ...x, group: undefined } : x)));
    setStickerTab("all");
  }
  const moveSticker = (id: string, group: string) => setStickers((xs) => xs.map((x) => (x.id === id ? { ...x, group: group || undefined } : x)));
  function moveGroup(name: string, dir: -1 | 1) { const i = groups.indexOf(name), j = i + dir; if (i < 0 || j < 0 || j >= groups.length) return; const g = [...groups]; [g[i], g[j]] = [g[j], g[i]]; setGroupsAndStickers(g); }
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
        made.push({ id: uid("st_"), name: (f.name || "스티커").replace(/\.[a-z0-9]+$/i, ""), url, group: stickerTab !== "all" && stickerTab !== "none" ? stickerTab : undefined });
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

  // ── 끌기: 옮기기(여러 개 함께) · 크기 · 회전 · 사진 위치 · 네모로 고르기 · 안내선 ──
  type Drag = { mode: "move" | "size" | "rot" | "photo" | "marquee" | "guide"; id?: string; sx: number; sy: number; starts?: Record<string, { x: number; y: number }>; el?: ThumbEl; photo?: ThumbDoc["photo"]; box?: Box; moved: boolean; additive?: boolean; guide?: { axis: "v" | "h"; i: number } };
  const drag = useRef<Drag | null>(null);
  const toStage = (e: { clientX: number; clientY: number }) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
  // 돌린 상자의 겉 네모 (정렬·끌기 붙기에 사용)
  const aabb = (b: Box) => { const r = (b.rot * Math.PI) / 180; const w = Math.abs(b.w * Math.cos(r)) + Math.abs(b.h * Math.sin(r)), h = Math.abs(b.w * Math.sin(r)) + Math.abs(b.h * Math.cos(r)); return { l: b.cx - w / 2, r: b.cx + w / 2, t: b.cy - h / 2, b: b.cy + h / 2, cx: b.cx, cy: b.cy }; };
  const groupBox = (ids: string[]) => { const bs = boxes.filter((b) => ids.includes(b.id)).map(aabb); if (!bs.length) return null; const l = Math.min(...bs.map((x) => x.l)), r = Math.max(...bs.map((x) => x.r)), t = Math.min(...bs.map((x) => x.t)), b = Math.max(...bs.map((x) => x.b)); return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2 }; };
  /** 붙기: 가장자리·가운데가 안내선·보드 가운데·끝·눈금 간격에 가까우면 착 붙임 (화면 7px 이내) */
  function snap(edges: number[], axis: "x" | "y") {
    const size = axis === "x" ? THUMB_W : H;
    const targets = [0, size / 2, size, ...(ruler ? (doc?.guides?.[axis === "x" ? "v" : "h"] ?? []).map((g) => g * size) : [])];
    const thr = 7 / k;
    let best: { d: number; line: number } | null = null;
    for (const e of edges) {
      for (const t of targets) if (Math.abs(t - e) <= thr && (!best || Math.abs(t - e) < Math.abs(best.d))) best = { d: t - e, line: t };
      if (ruler && step > 0) { const t = Math.round(e / step) * step; if (Math.abs(t - e) <= thr && (!best || Math.abs(t - e) < Math.abs(best.d))) best = { d: t - e, line: t }; }
    }
    return best;
  }
  function down(e: React.PointerEvent, mode: Drag["mode"], id?: string, guide?: Drag["guide"]) {
    if (!doc) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toStage(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    // 빈 곳: 기본은 네모로 고르기, ✋ 사진 옮기기 모드나 Alt(⌥)를 누르면 사진 위치
    if (mode === "photo" && !panMode && !e.altKey) mode = "marquee";
    let group = sels;
    // 🔒 잠긴 것: 눌러서 고르기만 (끌기·크기·회전 안 됨)
    const target = id ? doc.els.find((x) => x.id === id) : undefined;
    if (target?.locked && (mode === "size" || mode === "rot" || mode === "move")) {
      if (additive) setSels(sels.includes(id!) ? sels.filter((x) => x !== id) : [...sels, id!]);
      else if (!sels.includes(id!)) setSels([id!]);
      drag.current = null;
      return;
    }
    if (mode === "move" && id) {
      if (additive) { group = sels.includes(id) ? sels.filter((x) => x !== id) : [...sels, id]; setSels(group); if (!group.includes(id)) return; }
      else if (!sels.includes(id)) { group = [id]; setSels(group); }
    } else if ((mode === "size" || mode === "rot") && id) { group = [id]; setSels(group); }
    else if (mode === "marquee") { if (!additive) setSels([]); setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }
    if (mode !== "marquee") { hist.current.past = [...hist.current.past.slice(-80), doc]; hist.current.future = []; }
    const starts = Object.fromEntries(doc.els.filter((x) => group.includes(x.id) && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }]));
    drag.current = { mode, id, sx: p.x, sy: p.y, starts, el: id ? doc.els.find((x) => x.id === id) : undefined, photo: doc.photo, box: boxes.find((b) => b.id === id), moved: false, additive, guide };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !doc) return;
    const p = toStage(e);
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
    if (d.mode === "marquee") { setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m)); return; }
    if (d.mode === "guide" && d.guide) {
      const g = d.guide;
      const v = g.axis === "v" ? p.x / THUMB_W : p.y / H;
      setDoc((x) => { const gs = { v: [...(x.guides?.v ?? [])], h: [...(x.guides?.h ?? [])] }; gs[g.axis][g.i] = v; return { ...x, guides: gs }; }, false);
      return;
    }
    if (d.mode === "photo" && d.photo) {
      const z = d.photo.zoom || 1;
      setDoc((x) => ({ ...x, photo: { ...x.photo, x: Math.min(1, Math.max(0, d.photo!.x - dx / (THUMB_W * Math.max(0.2, z - 0.8)))), y: Math.min(1, Math.max(0, d.photo!.y - dy / (H * Math.max(0.2, z - 0.8)))) } }), false);
      return;
    }
    if (d.mode === "move" && d.starts) {
      const ids = Object.keys(d.starts);
      const g0 = groupBox(ids);
      let ddx = dx, ddy = dy;
      const lines = { x: [] as number[], y: [] as number[] };
      if (g0) {
        // 끌기 시작 때 위치 기준으로 얼마나 옮겼는지 → 그 자리의 가장자리·가운데로 붙기 계산
        const cur0 = doc.els.find((x) => x.id === ids[0]);
        const offX = cur0 ? (cur0.x - d.starts[ids[0]].x) * THUMB_W : 0, offY = cur0 ? (cur0.y - d.starts[ids[0]].y) * H : 0;
        const l = g0.l - offX + dx, r = g0.r - offX + dx, cx = g0.cx - offX + dx, t = g0.t - offY + dy, b = g0.b - offY + dy, cy = g0.cy - offY + dy;
        const sx = snap([l, cx, r], "x"), sy = snap([t, cy, b], "y");
        if (sx) { ddx += sx.d; lines.x.push(sx.line); }
        if (sy) { ddy += sy.d; lines.y.push(sy.line); }
      }
      setSnapLines(lines);
      setDoc((x) => ({ ...x, els: x.els.map((el) => (d.starts![el.id] ? { ...el, x: d.starts![el.id].x + ddx / THUMB_W, y: d.starts![el.id].y + ddy / H } : el)) }), false);
      return;
    }
    if (!d.el || !d.id) return;
    if (d.mode === "size" && d.box) {
      // 가운데에서 끌어간 거리 비율로 크기 조절
      const r0 = Math.hypot(d.sx - d.box.cx, d.sy - d.box.cy), r1 = Math.hypot(p.x - d.box.cx, p.y - d.box.cy);
      const f = Math.max(0.1, r1 / Math.max(1, r0));
      if (d.el.kind === "text") patchEl(d.id, { size: Math.round(Math.min(600, Math.max(8, (d.el.size ?? 80) * f))) }, false);
      else if (d.el.kind === "mosaic") patchEl(d.id, { w: Math.min(3, Math.max(0.02, d.el.w * f)), h: Math.min(3, Math.max(0.02, (d.el.h ?? d.el.w) * f)) }, false);
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
    setSnapLines({ x: [], y: [] });
    if (!d || !doc) return;
    if (d.mode === "marquee") {
      setMarquee((m) => {
        if (m && d.moved) {
          const l = Math.min(m.x0, m.x1), r = Math.max(m.x0, m.x1), t = Math.min(m.y0, m.y1), b = Math.max(m.y0, m.y1);
          // 네모와 겹치는 것 모두 고르기
          const lockedIds = new Set(doc.els.filter((x) => x.locked).map((x) => x.id));
          const hit = boxes.map((bx) => ({ id: bx.id, a: aabb(bx) })).filter(({ id, a }) => !lockedIds.has(id) && a.r >= l && a.l <= r && a.b >= t && a.t <= b).map((x) => x.id);
          setSels((old) => (d.additive ? [...new Set([...old, ...hit])] : hit));
        }
        return null;
      });
      return;
    }
    if (d.mode === "guide" && d.guide) {
      // 보드 밖으로 끌어내면 안내선 지우기
      const g = d.guide;
      setDoc((x) => { const gs = { v: [...(x.guides?.v ?? [])], h: [...(x.guides?.h ?? [])] }; if (gs[g.axis][g.i] < 0 || gs[g.axis][g.i] > 1) gs[g.axis].splice(g.i, 1); return { ...x, guides: gs }; }, false);
    }
    if (!d.moved) hist.current.past.pop();
  }
  /** 줄자 클릭 → 그 자리에 안내선 */
  function addGuide(axis: "v" | "h", e: React.PointerEvent) {
    if (!doc) return;
    const p = toStage(e);
    let v = axis === "v" ? p.x / THUMB_W : p.y / H;
    if (step > 0) { const size = axis === "v" ? THUMB_W : H; v = (Math.round((v * size) / step) * step) / size; }
    setDoc((x) => ({ ...x, guides: { v: [...(x.guides?.v ?? [])], h: [...(x.guides?.h ?? [])], [axis]: [...(x.guides?.[axis] ?? []), Math.min(1, Math.max(0, v))] } }));
  }
  const removeGuide = (axis: "v" | "h", i: number) => setDoc((x) => { const gs = { v: [...(x.guides?.v ?? [])], h: [...(x.guides?.h ?? [])] }; gs[axis].splice(i, 1); return { ...x, guides: gs }; });

  // ── 여러 개: 정렬 · 같은 간격 · 함께 고치기 ──
  function align(how: "l" | "c" | "r" | "t" | "m" | "b") {
    const g = groupBox(sels);
    if (!g) return;
    setDoc((x) => ({ ...x, els: x.els.map((el) => {
      const b = boxes.find((bb) => bb.id === el.id);
      if (!b || !sels.includes(el.id) || el.locked) return el;
      const a = aabb(b);
      const nx = how === "l" ? g.l + (a.cx - a.l) : how === "r" ? g.r - (a.r - a.cx) : how === "c" ? g.cx : a.cx;
      const ny = how === "t" ? g.t + (a.cy - a.t) : how === "b" ? g.b - (a.b - a.cy) : how === "m" ? g.cy : a.cy;
      return { ...el, x: el.x + (nx - a.cx) / THUMB_W, y: el.y + (ny - a.cy) / H };
    }) }));
  }
  function distribute(axis: "x" | "y") {
    const list = boxes.filter((b) => sels.includes(b.id)).map((b) => ({ id: b.id, a: aabb(b) })).sort((p, q) => (axis === "x" ? p.a.cx - q.a.cx : p.a.cy - q.a.cy));
    if (list.length < 3) return;
    const first = list[0].a, last = list[list.length - 1].a;
    const total = axis === "x" ? last.r - first.l : last.b - first.t;
    const sizes = list.reduce((s, it) => s + (axis === "x" ? it.a.r - it.a.l : it.a.b - it.a.t), 0);
    const gap = (total - sizes) / (list.length - 1);
    let pos = axis === "x" ? first.l : first.t;
    const want: Record<string, number> = {};
    for (const it of list) { const sz = axis === "x" ? it.a.r - it.a.l : it.a.b - it.a.t; want[it.id] = pos + sz / 2; pos += sz + gap; }
    setDoc((x) => ({ ...x, els: x.els.map((el) => { const it = list.find((l) => l.id === el.id); if (!it || el.locked) return el; return axis === "x" ? { ...el, x: el.x + (want[el.id] - it.a.cx) / THUMB_W } : { ...el, y: el.y + (want[el.id] - it.a.cy) / H }; }) }));
  }
  const patchMany = (pred: (e: ThumbEl) => boolean, p: Partial<ThumbEl>) => setDoc((d) => ({ ...d, els: d.els.map((e) => (sels.includes(e.id) && pred(e) ? { ...e, ...p } : e)) }));

  // ── 단축키 ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const u = undoKey(e);
      if (u) { e.preventDefault(); return u === "redo" ? redo() : undo(); }
      if (!doc) return;
      if ((e.metaKey || e.ctrlKey) && (e.code === "KeyA" || e.key.toLowerCase() === "a")) { e.preventDefault(); setSels(doc.els.filter((x) => !x.locked).map((x) => x.id)); return; }
      if (!sels.length) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEls(sels); }
      // 방향키: 눈금 간격을 켰으면 그 간격만큼, 아니면 조금씩 (Shift = 크게)
      const px = step > 0 ? step : e.shiftKey ? 20 : 4;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-px, 0], ArrowRight: [px, 0], ArrowUp: [0, -px], ArrowDown: [0, px] };
      if (mv[e.key]) { e.preventDefault(); setDoc((d) => ({ ...d, els: d.els.map((el) => (sels.includes(el.id) && !el.locked ? { ...el, x: el.x + mv[e.key][0] / THUMB_W, y: el.y + mv[e.key][1] / H } : el)) })); }
      if ((e.metaKey || e.ctrlKey) && (e.code === "KeyD" || e.key.toLowerCase() === "d")) { e.preventDefault(); duplicateMany(sels); }
      if (e.key === "Escape") setSels([]);
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
  function removeEl(id: string) { removeEls([id]); }
  function removeEls(ids: string[]) {
    const lockedN = doc?.els.filter((e) => ids.includes(e.id) && e.locked).length ?? 0;
    setDoc((d) => ({ ...d, els: d.els.filter((e) => !ids.includes(e.id) || e.locked) }));
    setSels((s) => s.filter((id) => doc?.els.find((e) => e.id === id)?.locked));
    if (lockedN) setMsg({ ok: true, text: `🔒 잠긴 ${lockedN}개는 지우지 않았어요. 지우려면 먼저 잠금을 풀어 주세요.` });
  }
  const toggleLock = (ids: string[], on?: boolean) => setDoc((d) => { const v = on ?? !d.els.filter((e) => ids.includes(e.id)).every((e) => e.locked); return { ...d, els: d.els.map((e) => (ids.includes(e.id) ? { ...e, locked: v || undefined } : e)) }; });
  function order(id: string, dir: 1 | -1) { setDoc((d) => { const i = d.els.findIndex((e) => e.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= d.els.length) return d; const els = [...d.els]; [els[i], els[j]] = [els[j], els[i]]; return { ...d, els }; }); }
  function duplicate(id: string) { duplicateMany([id]); }
  function duplicateMany(ids: string[]) {
    if (!doc) return;
    const used = new Set(doc.els.map((e) => e.slot));
    const slotFor = (s?: string) => { if (!s) return undefined; const base = s.replace(/\s*\d+$/, ""); let i = 1; while (used.has(`${base} ${i}`)) i++; const n = `${base} ${i}`; used.add(n); return n; };
    const copies = doc.els.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, id: uid("e"), slot: e.kind === "mosaic" ? undefined : slotFor(e.slot), x: e.x + 0.03, y: e.y + 0.03 }));
    setDoc((d) => ({ ...d, els: [...d.els, ...copies] }));
    setSels(copies.map((c) => c.id));
  }
  const addMosaic = (mosaic: "blur" | "pixel") => addEl({ kind: "mosaic", mosaic, strength: 45, round: true, w: 0.22, h: 0.22, x: 0.5, y: 0.45 });

  // ── 템플릿 ──
  function applyTo(ids: string[]) {
    setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, doc: applyTemplate(x.doc, tpl), templateId: tpl.id } : x)));
    setMsg({ ok: true, text: `'${tpl.name}' 템플릿을 ${ids.length}장에 입혔어요. 글자 내용·고른 캐릭터는 그대로예요. 마음에 안 들면 Ctrl+Z.` });
  }
  function saveAsTemplate(overwrite: boolean) {
    if (!doc) return;
    if (overwrite && tpl) {
      if (!confirm(`'${tpl.name}' 템플릿을 지금 모양으로 바꿀까요? (위치·글꼴·크기·색·캐릭터 크기)`)) return;
      setTemplates((ts) => ts.map((t) => (t.id === tpl.id ? { ...t, ratio: doc.ratio, els: doc.els.filter((e) => e.kind !== "mosaic").map((e) => ({ ...e })), guides: doc.guides } : t)));
      setMsg({ ok: true, text: `'${tpl.name}' 템플릿을 저장했어요. '모든 사진에 적용'을 누르면 다른 사진도 같은 모양이 돼요.` });
      return;
    }
    const name = prompt("새 템플릿 이름", `템플릿 ${templates.length + 1}`);
    if (!name) return;
    const t: ThumbTemplate = { id: uid("tpl_"), name: name.slice(0, 60), ratio: doc.ratio, els: doc.els.filter((e) => e.kind !== "mosaic").map((e) => ({ ...e })), guides: doc.guides };
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
                <button className="btn btn-sm" onClick={() => addMosaic("blur")} title="얼굴 등을 흐리게 가려요">＋ 🫥 모자이크</button>
                <button className={`btn btn-sm ${ruler ? "btn-primary" : ""}`} onClick={() => setRuler((r) => !r)} title="줄자를 누르면 안내선이 생겨요">📏 줄자</button>
                {ruler && <select className="input" style={{ width: "auto" }} value={step} onChange={(e) => setStep(Number(e.target.value))} aria-label="눈금 간격 맞추기">
                  {[[0, "간격 맞추기 끔"], [10, "10px 간격"], [20, "20px 간격"], [30, "30px 간격"], [50, "50px 간격"], [100, "100px 간격"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>}
                <button className={`btn btn-sm ${panMode ? "btn-primary" : ""}`} onClick={() => setPanMode((m) => !m)} title="켜면 빈 곳을 끌어 사진 위치를 옮겨요 (Alt/⌥ 누른 채 끌어도 돼요)">✋ 사진 옮기기</button>
                <select className="input" style={{ width: "auto", marginLeft: "auto" }} value={doc.ratio} onChange={(e) => setDoc((d) => ({ ...d, ratio: e.target.value as ThumbRatio }))} aria-label="비율">
                  {THUMB_RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div ref={wrap} style={{ width: "100%" }}>
                <div style={{ display: "grid", gridTemplateColumns: ruler ? "20px auto" : "auto", gridTemplateRows: ruler ? "20px auto" : "auto", width: "fit-content" }}>
                  {ruler && <span style={{ background: "var(--line)", borderRadius: "4px 0 0 0" }} title="줄자: 1080px 기준" />}
                  {ruler && <Ruler axis="v" len={stageW} size={THUMB_W} onPointerDown={(e) => addGuide("v", e)} />}
                  {ruler && <Ruler axis="h" len={stageW * (H / THUMB_W)} size={H} onPointerDown={(e) => addGuide("h", e)} />}
                <div style={{ position: "relative", width: stageW, height: stageW * (H / THUMB_W), touchAction: "none", userSelect: "none" }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                  <canvas ref={canvas} style={{ width: stageW, height: stageW * (H / THUMB_W), display: "block", borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,.12)", cursor: panMode ? "grab" : "crosshair" }} onPointerDown={(e) => down(e, "photo")} aria-label="썸네일 보드 (빈 곳을 끌면 네모로 여러 개 고르기)" />
                  {snapLines.x.map((x) => <div key={`sx${x}`} style={{ position: "absolute", left: x * k, top: 0, bottom: 0, width: 1, background: "#ff3d8b", pointerEvents: "none" }} />)}
                  {snapLines.y.map((y) => <div key={`sy${y}`} style={{ position: "absolute", top: y * k, left: 0, right: 0, height: 1, background: "#ff3d8b", pointerEvents: "none" }} />)}
                  {doc.els.map((el) => {
                    const b = boxOf(el.id);
                    if (!b) return null;
                    const on = sels.includes(el.id), single = on && sels.length === 1 && !el.locked;
                    return (
                      <div key={el.id} onPointerDown={(e) => down(e, "move", el.id)} onDoubleClick={() => { setSel(el.id); setTimeout(() => (document.getElementById("thumb-text") as HTMLTextAreaElement | null)?.focus(), 30); }}
                        style={{ position: "absolute", left: (b.cx - b.w / 2) * k, top: (b.cy - b.h / 2) * k, width: b.w * k, height: b.h * k, transform: `rotate(${b.rot}deg)`, outline: on ? `2px ${el.locked ? "solid #f59e0b" : single ? "solid #3b82f6" : "dashed #3b82f6"}` : el.kind === "mosaic" ? "1px dashed rgba(255,255,255,.7)" : undefined, cursor: el.locked ? "default" : "move", borderRadius: el.kind === "mosaic" && el.round ? "50%" : 4 }}
                        title={el.kind === "mosaic" ? "모자이크" : el.slot ?? ""} data-el={el.id}>
                        {on && (
                          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleLock([el.id]); }}
                            title={el.locked ? "잠김 — 눌러서 풀기" : "눌러서 자리 고정(잠금)"} aria-label={el.locked ? "잠금 풀기" : "잠그기"}
                            style={{ position: "absolute", right: -12, top: -12, width: 24, height: 24, borderRadius: 999, border: `2px solid ${el.locked ? "#f59e0b" : "#3b82f6"}`, background: el.locked ? "#fef3c7" : "#fff", fontSize: 12, lineHeight: "18px", padding: 0, cursor: "pointer", transform: `rotate(${-b.rot}deg)` }}>
                            {el.locked ? "🔒" : "🔓"}
                          </button>
                        )}
                        {single && <>
                          <span onPointerDown={(e) => down(e, "size", el.id)} style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#fff", border: "2px solid #3b82f6", borderRadius: 3, cursor: "nwse-resize" }} title="끌어서 크기" />
                          <span onPointerDown={(e) => down(e, "rot", el.id)} style={{ position: "absolute", left: "50%", top: -26, marginLeft: -7, width: 14, height: 14, background: "#3b82f6", borderRadius: 999, cursor: "grab" }} title="끌어서 돌리기" />
                        </>}
                      </div>
                    );
                  })}
                  {/* 안내선: 끌어서 옮기기 · 두 번 누르거나 보드 밖으로 끌면 지우기 */}
                  {ruler && (doc.guides?.v ?? []).map((g, i) => <div key={`gv${i}`} onPointerDown={(e) => down(e, "guide", undefined, { axis: "v", i })} onDoubleClick={() => removeGuide("v", i)} title={`세로 안내선 ${Math.round(g * THUMB_W)}px · 끌어서 옮기기 · 두 번 누르면 지우기`} style={{ position: "absolute", left: g * stageW - 4, top: 0, bottom: 0, width: 9, cursor: "ew-resize" }}><div style={{ margin: "0 auto", width: 1, height: "100%", background: "#06b6d4" }} /></div>)}
                  {ruler && (doc.guides?.h ?? []).map((g, i) => <div key={`gh${i}`} onPointerDown={(e) => down(e, "guide", undefined, { axis: "h", i })} onDoubleClick={() => removeGuide("h", i)} title={`가로 안내선 ${Math.round(g * H)}px · 끌어서 옮기기 · 두 번 누르면 지우기`} style={{ position: "absolute", top: g * stageW * (H / THUMB_W) - 4, left: 0, right: 0, height: 9, cursor: "ns-resize", display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: 1, background: "#06b6d4" }} /></div>)}
                  {marquee && <div style={{ position: "absolute", left: Math.min(marquee.x0, marquee.x1) * k, top: Math.min(marquee.y0, marquee.y1) * k, width: Math.abs(marquee.x1 - marquee.x0) * k, height: Math.abs(marquee.y1 - marquee.y0) * k, border: "1px dashed #3b82f6", background: "rgba(59,130,246,.12)", pointerEvents: "none" }} />}
                </div>
                </div>
              </div>
              {ruler && (doc.guides?.v.length || doc.guides?.h.length) ? <div className="row tiny muted" style={{ gap: 6 }}>안내선 세로 {doc.guides?.v.length ?? 0} · 가로 {doc.guides?.h.length ?? 0}개<button className="btn btn-sm btn-ghost" onClick={() => setDoc((d) => ({ ...d, guides: { v: [], h: [] } }))}>안내선 모두 지우기</button></div> : null}
              <label className="row tiny" style={{ gap: 6 }}>사진 확대<input type="range" min={1} max={4} step={0.01} value={doc.photo.zoom} onChange={(e) => setDoc((d) => ({ ...d, photo: { ...d.photo, zoom: Number(e.target.value) } }), false)} style={{ flex: 1 }} /><b>{doc.photo.zoom.toFixed(2)}×</b><button className="btn btn-sm btn-ghost" onClick={() => setDoc((d) => ({ ...d, photo: { zoom: 1, x: 0.5, y: 0.5 } }))}>원래대로</button></label>
              <span className="tiny muted">빈 곳을 끌면 네모로 여러 개 고르기 · Shift/Ctrl(⌘)+클릭으로 하나씩 더하기 · Ctrl+A 전부 · 사진 위치는 ✋ 사진 옮기기(또는 Alt/⌥+끌기) · ■ 모서리 크기, ● 회전 · 가운데·안내선·눈금에 착 붙어요(분홍 선) · 📏 줄자를 누르면 안내선 · 방향키 이동(간격 켜면 그만큼) · Ctrl+D 복제 · Delete 지우기 · Ctrl+Z 되돌리기</span>
            </div>

            {/* 속성 + 스티커 */}
            <div className="stack" style={{ gap: 10 }}>
              {sels.length > 1 ? (
                <MultiPanel els={doc.els.filter((e) => sels.includes(e.id))} onLock={(on) => toggleLock(sels, on)} onAlign={align} onDistribute={distribute} onPatch={patchMany} onRemove={() => removeEls(sels)} onDup={() => duplicateMany(sels)} onClear={() => setSels([])} />
              ) : selEl ? <ElPanel el={selEl} onPatch={(p, rec) => patchEl(selEl.id, p, rec)} onRemove={() => removeEl(selEl.id)} onOrder={(d) => order(selEl.id, d)} onDup={() => duplicate(selEl.id)} /> : <p className="tiny muted" style={{ margin: 0 }}>보드에서 글자·스티커를 누르면 여기서 고칠 수 있어요. 글자는 두 번 누르면 바로 쓸 수 있어요. 여러 개는 빈 곳을 끌어 네모로 감싸거나 Shift+클릭.</p>}
              <div ref={stickerBox} tabIndex={0} className="card card-pad stack" style={{ gap: 6, outline: dragOver === "sticker" ? "3px dashed var(--accent)" : undefined }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver("sticker"); }} onDragLeave={() => setDragOver("")}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(""); if (e.dataTransfer.types.includes("text/sticker-id")) return; void addStickers(imageFiles(e.dataTransfer.files)); }}>
                <div className="row" style={{ gap: 6 }}>
                  <b className="small">🐑 내 스티커 {stickers.length}</b>
                  <label className="btn btn-sm" style={{ marginLeft: "auto" }}>{busy === "sticker" ? <span className="spinner" /> : stickerTab !== "all" && stickerTab !== "none" ? `＋ '${stickerTab.slice(0, 8)}'에 올리기` : "＋ 올리기"}<input type="file" accept="image/*" multiple hidden onChange={(e) => { void addStickers(imageFiles(e.target.files)); e.target.value = ""; }} /></label>
                </div>
                {/* 묶음 탭: 스티커를 탭 위로 끌어다 놓으면 그 묶음으로 옮겨요 */}
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }} role="tablist" aria-label="스티커 묶음">
                  {[["all", `전체 ${stickers.length}`], ...groups.map((g) => [g, `${g} ${stickers.filter((x) => x.group === g).length}`]), ["none", `묶음 없음 ${stickers.filter((x) => !x.group || !groups.includes(x.group)).length}`]].map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={stickerTab === id} className={`chip${stickerTab === id ? " on" : ""}`} onClick={() => setStickerTab(id)}
                      onDragOver={(e) => { if (id !== "all" && e.dataTransfer.types.includes("text/sticker-id")) { e.preventDefault(); e.stopPropagation(); } }}
                      onDrop={(e) => { const sid = e.dataTransfer.getData("text/sticker-id"); if (!sid || id === "all") return; e.preventDefault(); e.stopPropagation(); setDragOver(""); moveSticker(sid, id === "none" ? "" : id); }}
                      title={id === "all" ? "모든 스티커 (묶음별로 나눠 보기)" : "스티커를 여기로 끌어다 놓으면 이 묶음으로 옮겨요"}>{id === "all" ? "📚 " : id === "none" ? "" : "📁 "}{label}</button>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={newGroup}>＋ 묶음</button>
                </div>
                {stickerTab !== "all" && stickerTab !== "none" && (
                  <div className="row tiny" style={{ gap: 4 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => moveGroup(stickerTab, -1)} title="묶음 순서 앞으로">◀</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => moveGroup(stickerTab, 1)} title="묶음 순서 뒤로">▶</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => renameGroup(stickerTab)}>✏️ 이름 바꾸기</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => dropGroup(stickerTab)}>묶음 없애기</button>
                  </div>
                )}
                <span className="tiny muted">여기를 한 번 누른 뒤 Ctrl+V 하면 스티커로 들어가요 · 끌어다 놓기 · 지금 고른 묶음에 들어가요 · 스티커를 묶음 탭으로 끌면 옮겨져요</span>
                <div className="stack" style={{ gap: 8, maxHeight: 360, overflowY: "auto" }}>
                  {(stickerTab === "all"
                    ? [...groups.map((g) => ({ title: `📁 ${g}`, list: stickers.filter((x) => x.group === g) })), { title: "묶음 없음", list: stickers.filter((x) => !x.group || !groups.includes(x.group)) }].filter((sec) => sec.list.length)
                    : [{ title: "", list: stickers.filter((x) => (stickerTab === "none" ? !x.group || !groups.includes(x.group) : x.group === stickerTab)) }]
                  ).map((sec) => (
                    <div key={sec.title || "one"} className="stack" style={{ gap: 4 }}>
                      {sec.title && <span className="tiny" style={{ fontWeight: 700 }}>{sec.title} <span className="muted">{sec.list.length}</span></span>}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: 6 }}>
                        {sec.list.map((s) => (
                          <div key={s.id} style={{ position: "relative" }} draggable onDragStart={(e) => { e.dataTransfer.setData("text/sticker-id", s.id); e.dataTransfer.effectAllowed = "move"; }}>
                            <button className="card" style={{ width: "100%", aspectRatio: "1", padding: 4, cursor: "pointer", background: "repeating-conic-gradient(#f2f2f2 0 25%, #fff 0 50%) 0 0/12px 12px" }} title={`${s.name} — ${selEl?.kind === "sticker" ? "고른 스티커를 이걸로 바꾸기" : "보드에 붙이기"}`} onClick={() => pickSticker(s)}>
                              <img src={s.url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                            </button>
                            <button className="btn btn-sm btn-ghost" style={{ position: "absolute", top: -6, right: -6, padding: "0 4px", fontSize: 11 }} title="휴지통으로" onClick={() => setStickers((xs) => xs.map((x) => (x.id === s.id ? { ...x, deletedAt: new Date().toISOString() } : x)))}>✕</button>
                            {/* 묶음 옮기기 (작은 📁) */}
                            <label style={{ position: "absolute", left: -4, bottom: -4, width: 20, height: 20, borderRadius: 999, background: "#fff", border: "1px solid var(--line)", fontSize: 11, display: "grid", placeItems: "center", cursor: "pointer", overflow: "hidden" }} title={`묶음: ${s.group ?? "없음"} (눌러서 옮기기)`}>
                              📁
                              <select value={s.group && groups.includes(s.group) ? s.group : ""} onChange={(e) => moveSticker(s.id, e.target.value)} aria-label={`${s.name} 묶음 옮기기`} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
                                <option value="">묶음 없음</option>
                                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!stickers.length && <p className="tiny muted" style={{ margin: 0 }}>스티커를 올려 주세요. ＋ 묶음으로 &apos;양 캐릭터&apos;, &apos;반짝이&apos;처럼 나눠 둘 수 있어요.</p>}
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
        <b className="small">{el.kind === "text" ? "✏️ 글자" : el.kind === "sticker" ? "🐑 스티커" : el.kind === "mosaic" ? "🫥 모자이크" : "✦ 모양"}</b>
        <button className={`btn btn-sm ${el.locked ? "btn-primary" : ""}`} onClick={() => onPatch({ locked: el.locked ? undefined : true })} title="자리 고정: 끌기·크기·회전·방향키·정렬·지우기를 막아요" aria-label={el.locked ? "잠금 풀기" : "잠그기"}>{el.locked ? "🔒 잠김" : "🔓"}</button>
        {el.kind !== "mosaic" && <input className="input" style={{ flex: 1, minWidth: 0, padding: "2px 6px", fontSize: 12 }} value={el.slot ?? ""} onChange={(e) => onPatch({ slot: e.target.value })} placeholder="칸 이름" title="칸 이름: 템플릿을 입힐 때 같은 이름끼리 글 내용·캐릭터를 지켜요" aria-label="칸 이름" />}
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
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn btn-sm ${el.flip ? "btn-primary" : ""}`} onClick={() => onPatch({ flip: !el.flip })}>↔ 좌우 뒤집기</button>
          <button className={`btn btn-sm ${el.gray ? "btn-primary" : ""}`} onClick={() => onPatch({ gray: !el.gray })} title="스티커를 흑백으로 (다시 누르면 원래 색)">◐ 흑백{el.gray ? " 켬" : ""}</button>
        </div>
      </>}
      {el.kind === "shape" && <>
        <div className="seg">{([["sparkle", "✦"], ["heart", "♥"], ["star", "★"], ["circle", "●"]] as const).map(([s, l]) => <button key={s} className={el.shape === s ? "on" : ""} onClick={() => onPatch({ shape: s })}>{l}</button>)}</div>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>색</span><ColorField value={el.fill ?? "#ffd84d"} onChange={(fill) => onPatch({ fill })} label="모양 색" /></div>
      </>}
      {el.kind === "mosaic" && <>
        <div className="row tiny" style={{ gap: 4, flexWrap: "wrap" }}>
          <div className="seg">{([["blur", "흐리게"], ["pixel", "픽셀"]] as const).map(([v, l]) => <button key={v} className={(el.mosaic ?? "blur") === v ? "on" : ""} onClick={() => onPatch({ mosaic: v })}>{l}</button>)}</div>
          <div className="seg">{([[true, "● 동그라미"], [false, "■ 네모"]] as const).map(([v, l]) => <button key={String(v)} className={!!el.round === v ? "on" : ""} onClick={() => onPatch({ round: v })}>{l}</button>)}</div>
        </div>
        {num("세기", el.strength ?? 45, 1, 100, 1, "strength")}
        <label className="row tiny" style={{ gap: 6, flexWrap: "nowrap" }}>
          <span style={{ width: 56, flexShrink: 0 }}>세로 크기</span>
          <input type="range" min={2} max={150} step={0.5} value={Math.round((el.h ?? el.w) * 1000) / 10} onChange={(e) => onPatch({ h: Number(e.target.value) / 100 }, false)} onPointerUp={() => onPatch({}, true)} style={{ flex: 1, minWidth: 0 }} />
          <input className="input" type="number" min={2} max={150} step={0.5} value={Math.round((el.h ?? el.w) * 1000) / 10} onChange={(e) => onPatch({ h: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="세로 크기 %" />%
        </label>
        <span className="tiny muted">모자이크는 사진만 가리고, 스티커·글자는 위에 그대로 보여요. 템플릿에는 저장되지 않아요(사진마다 얼굴 위치가 달라서).</span>
      </>}
      {el.kind !== "text" && (
        <label className="row tiny" style={{ gap: 6, flexWrap: "nowrap" }}>
          <span style={{ width: 56, flexShrink: 0 }}>{el.kind === "mosaic" ? "가로 크기" : "크기"}</span>
          <input type="range" min={2} max={150} step={0.5} value={Math.round(el.w * 1000) / 10} onChange={(e) => onPatch({ w: Number(e.target.value) / 100 }, false)} onPointerUp={() => onPatch({}, true)} style={{ flex: 1, minWidth: 0 }} />
          <input className="input" type="number" min={2} max={150} step={0.5} value={Math.round(el.w * 1000) / 10} onChange={(e) => onPatch({ w: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="크기 %" />%
        </label>
      )}
      <fieldset disabled={!!el.locked} className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0, opacity: el.locked ? 0.55 : 1 }} title={el.locked ? "🔒 잠겨 있어요 — 위 🔒 를 눌러 풀면 위치·회전을 바꿀 수 있어요" : undefined}>
      {num("회전", el.rot ?? 0, -180, 180, 1, "rot", "°")}
      {num("투명도", el.opacity ?? 1, 0.1, 1, 0.05, "opacity")}
      <div className="row tiny" style={{ gap: 6 }}>
        <span style={{ width: 56 }}>위치</span>
        <label>가로 <input className="input" type="number" step={0.5} value={Math.round(el.x * 1000) / 10} onChange={(e) => onPatch({ x: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="가로 위치 %" />%</label>
        <label>세로 <input className="input" type="number" step={0.5} value={Math.round(el.y * 1000) / 10} onChange={(e) => onPatch({ y: Number(e.target.value) / 100 })} style={{ width: 62, padding: "2px 4px" }} aria-label="세로 위치 %" />%</label>
      </div>
      </fieldset>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={() => onOrder(1)}>앞으로</button>
        <button className="btn btn-sm" onClick={() => onOrder(-1)}>뒤로</button>
        <button className="btn btn-sm" onClick={onDup}>복제</button>
        <button className="btn btn-sm btn-ghost" onClick={onRemove}>🗑 지우기</button>
      </div>
    </div>
  );
}

/** 줄자: 1080 기준 눈금 (작은 눈금 10px, 중간 50px, 숫자 100px). 누르면 그 자리에 안내선 */
function Ruler({ axis, len, size, onPointerDown }: { axis: "v" | "h"; len: number; size: number; onPointerDown: (e: React.PointerEvent) => void }) {
  const k = len / size;
  const ticks: React.ReactNode[] = [];
  for (let v = 0; v <= size; v += 10) {
    const p = v * k;
    const big = v % 100 === 0, mid = v % 50 === 0;
    const l = big ? 12 : mid ? 8 : 4;
    ticks.push(axis === "v" ? <line key={v} x1={p} x2={p} y1={20 - l} y2={20} stroke="currentColor" strokeWidth={big ? 1 : 0.6} /> : <line key={v} y1={p} y2={p} x1={20 - l} x2={20} stroke="currentColor" strokeWidth={big ? 1 : 0.6} />);
    if (big && v > 0 && v < size) ticks.push(axis === "v" ? <text key={`t${v}`} x={p + 2} y={9} fontSize={8} fill="currentColor">{v}</text> : <text key={`t${v}`} x={2} y={p - 2} fontSize={8} fill="currentColor" transform={`rotate(-90 2 ${p - 2})`}>{v}</text>);
  }
  return (
    <svg width={axis === "v" ? len : 20} height={axis === "v" ? 20 : len} onPointerDown={onPointerDown} style={{ background: "var(--line)", color: "var(--muted, #888)", cursor: axis === "v" ? "s-resize" : "e-resize", display: "block" }} role="button" aria-label={axis === "v" ? "가로 줄자 (누르면 세로 안내선)" : "세로 줄자 (누르면 가로 안내선)"}>
      {ticks}
    </svg>
  );
}

/** 여러 개 고른 상태: 정렬 · 같은 간격 · 글자·모양 색 한꺼번에 */
function MultiPanel({ els, onLock, onAlign, onDistribute, onPatch, onRemove, onDup, onClear }: { els: ThumbEl[]; onLock: (on: boolean) => void; onAlign: (h: "l" | "c" | "r" | "t" | "m" | "b") => void; onDistribute: (a: "x" | "y") => void; onPatch: (pred: (e: ThumbEl) => boolean, p: Partial<ThumbEl>) => void; onRemove: () => void; onDup: () => void; onClear: () => void }) {
  const texts = els.filter((e) => e.kind === "text"), shapes = els.filter((e) => e.kind === "shape");
  const isText = (e: ThumbEl) => e.kind === "text", isShape = (e: ThumbEl) => e.kind === "shape";
  return (
    <div className="card card-pad stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 4 }}><b className="small">☑️ {els.length}개 고름</b><span className="tiny muted">글자 {texts.length} · 모양 {shapes.length} · 스티커 {els.filter((e) => e.kind === "sticker").length}{els.some((e) => e.kind === "mosaic") ? ` · 모자이크 ${els.filter((e) => e.kind === "mosaic").length}` : ""}</span><button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={onClear}>고르기 풀기</button></div>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn btn-sm" onClick={() => onLock(true)}>🔒 모두 잠그기</button>
        <button className="btn btn-sm" onClick={() => onLock(false)}>🔓 모두 풀기</button>
        <span className="tiny muted">잠긴 것 {els.filter((e) => e.locked).length}개 (정렬·이동에서 빠져요)</span>
      </div>
      <span className="tiny muted">정렬 (고른 것들 기준)</span>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {([["l", "⇤ 왼쪽"], ["c", "↔ 가운데"], ["r", "⇥ 오른쪽"], ["t", "⤒ 위"], ["m", "↕ 가운데"], ["b", "⤓ 아래"]] as const).map(([h, l]) => <button key={h} className="btn btn-sm" onClick={() => onAlign(h)}>{l}</button>)}
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <button className="btn btn-sm" disabled={els.length < 3} onClick={() => onDistribute("x")} title="3개 이상">가로 같은 간격</button>
        <button className="btn btn-sm" disabled={els.length < 3} onClick={() => onDistribute("y")} title="3개 이상">세로 같은 간격</button>
      </div>
      {texts.length > 0 && <>
        <span className="tiny muted">글자 {texts.length}개 한꺼번에</span>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>글꼴</span><FontPicker value={texts[0].font ?? "noto"} onPick={(font) => onPatch(isText, { font })} /></div>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>글자색</span><ColorField value={texts[0].color ?? "#222222"} onChange={(color) => onPatch(isText, { color })} label="여러 글자색" /></div>
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>테두리색</span><ColorField value={texts[0].stroke || "#ffffff"} onChange={(stroke) => onPatch(isText, { stroke })} label="여러 테두리색" /></div>
        <label className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>크기</span><input type="range" min={16} max={300} value={texts[0].size ?? 80} onChange={(e) => onPatch(isText, { size: Number(e.target.value) })} style={{ flex: 1 }} /><b>{texts[0].size ?? 80}</b></label>
      </>}
      {els.some((e) => e.kind === "sticker") && (
        <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>스티커</span>
          <button className="btn btn-sm" onClick={() => onPatch((e) => e.kind === "sticker", { gray: true })}>◐ 모두 흑백</button>
          <button className="btn btn-sm" onClick={() => onPatch((e) => e.kind === "sticker", { gray: undefined })}>원래 색</button>
        </div>
      )}
      {shapes.length > 0 && <div className="row tiny" style={{ gap: 6 }}><span style={{ width: 56 }}>모양 색</span><ColorField value={shapes[0].fill ?? "#ffd84d"} onChange={(fill) => onPatch(isShape, { fill })} label="여러 모양 색" /></div>}
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={onDup}>복제 (Ctrl+D)</button>
        <button className="btn btn-sm btn-ghost" onClick={onRemove}>🗑 모두 지우기</button>
      </div>
      <span className="tiny muted">함께 끌어 옮기기 · 방향키로 함께 이동 · Shift/Ctrl+클릭으로 빼기</span>
    </div>
  );
}
