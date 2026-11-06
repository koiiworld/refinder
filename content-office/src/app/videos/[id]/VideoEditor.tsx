"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import type { Box, EditOptions, Video } from "@/lib/videos";
import { dur, mb } from "../VideoFactory";

/** 영상 위에 끌어서 옮기고, 오른쪽 아래 모서리로 크기를 바꾸는 상자 */
function BoxLayer({ boxes, onChange }: { boxes: Box[]; onChange: (b: Box[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; mode: "move" | "size"; sx: number; sy: number; b: Box } | null>(null);
  const start = (e: React.PointerEvent, i: number, mode: "move" | "size") => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { i, mode, sx: e.clientX, sy: e.clientY, b: boxes[i] };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = ref.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.sx) / r.width, dy = (e.clientY - d.sy) / r.height;
    const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const nb = d.mode === "move"
      ? { ...d.b, x: c(d.b.x + dx, 0, 1 - d.b.w), y: c(d.b.y + dy, 0, 1 - d.b.h) }
      : { ...d.b, w: c(d.b.w + dx, 0.03, 1 - d.b.x), h: c(d.b.h + dy, 0.02, 1 - d.b.y) };
    onChange(boxes.map((b, k) => (k === d.i ? nb : b)));
  };
  return (
    <div ref={ref} onPointerMove={move} onPointerUp={() => (drag.current = null)} style={{ position: "absolute", inset: 0, pointerEvents: boxes.length ? "auto" : "none" }}>
      {boxes.map((b, i) => (
        <div
          key={i}
          onPointerDown={(e) => start(e, i, "move")}
          style={{ position: "absolute", left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, border: "2px dashed #ffcc00", background: "rgba(255,204,0,.18)", cursor: "move", touchAction: "none" }}
        >
          <span className="tiny" style={{ position: "absolute", left: 2, top: -18, background: "#ffcc00", color: "#000", padding: "0 4px", borderRadius: 3 }}>자막 {i + 1}</span>
          <span onPointerDown={(e) => start(e, i, "size")} style={{ position: "absolute", right: -8, bottom: -8, width: 18, height: 18, borderRadius: 9, background: "#ffcc00", cursor: "nwse-resize", touchAction: "none" }} />
        </div>
      ))}
    </div>
  );
}

