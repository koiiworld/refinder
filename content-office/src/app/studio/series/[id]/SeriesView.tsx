"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import type { Series } from "@/lib/series";

export default function SeriesView({ initial }: { initial: Series }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chars, setChars] = useState(initial.characters);
  const [edit, setEdit] = useState<Record<number, string>>({});
  const pending = s.episodes.some((e) => !e.studioId) && busy === "" && msg?.text.includes("걸어");

  // 걸어둔 뒤에는 영상 기획이 생기는지 새로고침
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => setS(await api<Series>(`/api/series/${s.id}`)), 6000);
    return () => clearInterval(t);
  }, [pending, s.id]);

  async function act(key: string, body: Record<string, unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await api<Series & { series?: Series; queued?: number }>(`/api/series/${s.id}`, "POST", body);
      setS(r.series ?? r);
      setMsg({ ok: true, text: r.queued != null ? `${r.queued}화를 대기열에 걸어 뒀어요. 차례로 영상 기획이 만들어져요.` : ok ?? "완료" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="small"><b>주인공</b> {s.hero}{s.friend ? <> · <b>친구</b> {s.friend}</> : null} · <b>주제</b> {s.theme}</div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small strong">캐릭터 생김새 문장 <span className="tiny muted">(모든 화·모든 장면 프롬프트 맨 앞에 똑같이 들어가요)</span></span>
          <textarea className="textarea mono" rows={3} style={{ fontSize: 12 }} value={chars} onChange={(e) => setChars(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 6 }}>
          {chars !== s.characters && <button className="btn btn-sm" disabled={!!busy} onClick={() => act("chars", { action: "characters", text: chars }, "캐릭터 문장을 저장했어요. 이후 만드는 화부터 적용돼요.")}>저장</button>}
          <button className="btn btn-sm" disabled={!!busy} onClick={() => act("cont", { action: "continue", count: 5 }, "다음 5화를 이어서 만들었어요.")}>{busy === "cont" ? <span className="spinner" /> : `➕ ${(s.episodes.at(-1)?.n ?? 0) + 1}~${(s.episodes.at(-1)?.n ?? 0) + 5}화 이어서`}</button>
          <button className="btn btn-primary btn-sm" disabled={!!busy || s.episodes.every((e) => e.studioId)} onClick={() => act("queue", { action: "queue" })} title="아직 안 만든 화를 영상 스튜디오 기획으로 차례로 만들어 둬요 (텍스트 AI만, 이미지·영상은 나중에 버튼)">{busy === "queue" ? <span className="spinner" /> : "🌙 남은 화 모두 영상 기획 걸어두기"}</button>
        </div>
        {msg && <div className={`notice small ${msg.ok ? "" : "notice-bad"}`}>{msg.text}</div>}
      </section>

      {s.episodes.map((e) => (
        <section key={e.n} className="card card-pad stack" style={{ gap: 6 }}>
          <div className="row between" style={{ flexWrap: "nowrap" }}>
            <b>{e.n}화 · {e.title}</b>
            {e.studioId ? <Link className="btn btn-sm" href={`/studio/${e.studioId}`}>🎬 영상 만들기 →</Link> : <button className="btn btn-sm" disabled={!!busy} onClick={() => act(`q${e.n}`, { action: "queue", ns: [e.n] })}>{busy === `q${e.n}` ? <span className="spinner" /> : "🎬 이 화 영상 기획"}</button>}
          </div>
          <div className="small" style={{ whiteSpace: "pre-line" }}>{e.synopsis}</div>
          <details>
            <summary className="tiny muted" style={{ cursor: "pointer" }}>장면 프롬프트 · 유튜브 설명</summary>
            <pre className="repurpose-text">{e.scenePrompt}</pre>
            <div className="tiny" style={{ whiteSpace: "pre-line" }}>{e.description}</div>
          </details>
          <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
            <input className="input" value={edit[e.n] ?? ""} placeholder="고칠 점 (예: 장면 프롬프트를 더 단순하게, 동작은 하나만)" onChange={(x) => setEdit({ ...edit, [e.n]: x.target.value })} aria-label={`${e.n}화 고칠 점`} />
            <button className="btn btn-sm" disabled={!!busy || !edit[e.n]?.trim()} onClick={async () => { await act(`e${e.n}`, { action: "edit", n: e.n, request: edit[e.n] }, `${e.n}화를 고쳤어요.`); setEdit({ ...edit, [e.n]: "" }); }}>{busy === `e${e.n}` ? <span className="spinner" /> : "✏️ 고치기"}</button>
          </div>
        </section>
      ))}
    </div>
  );
}
