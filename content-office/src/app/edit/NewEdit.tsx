"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

/** 새 편집: 영상공장 영상 여러 개 골라 순서대로 · 또는 내 영상 올리기 */
export default function NewEdit({ videos }: { videos: { id: string; title: string; duration: number | null; thumb: boolean }[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function start(ids: string[]) {
    setBusy("start");
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/edit", "POST", { videoIds: ids, title: videos.find((v) => v.id === ids[0])?.title });
      router.push(`/edit/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }
  async function upload(f: File) {
    setBusy("올리는 중…");
    const fd = new FormData();
    fd.append("file", f);
    const r = await (await fetch("/api/videos/upload", { method: "POST", body: fd })).json().catch(() => ({}));
    if (!r.id) { setErr(r.error ?? "올리기 실패"); setBusy(""); return; }
    await start([r.id]);
  }
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <b>새 프로젝트</b>
      <div className="row" style={{ gap: 8 }}>
        <label className="btn btn-sm">📁 내 영상 올리기<input type="file" accept="video/*" hidden disabled={!!busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => start([])}>빈 프로젝트</button>
        <span className="tiny muted">또는 영상공장 영상을 순서대로 고르세요 (여러 개 가능)</span>
      </div>
      <div className="reel-files wide">
        {videos.map((v) => {
          const n = pick.indexOf(v.id);
          return (
            <button key={v.id} className={`reel-file${n >= 0 ? " on" : ""}`} onClick={() => setPick(n >= 0 ? pick.filter((x) => x !== v.id) : [...pick, v.id])}>
              {v.thumb ? <img src={`/api/videos/${v.id}/file?kind=thumb`} alt="" /> : <span className="reel-file-ph">🎞</span>}
              <span className="tiny ellipsis">{n >= 0 ? `${n + 1}. ` : ""}{v.title}</span>
              {v.duration != null && <span className="tiny muted">{Math.round(v.duration)}초</span>}
            </button>
          );
        })}
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!pick.length || !!busy} onClick={() => start(pick)}>{busy ? <><span className="spinner" /> {busy === "start" ? "여는 중" : busy}</> : `🎞 ${pick.length}개로 편집 시작`}</button>
    </section>
  );
}
