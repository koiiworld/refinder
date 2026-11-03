"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Idea, Source } from "@/lib/types";
import { fmtDate } from "@/components/ui";
import { api, useToast } from "@/components/client-utils";

type BlogLite = { id: string; name: string; color: string; category: string };
type Snapshot = { id: string; source: string; query: { keywords: string[]; startDate: string; endDate: string; timeUnit: string }; data: { results?: { title: string; data: { period: string; ratio: number }[] }[] }; collected_at: string };
type JobRow = { id: string; blog_id: string; status: string; error: string | null; created_at: string };

export default function ResearchLab({ blogs, ideas, snapshots, jobs, naver, aiConnected, naverAd, youtube }: { blogs: BlogLite[]; ideas: Idea[]; snapshots: Snapshot[]; jobs: JobRow[]; naver: boolean; aiConnected: boolean; naverAd: boolean; youtube: boolean }) {
  const router = useRouter();
  const [blogId, setBlogId] = useState<string>("all");
  const [status, setStatus] = useState<"new" | "approved" | "rejected">("new");
  const [toast, setToast] = useToast();
  const blogMap = Object.fromEntries(blogs.map((b) => [b.id, b]));
  const filtered = ideas.filter((i) => (blogId === "all" || i.blog_id === blogId) && i.status === status);
  const activeJob = jobs.find((j) => j.status === "queued" || j.status === "running");

  // AI 글감 추천 작업 진행 중이면 갱신
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [activeJob, router]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <button className={`btn btn-sm ${blogId === "all" ? "btn-primary" : ""}`} onClick={() => setBlogId("all")}>전체</button>
        {blogs.map((b) => (
          <button key={b.id} className={`btn btn-sm ${blogId === b.id ? "btn-primary" : ""}`} onClick={() => setBlogId(b.id)}>
            <span className="blog-dot" style={{ background: b.color }} /> {b.name}
          </button>
        ))}
      </div>

      <div className="grid grid-2">
        <AddIdea blogs={blogs} defaultBlog={blogId === "all" ? blogs[0]?.id : blogId} onDone={() => { setToast("글감을 등록했습니다."); router.refresh(); }} />
        <SuggestIdeas blogs={blogs} defaultBlog={blogId === "all" ? blogs[0]?.id : blogId} aiConnected={aiConnected} activeJob={!!activeJob} lastJob={jobs[0]} onDone={() => { setToast("AI 글감 추천을 시작했습니다."); router.refresh(); }} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>글감 보관함</h2>
          <div className="row" style={{ gap: 4 }}>
            {(["new", "approved", "rejected"] as const).map((s) => (
              <button key={s} className={`btn btn-sm ${status === s ? "btn-primary" : ""}`} onClick={() => setStatus(s)}>
                {{ new: "검토 대기", approved: "승인됨", rejected: "보류" }[s]} ({ideas.filter((i) => (blogId === "all" || i.blog_id === blogId) && i.status === s).length})
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          {filtered.map((i) => (
            <IdeaItem key={i.id} idea={i} blog={blogMap[i.blog_id]} onChange={(m) => { if (m) setToast(m); router.refresh(); }} />
          ))}
          {!filtered.length && <div className="empty">글감이 없습니다.</div>}
        </div>
      </section>

      <div className="grid grid-2">
        <KeywordVolumeBox connected={naverAd} blogs={blogs} onDone={() => { setToast("글감 보관함에 추가했습니다."); router.refresh(); }} />
        <YoutubeBox connected={youtube} />
      </div>

      <div className="grid grid-2">
        <CompetitorCheck />
        <TrendBox naver={naver} blogs={blogs} snapshots={snapshots} onDone={() => router.refresh()} />
      </div>
      {toast}
    </div>
  );
}

function IdeaItem({ idea, blog, onChange }: { idea: Idea; blog?: BlogLite; onChange: (msg?: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const call = async (payload: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      const r = await api<{ projectId?: string }>(`/api/ideas/${idea.id}`, "PATCH", payload);
      if (r.projectId) {
        router.push(`/projects/${r.projectId}`);
        return;
      }
      onChange(msg);
    } catch (e) {
      onChange((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="list-item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ width: "100%", flexWrap: "nowrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="자세히">{open ? "▾" : "▸"}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="strong wrap-any">{idea.title}</div>
          <div className="row tiny muted">
            {blog && <><span className="blog-dot" style={{ background: blog.color }} />{blog.name} ·</>}
            <span className={`badge ${idea.origin === "ai" ? "badge-accent" : ""}`}>{idea.origin === "ai" ? "AI 제안" : "직접 등록"}</span>
            {fmtDate(idea.created_at)} · 출처 {idea.sources.length}건
          </div>
        </div>
      </div>
      {open && (
        <div className="stack" style={{ width: "100%", paddingLeft: 40, gap: 8 }}>
          {idea.memo && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{idea.memo}</p>}
          {!!idea.keywords.length && <div className="row">{idea.keywords.map((k) => <span key={k} className="badge">{k}</span>)}</div>}
          <div className="tiny muted">{idea.origin_detail}</div>
          {idea.sources.map((s: Source) => (
            <div key={s.url} className="small wrap-any">
              <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{s.title}</a>
              <span className="tiny muted"> · 수집 {fmtDate(s.collected_at)}{s.fetched ? "" : " (정보 수집 실패)"}</span>
            </div>
          ))}
          {idea.status === "new" && (
            <div className="row">
              <input className="input" style={{ flex: "1 1 200px" }} placeholder="참고 URL 추가" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn btn-sm" disabled={!url || busy} onClick={() => { void call({ action: "add_source", url }, "출처를 추가했습니다."); setUrl(""); }}>추가</button>
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ paddingLeft: 40 }}>
        {idea.status === "new" && (
          <>
            <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => call({ action: "approve" })}>{busy ? <span className="spinner" /> : "주제 승인 → 기획 시작"}</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => call({ action: "reject" }, "보류했습니다.")}>보류</button>
          </>
        )}
        {idea.status === "rejected" && <button className="btn btn-sm" onClick={() => call({ action: "reopen" }, "검토 대기로 돌렸습니다.")}>다시 검토</button>}
        {idea.project_id && <Link className="btn btn-sm" href={`/projects/${idea.project_id}`}>프로젝트 보기</Link>}
        {!idea.project_id && (
          <button className="btn btn-sm btn-ghost btn-danger" onClick={async () => { if (confirm("삭제할까요?")) { await api(`/api/ideas/${idea.id}`, "DELETE"); onChange("삭제했습니다."); } }}>삭제</button>
        )}
      </div>
    </div>
  );
}

function AddIdea({ blogs, defaultBlog, onDone }: { blogs: BlogLite[]; defaultBlog?: string; onDone: () => void }) {
  const [blogId, setBlogId] = useState(defaultBlog ?? "");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [kw, setKw] = useState("");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setBlogId(defaultBlog ?? ""), [defaultBlog]);
  return (
    <section className="card card-pad stack">
      <h2 style={{ fontSize: 15 }}>글감 직접 등록</h2>
      <select className="select" value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그">
        {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <input className="input" placeholder="글감 제목 *" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="textarea" placeholder="메모 (경험, 아이디어 등)" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ minHeight: 60 }} />
      <input className="input" placeholder="키워드 (쉼표 구분)" value={kw} onChange={(e) => setKw(e.target.value)} />
      <textarea className="textarea" placeholder="참고·경쟁 콘텐츠 URL (줄바꿈 구분)" value={urls} onChange={(e) => setUrls(e.target.value)} style={{ minHeight: 56 }} />
      {err && <div className="notice notice-bad small">{err}</div>}
      <button
        className="btn btn-primary"
        disabled={busy || !title.trim()}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await api("/api/ideas", "POST", { blogId, title, memo, keywords: kw.split(",").map((s) => s.trim()).filter(Boolean), urls: urls.split(/\s+/).filter(Boolean) });
            setTitle(""); setMemo(""); setKw(""); setUrls("");
            onDone();
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? <span className="spinner" /> : "등록"}
      </button>
    </section>
  );
}

function SuggestIdeas({ blogs, defaultBlog, aiConnected, activeJob, lastJob, onDone }: { blogs: BlogLite[]; defaultBlog?: string; aiConnected: boolean; activeJob: boolean; lastJob?: JobRow; onDone: () => void }) {
  const [blogId, setBlogId] = useState(defaultBlog ?? "");
  const [hint, setHint] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => setBlogId(defaultBlog ?? ""), [defaultBlog]);
  return (
    <section className="card card-pad stack">
      <h2 style={{ fontSize: 15 }}>AI 글감 추천</h2>
      <p className="small muted">블로그 주제·문체·기존 글감을 바탕으로 AI가 글감을 제안합니다. 검색량·경쟁도 같은 수치는 만들지 않습니다.</p>
      {!aiConnected && <div className="notice notice-warn small">AI가 연결되지 않아 사용할 수 없습니다. <Link href="/settings" style={{ textDecoration: "underline" }}>설정</Link></div>}
      <select className="select" value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그">
        {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <input className="input" placeholder="추가 방향 (예: 겨울철, 초보자용)" value={hint} onChange={(e) => setHint(e.target.value)} />
      {err && <div className="notice notice-bad small">{err}</div>}
      {lastJob?.status === "failed" && <div className="notice notice-bad small">최근 추천 실패: {lastJob.error}</div>}
      <button
        className="btn btn-primary"
        disabled={!aiConnected || activeJob}
        onClick={async () => {
          setErr("");
          try {
            await api("/api/ideas/suggest", "POST", { blogId, hint });
            onDone();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {activeJob ? <><span className="spinner" /> 추천 생성 중…</> : "글감 추천 받기"}
      </button>
    </section>
  );
}

function CompetitorCheck() {
  const [url, setUrl] = useState("");
  const [res, setRes] = useState<Source | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-pad stack">
      <h2 style={{ fontSize: 15 }}>경쟁 콘텐츠 조사</h2>
      <p className="small muted">URL을 넣으면 서버가 실제 페이지의 제목·설명을 수집합니다. 글감·프로젝트의 출처로 저장할 수 있습니다.</p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          className="btn"
          disabled={!url || busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            setRes(null);
            try {
              setRes(await api<Source>("/api/research/url", "POST", { url }));
            } catch (e) {
              setErr((e as Error).message);
            }
            setBusy(false);
          }}
        >
          {busy ? <span className="spinner" /> : "조회"}
        </button>
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      {res && (
        <div className="card card-pad small stack" style={{ background: "var(--panel-2)", gap: 4 }}>
          <div className="strong wrap-any">{res.title}</div>
          <div className="muted">{res.description || "(설명 없음)"}</div>
          <div className="tiny muted">수집일 {fmtDate(res.collected_at)} · {res.fetched ? "수집 성공" : "수집 실패"}</div>
        </div>
      )}
    </section>
  );
}

function TrendBox({ naver, blogs, snapshots, onDone }: { naver: boolean; blogs: BlogLite[]; snapshots: Snapshot[]; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  const [kw, setKw] = useState("");
  const [start, setStart] = useState(ago);
  const [end, setEnd] = useState(today);
  const [unit, setUnit] = useState("month");
  const [blogId, setBlogId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-pad stack">
      <div className="row between">
        <h2 style={{ fontSize: 15 }}>검색어 트렌드</h2>
        <span className={`badge ${naver ? "badge-ok" : "badge-warn"}`}>네이버 데이터랩 {naver ? "연결됨" : "미연결"}</span>
      </div>
      {!naver ? (
        <div className="notice small">
          네이버 데이터랩 검색어 트렌드 API(공식)를 연결하면 실제 조회 결과를 저장합니다. <b>.env.local</b>에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 넣고 서버를 재시작하세요. 연결 전에는 어떤 트렌드 수치도 표시하지 않습니다.
          <br />Google 검색 트렌드는 공식 API가 없어 지원하지 않습니다.
        </div>
      ) : (
        <>
          <input className="input" placeholder="키워드 (쉼표 구분, 최대 5개)" value={kw} onChange={(e) => setKw(e.target.value)} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input type="date" className="input" style={{ width: 160 }} value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작일" />
            <input type="date" className="input" style={{ width: 160 }} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="종료일" />
            <select className="select" style={{ width: 100 }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="단위">
              <option value="date">일</option><option value="week">주</option><option value="month">월</option>
            </select>
            <select className="select" style={{ width: 160 }} value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그">
              <option value="">블로그 지정 안 함</option>
              {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {err && <div className="notice notice-bad small">{err}</div>}
          <button
            className="btn btn-primary"
            disabled={busy || !kw.trim()}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await api("/api/research/trend", "POST", { keywords: kw.split(","), startDate: start, endDate: end, timeUnit: unit, blogId });
                onDone();
              } catch (e) {
                setErr((e as Error).message);
              }
              setBusy(false);
            }}
          >
            조회·저장
          </button>
        </>
      )}
      {snapshots.map((s) => (
        <div key={s.id} className="card card-pad small" style={{ background: "var(--panel-2)" }}>
          <div className="row between"><b>{s.query.keywords?.join(", ")}</b><span className="tiny muted">조회일 {fmtDate(s.collected_at)}</span></div>
          <div className="tiny muted">{s.query.startDate} ~ {s.query.endDate} · 출처: 네이버 데이터랩 · 기간 내 최대=100 상대지표 (절대 검색량 아님)</div>
          <div className="table-wrap" style={{ marginTop: 6 }}>
            <table className="tbl">
              <thead><tr><th>기간</th>{s.data.results?.map((r) => <th key={r.title}>{r.title}</th>)}</tr></thead>
              <tbody>
                {s.data.results?.[0]?.data.slice(-12).map((d, i) => (
                  <tr key={d.period}>
                    <td>{d.period}</td>
                    {s.data.results!.map((r) => <td key={r.title}>{r.data.slice(-12)[i]?.ratio?.toFixed(1) ?? "-"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

// ───────────────────────── 키워드 검색량 (네이버 검색광고) ─────────────────────────

type Stat = { keyword: string; pc: number; mobile: number; total: number; lt10: boolean; compIdx: string; collected_at: string };

export function fmtCount(s: Stat | null | undefined) {
  if (!s) return "-";
  if (s.total === 0 && s.lt10) return "10 미만";
  return s.total.toLocaleString() + (s.lt10 ? "+" : "");
}

function KeywordVolumeBox({ connected, blogs, onDone }: { connected: boolean; blogs: BlogLite[]; onDone: () => void }) {
  const [kw, setKw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ stats: Record<string, Stat | null>; related: Stat[] } | null>(null);
  const [blogId, setBlogId] = useState(blogs[0]?.id ?? "");
  const [sent, setSent] = useState<string[]>([]);
  const toIdea = async (k: string) => {
    await api("/api/ideas", "POST", { blogId, title: k, keywords: [k], memo: `네이버 검색광고 키워드 도구에서 발견` });
    setSent((x) => [...x, k]);
    onDone();
  };
  const row = (s: Stat, mine: boolean) => (
    <tr key={s.keyword + mine}>
      <td>{s.keyword}{mine && <span className="badge" style={{ marginLeft: 4 }}>입력</span>}</td>
      <td style={{ textAlign: "right" }}>{fmtCount(s)}</td>
      <td style={{ textAlign: "right" }} className="muted">{s.pc === 0 && s.lt10 ? "<10" : s.pc.toLocaleString()}</td>
      <td style={{ textAlign: "right" }} className="muted">{s.mobile === 0 && s.lt10 ? "<10" : s.mobile.toLocaleString()}</td>
      <td>{s.compIdx}</td>
      <td>{sent.includes(s.keyword) ? <span className="badge badge-ok">보냄</span> : <button className="btn btn-sm" onClick={() => toIdea(s.keyword)}>글감</button>}</td>
    </tr>
  );
  return (
    <section className="card card-pad stack" style={{ gridColumn: "1 / -1" }}>
      <div className="row between">
        <h2 style={{ fontSize: 15 }}>키워드 검색량 · 연관 키워드</h2>
        <span className={`badge ${connected ? "badge-ok" : "badge-warn"}`}>네이버 검색광고 {connected ? "연결됨" : "미연결"}</span>
      </div>
      {!connected ? (
        <div className="notice small">네이버 검색광고 API 키(NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID)를 넣으면 키워드별 <b>실제 월간 검색량(PC·모바일)</b>과 경쟁 정도, 연관 키워드를 보여줍니다. 연결 전에는 어떤 검색량도 표시하지 않습니다.</div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" placeholder="키워드 (쉼표 구분, 최대 50개) 예: 김장 양념 비율, 절임배추" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click()} />
            <button
              className="btn btn-primary"
              disabled={busy || !kw.trim()}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  setRes(await api("/api/research/keywords", "POST", { keywords: kw.split(","), withRelated: true }));
                } catch (e) {
                  setErr((e as Error).message);
                }
                setBusy(false);
              }}
            >
              {busy ? <span className="spinner" /> : "조회"}
            </button>
          </div>
          {err && <div className="notice notice-bad small">{err}</div>}
          {res && (
            <>
              <div className="row small">
                <span className="muted">글감 보낼 블로그</span>
                <select className="select" style={{ width: "auto" }} value={blogId} onChange={(e) => setBlogId(e.target.value)}>
                  {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>키워드</th><th style={{ textAlign: "right" }}>월간 검색수</th><th style={{ textAlign: "right" }}>PC</th><th style={{ textAlign: "right" }}>모바일</th><th>경쟁</th><th></th></tr></thead>
                  <tbody>
                    {Object.entries(res.stats).map(([k, s]) => (s ? row(s, true) : <tr key={k}><td>{k}</td><td colSpan={5} className="muted">검색 데이터 없음</td></tr>))}
                    {res.related.map((s) => row(s, false))}
                  </tbody>
                </table>
              </div>
              <p className="tiny muted">출처: 네이버 검색광고 키워드 도구 · 최근 30일 기준 월간 검색수 · 조회 {new Date().toLocaleString("ko-KR")} · 같은 키워드는 7일간 저장된 값을 사용</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ───────────────────────── 유튜브 인기 급상승 ─────────────────────────

type YtVideo = { id: string; title: string; channel: string; publishedAt: string; views: number; thumbnail: string; url: string };
const YT_CATS: [string, string][] = [["", "전체"], ["26", "노하우·스타일"], ["28", "과학·기술"], ["22", "브이로그"], ["19", "여행"], ["24", "엔터"]];

function YoutubeBox({ connected }: { connected: boolean }) {
  const [cat, setCat] = useState("");
  const [qy, setQy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ videos: YtVideo[]; terms: { term: string; videos: number }[]; collected_at: string; label: string } | null>(null);
  async function load(params: string, label: string) {
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ videos: YtVideo[]; terms: { term: string; videos: number }[]; collected_at: string }>(`/api/research/youtube?${params}`);
      setRes({ ...d, label });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <section className="card card-pad stack" style={{ gridColumn: "1 / -1" }}>
      <div className="row between">
        <h2 style={{ fontSize: 15 }}>유튜브 트렌드</h2>
        <span className={`badge ${connected ? "badge-ok" : "badge-warn"}`}>YouTube {connected ? "연결됨" : "미연결"}</span>
      </div>
      {!connected ? (
        <div className="notice small">YouTube Data API 키(YOUTUBE_API_KEY)를 넣으면 한국 인기 급상승 영상과 키워드별 인기 영상을 실제로 조회합니다.</div>
      ) : (
        <>
          <div className="row">
            <span className="small muted">인기 급상승 (한국)</span>
            {YT_CATS.map(([id, label]) => (
              <button key={id} className={`btn btn-sm ${cat === id && res?.label.startsWith("급상승") ? "btn-primary" : ""}`} disabled={busy} onClick={() => { setCat(id); void load(`mode=trending&category=${id}`, `급상승 · ${label}`); }}>{label}</button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" placeholder="키워드로 최근 90일 인기 영상 찾기 (하루 약 100회까지)" value={qy} onChange={(e) => setQy(e.target.value)} />
            <button className="btn" disabled={busy || !qy.trim()} onClick={() => load(`q=${encodeURIComponent(qy.trim())}`, `검색 · ${qy.trim()}`)}>{busy ? <span className="spinner" /> : "검색"}</button>
          </div>
          {err && <div className="notice notice-bad small">{err}</div>}
          {res && (
            <>
              {!!res.terms.length && (
                <div>
                  <div className="label">자주 나온 단어 ({res.label}) — 숫자는 해당 단어가 나온 영상 수</div>
                  <div className="row">{res.terms.map((t) => <span key={t.term} className="badge badge-accent">{t.term} · {t.videos}</span>)}</div>
                </div>
              )}
              <div className="list card" style={{ maxHeight: 420, overflowY: "auto" }}>
                {res.videos.map((v, i) => (
                  <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="list-item">
                    <span className="tiny muted" style={{ width: 20 }}>{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {v.thumbnail && <img src={v.thumbnail} alt="" style={{ width: 96, height: 54, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small strong ellipsis">{v.title}</div>
                      <div className="tiny muted">{v.channel} · 조회 {v.views.toLocaleString()} · {v.publishedAt.slice(0, 10)}</div>
                    </div>
                  </a>
                ))}
              </div>
              <p className="tiny muted">출처: YouTube Data API · 조회 {new Date(res.collected_at).toLocaleString("ko-KR")}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
