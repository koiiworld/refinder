"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Modal } from "@/components/client-utils";
import type { StudyReel } from "@/lib/reel-study";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default function StudyBoard({ initial, categories }: { initial: StudyReel[]; categories: string[] }) {
  const [list, setList] = useState(initial);
  const [urls, setUrls] = useState("");
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("전체");
  const [open, setOpen] = useState<StudyReel | null>(null);
  const working = list.some((s) => s.status === "queued" || s.status === "running");

  useEffect(() => {
    if (!working) return;
    const t = setInterval(async () => {
      const x = await api<StudyReel[]>("/api/study").catch(() => null);
      if (x) setList(x);
    }, 5000);
    return () => clearInterval(t);
  }, [working]);

  async function add() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/study", "POST", { urls: urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u)), mine });
      setUrls("");
      setList(await api<StudyReel[]>("/api/study"));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of list) m[s.category || "분석 중"] = (m[s.category || "분석 중"] ?? 0) + 1;
    return m;
  }, [list]);
  const shown = list.filter((s) => cat === "전체" || (s.category || "분석 중") === cat);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <b>링크 넣기 <span className="tiny muted">(한 줄에 하나, 최대 20개 · 인스타 릴스·유튜브 쇼츠)</span></b>
        <textarea className="textarea" rows={3} value={urls} placeholder={"https://www.instagram.com/reel/...\nhttps://youtube.com/shorts/..."} onChange={(e) => setUrls(e.target.value)} aria-label="릴스 주소" />
        <div className="row" style={{ gap: 8 }}>
          <div className="seg">
            <button className={!mine ? "on" : ""} onClick={() => setMine(false)}>참고 릴스 (왜 잘 됐나)</button>
            <button className={mine ? "on" : ""} onClick={() => setMine(true)}>내 릴스 (첫 3초·고칠 점)</button>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !urls.trim()} onClick={add}>{busy ? <span className="spinner" /> : "🔍 분석 시작"}</button>
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}
        <span className="tiny muted">받기·받아쓰기·사진 뽑기는 맥에서 해요. 맥이 꺼져 있으면 켜질 때 시작돼요. 받은 영상은 영상공장에도 남아서 릴스 편집기로 바로 열 수 있어요.</span>
      </section>

      <div className="row" style={{ gap: 6 }}>
        {["전체", ...categories.filter((c) => counts[c]), ...(counts["분석 중"] ? ["분석 중"] : [])].map((c) => (
          <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c} {c === "전체" ? list.length : counts[c]}</button>
        ))}
      </div>

      <div className="study-grid">
        {shown.map((s) => (
          <button key={s.id} className="study-card" onClick={() => setOpen(s)}>
            <div className="study-thumb">
              {s.frames[0] ? <img src={`/api/img/${s.frames[0].img}.jpg`} alt="" /> : <span className="tiny muted">{s.status === "error" ? "⚠️" : <span className="spinner" />}</span>}
              {s.mine && <span className="badge badge-accent study-mine">내 릴스</span>}
              {s.analysis.hook && <span className="study-score">첫 3초 {s.analysis.hook.score}/10</span>}
            </div>
            <span className="small strong ellipsis">{s.title || s.url}</span>
            <span className="tiny muted ellipsis">{s.status === "done" ? `${s.category} · ${s.analysis.format ?? ""}` : s.status === "error" ? `⚠️ ${s.message}` : s.message}</span>
          </button>
        ))}
        {!shown.length && <div className="card empty">아직 분석한 릴스가 없어요.</div>}
      </div>

      {open && (
        <Modal title={open.title || "릴스 분석"} onClose={() => setOpen(null)}>
          <StudyDetail s={open} categories={categories} onChange={(x) => { setOpen(x); setList(list.map((y) => (y.id === x.id ? x : y))); }} onDelete={() => { setList(list.filter((y) => y.id !== open.id)); setOpen(null); }} />
        </Modal>
      )}
    </div>
  );
}

function StudyDetail({ s, categories, onChange, onDelete }: { s: StudyReel; categories: string[]; onChange: (s: StudyReel) => void; onDelete: () => void }) {
  const a = s.analysis;
  const studioPrompt = `이 구조를 참고해서 내 채널용 쇼츠를 기획해 줘.\n구조: ${(a.structure ?? []).map((x) => `${x.t} ${x.part} - ${x.desc}`).join(" / ")}\n적용 아이디어: ${(a.apply ?? []).join(" / ")}`;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between" style={{ gap: 6 }}>
        <a className="tiny" href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>원본 열기 ↗</a>
        <div className="row" style={{ gap: 6 }}>
          <select className="select" style={{ width: 130 }} value={s.category} onChange={async (e) => onChange(await api<StudyReel>(`/api/study/${s.id}`, "PUT", { category: e.target.value }))} aria-label="카테고리">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          {s.video_id && <a className="btn btn-sm" href={`/reels?from=${s.video_id}`}>✂️ 편집기로</a>}
          {s.status === "done" && <a className="btn btn-sm" href={`/studio?prompt=${encodeURIComponent(studioPrompt.slice(0, 1500))}`}>🎬 이 구조로 기획</a>}
          <button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm("휴지통으로 옮길까요? (30일 안에 되살릴 수 있어요)")) { await api(`/api/study/${s.id}`, "DELETE"); onDelete(); } }}>🗑</button>
        </div>
      </div>
      {s.status !== "done" && <div className="notice small">{s.status === "error" ? `⚠️ ${s.message}` : s.message || "기다리는 중"}</div>}
      {a.summary && <p className="small"><b>요약</b> · {a.summary}</p>}
      {a.hook && (
        <div className="card card-pad stack" style={{ gap: 4 }}>
          <b className="small">첫 3초 · {a.hook.score}/10</b>
          <span className="small">{a.hook.text}</span>
          <span className="tiny muted">{a.hook.verdict}</span>
        </div>
      )}
      <div className="study-frames">
        {s.frames.map((f) => {
          const d = a.scenes?.find((x) => Math.abs(Number(x.t) - f.t) < 0.6);
          return (
            <figure key={f.img}>
              <img src={`/api/img/${f.img}.jpg`} alt="" />
              <figcaption className="tiny"><b>{fmt(f.t)}</b>{f.first ? " · 첫 3초" : ""}{d ? ` · ${d.desc}` : ""}</figcaption>
            </figure>
          );
        })}
      </div>
      {!!a.structure?.length && (
        <div className="stack" style={{ gap: 4 }}>
          <b className="small">구조</b>
          {a.structure.map((x, i) => <span key={i} className="small"><b>{x.t}</b> {x.part} — {x.desc}</span>)}
        </div>
      )}
      {[["잘 된 이유", a.whyWorks], ["고칠 점", a.improve], ["내 채널에 적용", a.apply]].map(([t, l]) => (l as string[] | undefined)?.length ? (
        <div key={t as string} className="stack" style={{ gap: 2 }}>
          <b className="small">{t as string}</b>
          {(l as string[]).map((x, i) => <span key={i} className="small">• {x}</span>)}
        </div>
      ) : null)}
      {!!s.transcript.length && (
        <details>
          <summary className="small strong" style={{ cursor: "pointer" }}>받아쓰기 ({s.transcript.length}문장)</summary>
          <div className="stack" style={{ gap: 2, marginTop: 6 }}>
            {s.transcript.map((x, i) => <span key={i} className="tiny"><b>{fmt(x.start)}</b> {x.text}</span>)}
          </div>
        </details>
      )}
    </div>
  );
}