export default function VideoEditor({ initial, edits }: { initial: Video; edits: Video[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [showOriginal, setShowOriginal] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [mode, setMode] = useState<"none" | "delogo" | "blur">("none");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState<number | null>(null);
  const [aspect, setAspect] = useState<"keep" | "9:16">("keep");
  const [mute, setMute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const pending = v.status === "queued" || v.status === "running";

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const x = await api<Video>(`/api/videos/${v.id}`).catch(() => null);
      if (x) setV(x);
      if (x && x.status === "ready") router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [pending, v.id, router]);

  const src = `/api/videos/${v.id}/file${showOriginal ? "?kind=original" : ""}`;
  const now = () => Math.round((vid.current?.currentTime ?? 0) * 10) / 10;

  async function save() {
    const opts: EditOptions = { start, end: end ?? undefined, aspect, mode: boxes.length ? (mode === "none" ? "delogo" : mode) : "none", boxes, mute, fromOriginal: showOriginal };
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ id: string }>(`/api/videos/${v.id}`, "POST", { action: "edit", opts });
      router.push(`/videos/${r.id}`);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("이 영상을 지울까요? (저장소에서도 지워져요)")) return;
    await api(`/api/videos/${v.id}`, "DELETE");
    router.push("/videos");
  }

  if (v.status !== "ready") {
    return (
      <section className="card card-pad stack" style={{ gap: 8 }}>
        {v.status === "error" ? <div className="notice notice-bad small">{v.message}</div> : <div className="small"><span className="spinner" /> {v.message || "대기 중"} (이 화면을 닫아도 계속 진행돼요)</div>}
        <div className="tiny muted">{v.source_url}</div>
        <div className="row"><button className="btn btn-ghost" onClick={remove}>🗑 지우기</button></div>
      </section>
    );
  }

  return (
    <div className="video-editor">
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: v.width && v.height ? `${v.width} / ${v.height}` : "9 / 16", background: "#000", borderRadius: 10, overflow: "hidden" }}>
          <video ref={vid} key={src} src={src} controls playsInline style={{ width: "100%", height: "100%", display: "block" }} />
          <BoxLayer boxes={boxes} onChange={setBoxes} />
        </div>
        <div className="tiny muted" style={{ textAlign: "center" }}>
          {v.width}×{v.height} · {dur(v.duration)} · {mb(v.size)}{v.info?.subsRemoved ? ` · 자막 지움${v.info.ai ? ` (${v.info.ai})` : ""}` : ""}
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 6 }}>
          {v.original_path && <button className={`btn btn-sm ${showOriginal ? "btn-primary" : ""}`} onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "원본 보는 중" : "자막 있는 원본 보기"}</button>}
          <a className="btn btn-sm" href={`/api/videos/${v.id}/file?download=1${showOriginal ? "&kind=original" : ""}`}>⬇️ 내려받기</a>
          {v.source_url && <a className="btn btn-sm btn-ghost" href={v.source_url} target="_blank" rel="noreferrer">원래 링크 ↗</a>}
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <b className="small">✂️ 편집해서 새로 저장</b>
        <div className="stack" style={{ gap: 6 }}>
          <div className="small"><b>자르기</b> <span className="tiny muted">재생하다가 버튼을 누르면 그 위치로 정해져요</span></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setStart(now())}>시작: {dur(start)}</button>
            <button className="btn btn-sm" onClick={() => setEnd(now())}>끝: {end == null ? "끝까지" : dur(end)}</button>
            {(start > 0 || end != null) && <button className="btn btn-sm btn-ghost" onClick={() => { setStart(0); setEnd(null); }}>초기화</button>}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="small"><b>자막 영역</b> <span className="tiny muted">노란 상자를 끌어 옮기고, 모서리로 크기를 바꿔요</span></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setBoxes([...boxes, { x: 0.06, y: 0.72, w: 0.88, h: 0.12 }])}>+ 상자 추가</button>
            {!!v.info?.subBoxes?.length && <button className="btn btn-sm" onClick={() => setBoxes(v.info.subBoxes!)}>AI가 찾은 위치 불러오기</button>}
            {!!boxes.length && <button className="btn btn-sm btn-ghost" onClick={() => setBoxes([])}>상자 모두 빼기</button>}
          </div>
          {!!boxes.length && (
            <div className="row" style={{ gap: 6 }}>
              {(["delogo", "blur"] as const).map((m) => (
                <button key={m} className={`btn btn-sm ${(mode === "none" ? "delogo" : mode) === m ? "btn-primary" : ""}`} onClick={() => setMode(m)}>{m === "delogo" ? "🧽 지우기 (주변 색으로 메움)" : "🌫 흐리게"}</button>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={aspect === "9:16"} onChange={(e) => setAspect(e.target.checked ? "9:16" : "keep")} /> 세로 9:16 맞추기 (흐린 배경)</label>
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} /> 소리 끄기</label>
        </div>
        {msg && <div className={`notice ${msg.ok ? "notice-ok" : "notice-bad"} small`}>{msg.text}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : "💾 편집본 만들기"}</button>
        <p className="tiny muted" style={{ margin: 0 }}>원본은 그대로 두고 새 영상으로 저장해요. 몇 초~몇 분 걸려요.</p>

        {!!edits.length && (
          <div className="stack" style={{ gap: 4 }}>
            <b className="small">이 영상의 편집본</b>
            {edits.map((e) => (
              <Link key={e.id} href={`/videos/${e.id}`} className="small row between" style={{ flexWrap: "nowrap" }}>
                <span className="ellipsis">{e.title}</span>
                <span className="tiny muted">{e.status === "ready" ? `${dur(e.duration)} · ${mb(e.size)}` : e.status === "error" ? "실패" : "만드는 중"}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="row"><button className="btn btn-ghost btn-sm" onClick={remove}>🗑 이 영상 지우기</button></div>
      </section>
    </div>
  );
}
