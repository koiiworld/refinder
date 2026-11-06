"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";

type Ch = { id: string; label: string; hint: string };

/** 📣 이 글로 다른 채널 콘텐츠 만들기 (고른 채널만, AI 1회) */
export default function RepurposeCard({ projectId, channels, copy }: { projectId: string; channels: Ch[]; copy: (t: string, w: string) => void }) {
  const [res, setRes] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string[]>(["reel", "cards", "threads", "insta"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Record<string, string>>(`/api/posts/${projectId}/repurpose`).then(setRes).catch(() => {});
  }, [projectId]);
  async function make() {
    setBusy(true);
    setErr("");
    try {
      setRes(await api<Record<string, string>>(`/api/posts/${projectId}/repurpose`, "POST", { channels: pick }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const done = channels.filter((c) => res[c.id]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">공들여 쓴 글 하나로 다른 채널 초안까지 만들어요. 필요한 것만 골라 누르세요 (AI 1회, 저렴한 모델). 원문에 없는 사실은 넣지 않아요.</p>
      <div className="repurpose-pick">
        {channels.map((c) => (
          <label key={c.id} className={`chip${pick.includes(c.id) ? " on" : ""}`} title={c.hint}>
            <input type="checkbox" hidden checked={pick.includes(c.id)} onChange={() => setPick(pick.includes(c.id) ? pick.filter((x) => x !== c.id) : [...pick, c.id])} />
            {c.label}{res[c.id] ? " ✓" : ""}
          </label>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy || !pick.length} onClick={make}>{busy ? <><span className="spinner" /> 만드는 중… (20~60초)</> : `📣 ${pick.length}개 채널 초안 만들기`}</button>
      {err && <div className="notice notice-bad small">{err}</div>}
      {done.map((c) => (
        <details key={c.id} className="card card-pad" open={done.length <= 2}>
          <summary className="small strong" style={{ cursor: "pointer" }}>{c.label}</summary>
          <pre className="repurpose-text">{res[c.id]}</pre>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => copy(res[c.id], c.label)}>복사</button>
            {c.id === "reel" && <a className="btn btn-sm" href={`/studio?prompt=${encodeURIComponent(res[c.id].slice(0, 1500))}`}>🎬 영상 스튜디오로</a>}
            {c.id === "cards" && <a className="btn btn-sm" href={`/carousels?from=${projectId}`}>📱 캐러셀로 만들기</a>}
          </div>
        </details>
      ))}
    </div>
  );
}
