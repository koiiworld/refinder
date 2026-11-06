"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

type V = { id: string; title: string; duration: number | null; thumb: boolean; kind: string };

/** 새 릴스 편집: 영상공장 영상 고르기 또는 내 영상 올리기 */
export default function NewReel({ videos, defaultId }: { videos: V[]; defaultId?: string }) {
  const router = useRouter();
  const [pick, setPick] = useState(defaultId ?? "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function start(id: string) {
    setBusy("start");
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/reels", "POST", { videoId: id });
      router.push(`/reels/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }
  function upload(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const x = new XMLHttpRequest();
    x.open("POST", "/api/videos/upload");
    setBusy("올리는 중 0%");
    x.upload.onprogress = (e) => e.lengthComputable && setBusy(`올리는 중 ${Math.round((e.loaded / e.total) * 100)}%`);
    x.onload = () => {
      try {
        const r = JSON.parse(x.responseText);
        if (x.status >= 400) throw new Error(r.error ?? "올리기 실패");
        void start(r.id);
      } catch (e) {
        setErr((e as Error).message);
        setBusy("");
      }
    };
    x.onerror = () => { setErr("올리기 중 연결이 끊겼어요."); setBusy(""); };
    x.send(fd);
  }

  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <b>새 릴스 편집</b>
      <div className="row" style={{ gap: 8 }}>
        <label className="btn btn-sm">
          📁 내 영상 올리기
          <input type="file" accept="video/*" hidden disabled={!!busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <span className="tiny muted">또는 영상공장에 있는 영상을 고르세요 · <Link href="/videos" style={{ color: "var(--accent)" }}>링크로 받기</Link></span>
      </div>
      <div className="reel-files wide">
        {videos.map((v) => (
          <button key={v.id} className={`reel-file${pick === v.id ? " on" : ""}`} onClick={() => setPick(v.id)}>
            {v.thumb ? <img src={`/api/videos/${v.id}/file?kind=thumb`} alt="" /> : <span className="reel-file-ph">🎞</span>}
            <span className="tiny ellipsis">{v.title}</span>
            {v.duration != null && <span className="tiny muted">{Math.round(v.duration)}초</span>}
          </button>
        ))}
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!pick || !!busy} onClick={() => start(pick)}>{busy ? <><span className="spinner" /> {busy === "start" ? "시작하는 중" : busy}</> : "✂️ 이 영상으로 편집 시작"}</button>
      <span className="tiny muted">시작하면 맥이 말을 받아써 장면·자막 초안을 만들어요 (47초 영상 기준 약 20초, 처음 한 번은 모델을 받느라 더 걸려요). 맥이 꺼져 있으면 켜질 때 시작돼요.</span>
    </section>
  );
}
