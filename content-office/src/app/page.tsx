import Link from "next/link";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import { GATE_STAGES, STAGES, stageDef } from "@/lib/stages";
import { BlogTag, fmtDate, fmtUsd, StageBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type PRow = { id: string; blog_id: string; title: string; stage: string; status: string; scheduled_date: string | null; updated_at: string; needs_rereview: boolean };

export default async function Dashboard() {
  const [blogs, projects, runsMonth, recentRuns] = await Promise.all([
    listBlogs(),
    q<PRow>("SELECT id, blog_id, title, stage, status, scheduled_date, updated_at, needs_rereview FROM projects ORDER BY updated_at DESC"),
    q<{ provider: string; n: number; fails: number; cost: number; tin: number; tout: number }>(
      `SELECT provider, COUNT(*)::int AS n, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int AS fails,
              COALESCE(SUM(cost_usd),0)::float8 AS cost, COALESCE(SUM(input_tokens),0)::int AS tin, COALESCE(SUM(output_tokens),0)::int AS tout
       FROM ai_runs WHERE created_at >= date_trunc('month', NOW()) GROUP BY provider ORDER BY provider`,
    ),
    q<{ id: string; purpose: string; provider: string; model: string; status: string; created_at: string; cost_usd: number; error: string | null }>(
      "SELECT id, purpose, provider, model, status, created_at, cost_usd, error FROM ai_runs ORDER BY created_at DESC LIMIT 6",
    ),
  ]);
  const conns = connectionStatus();
  const blogMap = Object.fromEntries(blogs.map((b) => [b.id, b]));
  const active = projects.filter((p) => !["done", "rejected"].includes(p.stage));
  const waiting = projects.filter((p) => (GATE_STAGES.includes(p.stage) || ["images", "carousel"].includes(p.stage)) && p.status !== "running");
  const running = projects.filter((p) => p.status === "running");
  const errors = projects.filter((p) => p.status === "error");
  const monthCost = runsMonth.reduce((a, r) => a + r.cost, 0);
  const monthRuns = runsMonth.reduce((a, r) => a + r.n, 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = projects
    .filter((p) => p.scheduled_date && p.scheduled_date >= today && p.stage !== "rejected")
    .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>통합 대시보드</h1>
          <p className="sub">블로그 {blogs.length}개 · 진행 중 프로젝트 {active.length}개</p>
        </div>
        <div className="row">
          <Link href="/research" className="btn">글감 찾기</Link>
          <Link href="/projects/new" className="btn btn-primary">+ 새 콘텐츠</Link>
        </div>
      </div>

      {conns.filter((c) => !c.media).every((c) => !c.connected) && (
        <div className="notice notice-warn" style={{ marginBottom: 16 }}>
          AI API가 아직 연결되지 않았습니다. 지금은 <b>템플릿(오프라인) 모드</b>로 흐름만 확인할 수 있습니다.{" "}
          <Link href="/settings" style={{ textDecoration: "underline" }}>AI 연결 방법 보기</Link>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Link href="/approvals" className="card stat">
          <div className="k">승인 대기</div>
          <div className="v" style={{ color: waiting.length ? "var(--warn)" : undefined }}>{waiting.length}</div>
        </Link>
        <div className="card stat">
          <div className="k">AI 작업 중</div>
          <div className="v">{running.length}</div>
        </div>
        <div className="card stat">
          <div className="k">오류</div>
          <div className="v" style={{ color: errors.length ? "var(--bad)" : undefined }}>{errors.length}</div>
        </div>
        <Link href="/runs" className="card stat">
          <div className="k">이번 달 AI 비용 · 호출</div>
          <div className="v">{fmtUsd(monthCost)} <span className="small muted">/ {monthRuns}회</span></div>
        </Link>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>승인 대기함</h2>
            <Link href="/approvals" className="small muted">전체 보기 →</Link>
          </div>
          <div className="list">
            {waiting.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong ellipsis">{p.title}</div>
                  {blogMap[p.blog_id] && <BlogTag name={blogMap[p.blog_id].name} color={blogMap[p.blog_id].color} />}
                </div>
                {p.needs_rereview && <span className="badge badge-bad">재검수 필요</span>}
                <StageBadge stage={p.stage} status={p.status} />
              </Link>
            ))}
            {!waiting.length && <div className="empty">승인할 항목이 없습니다.</div>}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>블로그 운영 현황</h2>
            <Link href="/blogs" className="small muted">블로그 관리 →</Link>
          </div>
          <div className="list">
            {blogs.map((b) => {
              const mine = projects.filter((p) => p.blog_id === b.id);
              const act = mine.filter((p) => !["done", "rejected"].includes(p.stage)).length;
              const wait = mine.filter((p) => GATE_STAGES.includes(p.stage) && p.status !== "running").length;
              const done = mine.filter((p) => p.stage === "done").length;
              return (
                <Link key={b.id} href={`/projects?blog=${b.id}`} className="list-item">
                  <span className="blog-dot" style={{ background: b.color, width: 12, height: 12 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong ellipsis">{b.name}</div>
                    <div className="small muted ellipsis">{b.category}</div>
                  </div>
                  <div className="row small" style={{ flexWrap: "nowrap" }}>
                    <span className="badge">진행 {act}</span>
                    <span className={`badge ${wait ? "badge-warn" : ""}`}>승인 {wait}</span>
                    <span className="badge badge-ok">완료 {done}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>프로젝트별 제작 단계</h2>
            <Link href="/projects" className="small muted">전체 →</Link>
          </div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            {STAGES.map((s) => {
              const n = projects.filter((p) => p.stage === s.key).length;
              const max = Math.max(1, ...STAGES.map((x) => projects.filter((p) => p.stage === x.key).length));
              return (
                <div key={s.key} className="row" style={{ flexWrap: "nowrap" }}>
                  <div className="small" style={{ width: 96, flexShrink: 0 }}>{s.label}</div>
                  <div style={{ flex: 1, height: 8, background: "var(--panel-2)", borderRadius: 999 }}>
                    <div style={{ width: `${(n / max) * 100}%`, height: 8, borderRadius: 999, background: s.kind === "gate" ? "var(--warn)" : s.key === "done" ? "var(--ok)" : "var(--accent)" }} />
                  </div>
                  <div className="small strong" style={{ width: 24, textAlign: "right" }}>{n}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>다가오는 발행 일정</h2>
            <Link href="/calendar" className="small muted">캘린더 →</Link>
          </div>
          <div className="list">
            {upcoming.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="list-item">
                <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>{p.scheduled_date}</span>
                <div className="ellipsis" style={{ flex: 1 }}>{p.title}</div>
                <span className="small muted">{stageDef(p.stage).label}</span>
              </Link>
            ))}
            {!upcoming.length && <div className="empty">예정된 발행일이 없습니다. 프로젝트에서 발행 예정일을 지정하세요.</div>}
          </div>
        </section>

        <section className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head">
            <h2>최근 AI 실행 내역</h2>
            <Link href="/runs" className="small muted">전체 내역·비용 →</Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>시각</th><th>작업</th><th>AI</th><th>상태</th><th>비용</th></tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>{r.purpose}</td>
                    <td>{r.provider}/{r.model}</td>
                    <td>{r.status === "succeeded" ? <span className="badge badge-ok">성공</span> : <span className="badge badge-bad" title={r.error ?? ""}>실패</span>}</td>
                    <td>{fmtUsd(r.cost_usd)}</td>
                  </tr>
                ))}
                {!recentRuns.length && (
                  <tr><td colSpan={5} className="muted">아직 실행 내역이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
