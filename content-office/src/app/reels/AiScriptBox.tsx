"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import BlogSourcePicker, { type BlogSource } from "./BlogSourcePicker";

type Est = { steps: { label: string; model: string; provider: string; usd: number | null }[]; total: number | null; counts: { videos: number; words: number; posts: number; hooks: number }; fields: { id: string; label: string }[] };
export type AiScript = { title: string; hook: string; lines: string[]; caption: string; hashtags: string[]; why: string; trends: string[]; model: string; substitutedFor?: string };

/** ✨ AI로 대본 만들기 — 저장된 트렌드를 넣어 Claude 최상위 모델로 대본 작성 (누를 때만, 예상 비용 확인 후) */
export default function AiScriptBox({ defaultTopic = "", onScript }: { defaultTopic?: string; onScript: (s: AiScript) => void }) {
  const [topic, setTopic] = useState(defaultTopic);
  const [field, setField] = useState("all");
  const [seconds, setSeconds] = useState(30);
  const [tone, setTone] = useState("");
  const [est, setEst] = useState<Est | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<AiScript | null>(null);
  const [mode, setMode] = useState<"trend" | "blog">("trend");
  const [src, setSrc] = useState<BlogSource | null>(null);

  useEffect(() => {
    let off = false;
    api<Est>(`/api/reels/script?field=${field}`).then((e) => { if (!off) setEst(e); }).catch(() => {});
    return () => { off = true; };
  }, [field]);

  const c = est?.counts;
  const trendNote = c ? (c.videos + c.words + c.posts + c.hooks ? `저장된 트렌드: 유튜브 ${c.videos} · 블로그 단어 ${c.words} · 인기글 ${c.posts} · 분석한 릴스 훅 ${c.hooks}` : "최근 3일 저장된 트렌드가 없어요 — 트렌드 뷰어·블로그 인기글을 한 번 열면 반영돼요") : "";
  const step = est?.steps[0];

  async function run() {
    const cost = est?.total != null ? fmtUsd(est.total) : "알 수 없음";
    if (!confirm(`AI 대본을 만들까요?\n모델: ${step?.model ?? "?"}\n예상 비용: 약 ${cost}\n(실제 청구는 조금 다를 수 있어요)`)) return;
    setBusy(true); setErr("");
    try {
      const r = await api<AiScript>("/api/reels/script", "POST", { topic, field, seconds, tone, source: src ?? undefined, confirm: true });
      setLast(r);
      onScript(r);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 6, border: "1px dashed var(--accent)", borderRadius: 10, padding: 8 }}>
      <b className="small">✨ AI로 대본 만들기</b>
      <div className="seg" role="tablist">
        <button className={mode === "trend" ? "on" : ""} onClick={() => { setMode("trend"); setSrc(null); }}>🔥 주제·트렌드로</button>
        <button className={mode === "blog" ? "on" : ""} onClick={() => setMode("blog")}>📝 내 블로그 글로</button>
      </div>
      {mode === "blog" && <BlogSourcePicker value={src} onPick={(s) => { setSrc(s); if (s && !topic.trim()) setTopic(s.title); }} />}
      {mode === "blog" && <span className="tiny muted">고른 글 내용으로만 대본을 써요(글에 없는 사실은 안 넣어요). 트렌드는 훅·말투에만 참고해요.</span>}
      <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={mode === "blog" ? "강조할 점 (선택)" : "주제 (비우면 요즘 트렌드에서 골라 줘요)"} aria-label="AI 대본 주제" />
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <select className="input" style={{ width: "auto" }} value={field} onChange={(e) => setField(e.target.value)} aria-label="트렌드 분야">
          {(est?.fields ?? [{ id: "all", label: "전체 트렌드" }]).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select className="input" style={{ width: "auto" }} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} aria-label="길이">
          {[15, 30, 45, 60].map((s) => <option key={s} value={s}>{s}초</option>)}
        </select>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="말투 (선택, 예: 친구한테 말하듯)" aria-label="말투" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm btn-primary" disabled={busy || (mode === "blog" && !src)} onClick={() => void run()}>{busy ? <><span className="spinner" /> 쓰는 중… (1분쯤)</> : "✨ 대본 만들기"}</button>
        <span className="tiny muted">{step ? `${step.model} · 약 ${est?.total != null ? fmtUsd(est.total) : "?"}` : ""}</span>
      </div>
      {trendNote && <span className="tiny muted">{trendNote}</span>}
      {err && <p className="notice notice-bad small">{err}</p>}
      {last && (
        <div className="tiny" style={{ lineHeight: 1.5 }}>
          {last.substitutedFor && <p className="notice small">담당 AI({last.substitutedFor})를 못 써서 {last.model}로 대신 썼어요.</p>}
          {last.why && <div>💡 {last.why}</div>}
          {last.trends.length > 0 && <div className="muted">참고한 트렌드: {last.trends.join(" · ")}</div>}
          {last.caption && (
            <details>
              <summary>캡션·해시태그</summary>
              <textarea className="textarea" readOnly style={{ minHeight: 80 }} value={`${last.caption}\n\n${last.hashtags.join(" ")}`} aria-label="AI 캡션" />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
