import Link from "next/link";
import { q } from "@/lib/db";
import { fmtDate, fmtUsd } from "@/components/ui";
import ActionButton from "@/components/ActionButton";

export const dynamic = "force-dynamic";

type Run = { id: string; purpose: string; provider: string; model: string; status: string; attempt: number; input_tokens: number; output_tokens: number; cost_usd: number; duration_ms: number; error: string | null; created_at: string; project_id: string | null; blog_name: string | null };
type JobRow = { id: string; type: string; status: string; attempts: number; max_attempts: number; error: string | null; created_at: string; project_id: string | null };

export default async function Runs() {
  const [byModel, runs, jobs] = await Promise.all([
    q<{ provider: string; model: string; n: number; fails: number; tin: number; tout: number; cost: number }>(
      `SELECT provider, model, COUNT(*)::int AS n, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int AS fails,
              COALESCE(SUM(input_tokens),0)::int AS tin, COALESCE(SUM(output_tokens),0)::int AS tout, COALESCE(SUM(cost_usd),0)::float8 AS cost
       FROM ai_runs WHERE created_at >= date_trunc('month', NOW()) GROUP BY provider, model ORDER BY cost DESC, n DESC`,
    ),
    q<Run>(
      `SELECT r.*, b.name AS blog_name FROM ai_runs r LEFT JOIN blogs b ON b.id=r.blog_id ORDER BY r.created_at DESC LIMIT 100`,
    ),
    q<JobRow>("SELECT id, type, status, attempts, max_attempts, error, created_at, project_id FROM jobs ORDER BY created_at DESC LIMIT 30"),
  ]);
  const total = byModel.reduce((a, r) => a + r.cost, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI 실행 내역 · 비용</h1>
          <p className="sub">모든 AI 호출은 성공·실패와 관계없이 기록됩니다. 비용은 설정에 입력한 단가 × 실제 사용 토큰으로 계산합니다.</p>
        </div>
        <Link href="/settings" className="btn btn-sm">단가 설정</Link>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>이번 달 모델별 사용량</h2><span className="strong">합계 {fmtUsd(total)}</span></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>AI / 모델</th><th>호출</th><th>실패</th><th>입력 토큰</th><th>출력 토큰</th><th>비용</th></tr></thead>
            <tbody>
              {byModel.map((r) => (
                <tr key={r.provider + r.model}>
                  <td>{r.provider}/{r.model}</td><td>{r.n}</td><td>{r.fails}</td>
                  <td>{r.tin.toLocaleString()}</td><td>{r.tout.toLocaleString()}</td>
                  <td>{r.provider === "template" ? "무료(오프라인)" : r.cost ? fmtUsd(r.cost) : "단가 미입력"}</td>
                </tr>
              ))}
              {!byModel.length && <tr><td colSpan={6} className="muted">이번 달 호출 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>작업 큐</h2><span className="small muted">재시도 가능한 오류는 자동 재시도(지수 백오프)</span></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>생성</th><th>작업</th><th>상태</th><th>시도</th><th>오류</th><th></th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{fmtDate(j.created_at)}</td>
                  <td>{j.project_id ? <Link href={`/projects/${j.project_id}`} style={{ color: "var(--accent)" }}>{j.type}</Link> : j.type}</td>
                  <td><span className={`badge ${j.status === "succeeded" ? "badge-ok" : j.status === "failed" ? "badge-bad" : j.status === "running" ? "badge-accent" : ""}`}>{j.status}</span></td>
                  <td>{j.attempts}/{j.max_attempts}</td>
                  <td className="wrap small" style={{ color: "var(--bad)" }}>{j.error}</td>
                  <td>{(j.status === "failed" || j.status === "canceled") && <ActionButton url={`/api/jobs/${j.id}`} label="재시도" />}</td>
                </tr>
              ))}
              {!jobs.length && <tr><td colSpan={6} className="muted">작업 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>최근 AI 호출 100건</h2></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>시각</th><th>블로그</th><th>작업</th><th>AI</th><th>상태</th><th>시도</th><th>토큰(입/출)</th><th>비용</th><th>소요</th><th>오류</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.blog_name ?? "-"}</td>
                  <td>{r.project_id ? <Link href={`/projects/${r.project_id}`} style={{ color: "var(--accent)" }}>{r.purpose}</Link> : r.purpose}</td>
                  <td>{r.provider}/{r.model}</td>
                  <td>{r.status === "succeeded" ? <span className="badge badge-ok">성공</span> : <span className="badge badge-bad">실패</span>}</td>
                  <td>{r.attempt}</td>
                  <td>{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                  <td>{fmtUsd(r.cost_usd)}</td>
                  <td>{(r.duration_ms / 1000).toFixed(1)}s</td>
                  <td className="wrap small" style={{ color: "var(--bad)" }}>{r.error}</td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={10} className="muted">실행 내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
