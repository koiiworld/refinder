"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import type { Video } from "@/lib/videos";

const KIND = { download: "받은 영상", edit: "편집본", studio: "스튜디오", upload: "올린 영상", reel: "릴스 편집본" } as const;
export const dur = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const mb = (n: number | null) => (n == null ? "" : `${(n / 1048576).toFixed(1)}MB`);

export default function VideoFactory({ initial, storage }: { initial: Video[]; storage: "supabase" | "db" }) {
  const [videos, setVideos] = useState(initial);
  const [url, setUrl] = useState("");
  const [removeSubs, setRemoveSubs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  async function trash(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ count: number }>("/api/trash", "POST", { action: "trash", ids });
      setNote(`${r.count}개를 휴지통으로 옮겼어요. 휴지통에서 되살릴 수 있어요.`);
      setSel([]);
      setVideos((cur) => cur.filter((v) => !ids.includes(v.id)));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const pending = videos.some((v) => v.status === "queued" || v.status === "running");

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      try {
        setVideos((await api<{ videos: Video[] }>("/api/videos")).videos);
      } catch {
        /* 다음에 다시 */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pending]);

  async function add(link = url) {
    const list = link.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x)).slice(0, 10);
    if (!list.length) return;
    setBusy(true);
    setErr("");
    try {
      for (const u of list) await api("/api/videos", "POST", { url: u, removeSubs });
      setUrl("");
      setVideos((await api<{ videos: Video[] }>("/api/videos")).videos);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              if (/^https?:\/\//.test(t.trim()) && !url) {
                e.preventDefault();
                void add(t);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="영상 링크 붙여넣기 (인스타 릴스·유튜브 쇼츠·틱톡 등) — 붙여넣으면 바로 시작"
            aria-label="영상 링크"
          />
          <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => add()}>{busy ? <span className="spinner" /> : "⬇️ 받기"}</button>
        </div>
        <label className="small row" style={{ gap: 6 }}>
          <input type="checkbox" checked={removeSubs} onChange={(e) => setRemoveSubs(e.target.checked)} /> 화면 자막 자동으로 지우기 (AI가 위치를 찾아 지움 · 원본도 함께 보관)
        </label>
        {storage === "db" && <div className="notice notice-warn small">지금은 저장소 키가 없어 임시로 DB에 보관 중이에요 (용량 작음). Supabase 저장소 키를 넣으면 거기에 보관돼요.</div>}
        {err && <div className="notice notice-bad small">{err}</div>}
      </section>

      {videos.length > 0 && (
        <div className="row between" style={{ gap: 8 }}>
          <label className="small row" style={{ gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={sel.length === videos.length} onChange={() => setSel(sel.length === videos.length ? [] : videos.map((v) => v.id))} /> 모두 선택{sel.length ? ` (${sel.length})` : ""}
          </label>
          <button className="btn btn-sm btn-danger" disabled={busy || !sel.length} onClick={() => trash(sel)}>🗑 휴지통으로{sel.length ? ` (${sel.length})` : ""}</button>
        </div>
      )}
      {note && <div className="notice small">{note} <Link href="/trash" style={{ color: "var(--accent)" }}>휴지통 보기</Link></div>}
      {videos.length ? (
        <div className="trend-grid">
          {videos.map((v) => (
            <Link key={v.id} href={`/videos/${v.id}`} className="card trend-card" style={sel.includes(v.id) ? { outline: "2px solid var(--accent)" } : undefined}>
              <div className="trend-thumb" style={{ aspectRatio: "9 / 16", maxHeight: 360, position: "relative" }}>
                <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(v.id); }} style={{ position: "absolute", bottom: 6, left: 6, zIndex: 2, background: "rgba(255,255,255,.9)", borderRadius: 6, padding: "5px 6px", lineHeight: 0, cursor: "pointer" }}>
                  <input type="checkbox" aria-label={`${v.title} 선택`} checked={sel.includes(v.id)} readOnly style={{ pointerEvents: "none" }} />
                </span>
                <button
                  type="button"
                  title="휴지통으로"
                  aria-label={`${v.title} 휴지통으로`}
                  disabled={busy}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void trash([v.id]); }}
                  style={{ position: "absolute", top: 6, right: 6, zIndex: 2, border: 0, background: "rgba(255,255,255,.9)", borderRadius: 6, padding: "3px 6px", cursor: "pointer" }}
                >
                  🗑
                </button>
                {v.thumb_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/videos/${v.id}/file?kind=thumb`} alt="" loading="lazy" />
                ) : (
                  <div className="trend-thumb-empty">{v.status === "error" ? "⚠️" : <span className="spinner" />}</div>
                )}
                <span className="trend-rank">{KIND[v.kind]}</span>
                {v.duration != null && <span className="trend-len">{dur(v.duration)}</span>}
              </div>
              <div className="trend-body">
                <p className="trend-title">{v.title}</p>
                <div className="tiny muted">
                  {v.status === "ready" ? <>{v.width}×{v.height} · {mb(v.size)}{v.info?.subsRemoved ? " · 자막 지움" : ""}</> : v.status === "error" ? <span style={{ color: "var(--bad)" }}>{v.message}</span> : <><span className="spinner" /> {v.message || "대기 중"}</>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty">아직 받은 영상이 없어요. 위에 링크를 붙여 넣어 보세요.</div>
      )}
    </div>
  );
}
