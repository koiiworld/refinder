"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

/** + 새 프로젝트: 빈 편집기로 바로 시작 (대본을 붙여넣으면 한 줄 = 장면 + 자막) — 영상·사진·음악은 편집기 '내 파일'에서 */
export default function NewReel({ fromVideo }: { fromVideo?: { id: string; title: string } | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function start() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ id: string }>("/api/reels", "POST", { blank: true, title: title.trim(), script, videoId: fromVideo?.id });
      router.push(`/reels/${r.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <b>+ 새 프로젝트{fromVideo ? ` · 🎞 ${fromVideo.title.slice(0, 30)} 영상으로` : ""}</b>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (예: 클로드로 릴스 보기)" aria-label="제목" />
      <textarea className="textarea" style={{ minHeight: 120 }} value={script} onChange={(e) => setScript(e.target.value)} placeholder={"대본 (선택) — 한 줄에 자막 하나\n예)\n클로드도 릴스를 봐요\n이 3개만 깔면 끝\n링크 주고 \"설치해줘\" 한마디면 됨"} aria-label="대본" />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>{busy ? <span className="spinner" /> : "편집기 열기"}</button>
        <span className="tiny muted">대본이 없으면 빈 편집기로 열려요. 영상·사진·음악은 편집기 왼쪽 &apos;내 파일&apos;에서 올려요.</span>
      </div>
      {err && <p className="notice notice-bad small">{err}</p>}
    </section>
  );
}
