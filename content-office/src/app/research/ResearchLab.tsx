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

export default function ResearchLab({ blogs, ideas, snapshots, jobs, naver, aiConnected }: { blogs: BlogLite[]; ideas: Idea[]; snapshots: Snapshot[]; jobs: JobRow[]; naver: boolean; aiConnected: boolean }) {
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
