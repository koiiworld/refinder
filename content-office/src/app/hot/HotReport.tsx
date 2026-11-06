"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";
import type { HotReport } from "@/lib/hot-report";

const STEPS = [
  ["🌐", "실시간 이슈 수집", "구글 트렌드 · 네이버 뉴스 · 블로그 홈 인기 글"],
  ["🧠", "AI 분석·검증", "중복 제거 · 이슈 시점 · 출처 확인 · 화제성"],
  ["📋", "글감 추천 리포트", "추천 제목 · 원출처 링크 · 선정 이유 · 콘텐츠 방향"],
  ["✅", "내가 승인 → 글 작성", "승인한 글감만 ③ 제목 추천부터 시작"],
] as const;

export default function HotReportView({ blogs }: { blogs: { id: string; name: string; color: string }[] }) {
  const router = useRouter();
  const [blogId, setBlogId] = useState(blogs[0]?.id ?? "");
  const [r, setR] = useState<HotReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [kw, setKw] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!blogId) return;
    setLoading(true);
    setErr("");
    api<HotReport | null>(`/api/hot?blogId=${blogId}`).then((x) => setR(x)).catch((e) => setErr((e as Error).message)).finally(() => setLoading(false));
  }, [blogId]);

  async function make() {
    setBusy("report");
    setErr("");
    try {
      setR(await api<HotReport>("/api/hot", "POST", { blogId }));
      setKw({});
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }
  async function approve(i: number) {
    if (!r) return;
    setBusy(`a${i}`);
    try {
      const x = await api<{ projectId: string }>("/api/hot", "POST", { action: "approve", reportId: r.id, index: i, keyword: kw[i] });
      router.push(`/posts/${x.projectId}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }
  async function skip(i: number) {
    if (!r) return;
    await api("/api/hot", "POST", { action: "skip", reportId: r.id, index: i });
    setR({ ...r, items: r.items.map((it, k) => (k === i ? { ...it, status: "skipped" } : it)) });
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15 }}>📋 블로그 글감 추천 리포트</h2>
        <div className="row" style={{ gap: 6 }}>
          <select className="input" value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그" style={{ maxWidth: 200 }}>
            {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!!busy || !blogId} onClick={make}>{busy === "report" ? <><span className="spinner" /> 수집·분석 중… (30초쯤)</> : r ? "🔄 새 리포트" : "📋 리포트 만들기"}</button>
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div className="hot-flow">
          {STEPS.map(([icon, t, d], i) => (
            <div key={t} className={`hot-step ${i === 3 ? "last" : ""}`}>
              <div style={{ fontSize: 20 }}>{icon}</div>
              <b className="small">{t}</b>
              <span className="tiny muted">{d}</span>
            </div>
          ))}
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}
        {loading && <div className="small muted"><span className="spinner" /> 불러오는 중…</div>}
        {!loading && !r && <p className="small muted" style={{ margin: 0 }}>아직 리포트가 없어요. &apos;리포트 만들기&apos;를 누르면 지금 뜨는 이슈를 모아 이 블로그에 맞는 글감을 추천해요. AI 비용은 한 번에 몇십 원 정도예요.</p>}
        {r && (
          <>
            <div className="tiny muted">
              {fmtDate(r.at)} · 모은 이슈 {Object.entries(r.collected).map(([k, v]) => `${k} ${v}`).join(" · ")}{r.ai && ` · ${r.ai.provider}/${r.ai.model}`}
              {!!r.errors.length && <div style={{ color: "var(--warn, #b26b00)" }}>일부 못 모음: {r.errors.join(" / ")}</div>}
            </div>
            {!r.items.length && <p className="small muted">이번엔 이 블로그에 맞는 글감을 찾지 못했어요. 잠시 뒤 다시 만들어 보세요.</p>}
            <div className="hot-report">
              {r.items.map((it, i) => (
                <div key={i} className="card card-pad stack" style={{ gap: 6, padding: 12, opacity: it.status === "skipped" ? 0.45 : 1 }}>
                  <div className="row between" style={{ flexWrap: "nowrap" }}>
                    <span className="tiny muted">{it.issue}</span>
                    <span className="tiny" title="화제성">{"🔥".repeat(it.hotness)} {it.timing && <span className="badge">{it.timing}</span>}</span>
                  </div>
                  <b className="small">{it.title}</b>
                  <div className="tiny"><b>선정 이유</b> · {it.why}</div>
                  <div className="tiny"><b>콘텐츠 방향</b> · {it.direction}</div>
                  <div className="tiny stack" style={{ gap: 2 }}>
                    {it.sources.slice(0, 4).map((s, k) => (
                      <a key={k} href={s.url} target="_blank" rel="noreferrer" className="ellipsis" style={{ color: "var(--accent)" }}>🔗 [{s.source}] {s.title}</a>
                    ))}
                  </div>
                  {it.status === "approved" ? (
                    <a href={`/posts/${it.projectId}`} className="btn btn-sm">✅ 승인함 · 글 보러 가기</a>
                  ) : it.status === "skipped" ? (
                    <span className="tiny muted">넘김</span>
                  ) : (
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <input className="input" style={{ fontSize: 13 }} value={kw[i] ?? it.keyword} onChange={(e) => setKw({ ...kw, [i]: e.target.value })} aria-label="메인 키워드" title="메인 키워드 (고쳐도 돼요)" />
                      <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => approve(i)}>{busy === `a${i}` ? <span className="spinner" /> : "✅ 이걸로 쓰기"}</button>
                      <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => skip(i)}>넘기기</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>&apos;이걸로 쓰기&apos;를 누르면 이 기획(이슈·추천 제목·방향·원출처)을 담아 ③ 제목 추천까지만 진행해요. 제목을 고르고 &apos;글 쓰기&apos;를 눌러야 글이 써져요.</p>
          </>
        )}
      </div>
    </section>
  );
}
