"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

/** 📺 시리즈로 만들기: 주인공·친구·주제 → N화 한 번에 */
export default function NewSeries({ styles, list }: { styles: { id: string; label: string }[]; list: { id: string; title: string; count: number; made: number }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ hero: "", friend: "", theme: "", style: "3d", count: 5 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function make() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/series", "POST", f);
      router.push(`/studio/series/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <details className="card card-pad" style={{ marginBottom: 16 }}>
      <summary className="small strong" style={{ cursor: "pointer" }}>📺 시리즈로 만들기 (같은 캐릭터로 여러 화) {list.length ? `· ${list.length}개` : ""}</summary>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <p className="tiny muted">대본을 한 화씩 따로 시키지 않고 한 번에 받아요. 캐릭터 생김새 문장을 모든 화의 장면 프롬프트에 똑같이 넣어서 화가 바뀌어도 같은 캐릭터로 나와요. 한 장면에 동작은 하나만 넣어요.</p>
        <div className="todo-fields">
          <label className="small stack" style={{ gap: 2 }}>주인공<input className="input" value={f.hero} placeholder="오렌지색 털의 작은 곰" onChange={(e) => setF({ ...f, hero: e.target.value })} /></label>
          <label className="small stack" style={{ gap: 2 }}>친구 (선택)<input className="input" value={f.friend} placeholder="작은 빨간 개구리" onChange={(e) => setF({ ...f, friend: e.target.value })} /></label>
          <label className="small stack" style={{ gap: 2 }}>주제<input className="input" value={f.theme} placeholder="나누기를 배우는 이야기" onChange={(e) => setF({ ...f, theme: e.target.value })} /></label>
          <label className="small stack" style={{ gap: 2 }}>그림체 · 화 수
            <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
              <select className="select" value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })}>{styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              <select className="select" style={{ width: 80 }} value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })}>{[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}화</option>)}</select>
            </div>
          </label>
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy || !f.hero.trim() || !f.theme.trim()} onClick={make}>{busy ? <><span className="spinner" /> 시리즈 쓰는 중… (30초~1분)</> : `📺 ${f.count}화 한 번에 만들기`}</button>
        {list.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="tiny strong">내 시리즈</span>
            {list.map((s) => <Link key={s.id} href={`/studio/series/${s.id}`} className="small" style={{ color: "var(--accent)" }}>{s.title} · {s.count}화 (영상 기획 {s.made}개)</Link>)}
          </div>
        )}
      </div>
    </details>
  );
}
