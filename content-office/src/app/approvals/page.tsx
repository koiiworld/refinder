import Link from "next/link";
import { q } from "@/lib/db";
import { GATE_STAGES, STAGES } from "@/lib/stages";
import { BlogTag, fmtDate, StageBadge } from "@/components/ui";
import ActionButton from "@/components/ActionButton";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; stage: string; status: string; updated_at: string; needs_rereview: boolean; blog_name: string; blog_color: string; status_message: string };

export default async function Approvals() {
  const rows = await q<Row>(
    `SELECT p.id, p.title, p.stage, p.status, p.updated_at, p.needs_rereview, p.status_message, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id
     WHERE (p.stage = ANY($1) OR p.stage IN ('images','carousel') OR p.status='error') AND p.status <> 'running'
     ORDER BY p.updated_at ASC`,
    [GATE_STAGES],
  );
  const groups = STAGES.filter((s) => rows.some((r) => r.stage === s.key && r.status !== "error"));
  const errors = rows.filter((r) => r.status === "error");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>통합 승인 대기함</h1>
          <p className="sub">모든 블로그의 승인·확인이 필요한 항목 {rows.length}건 · 승인하면 다음 작업이 자동으로 실행됩니다.</p>
        </div>
      </div>

      {!!errors.length && (
        <section className="card" style={{ marginBottom: 16, borderColor: "var(--bad)" }}>
          <div className="card-head"><h2 style={{ color: "var(--bad)" }}>오류 확인 필요 ({errors.length})</h2></div>
          <div className="list">
            {errors.map((r) => (
              <Link key={r.id} href={`/projects/${r.id}`} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong ellipsis">{r.title}</div>
                  <div className="small" style={{ color: "var(--bad)" }}>{r.status_message}</div>
                </div>
                <StageBadge stage={r.stage} status={r.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="stack" style={{ gap: 16 }}>
        {groups.map((s) => (
          <section key={s.key} className="card">
            <div className="card-head">
              <h2>{s.label} {s.phase === 2 && <span className="badge">2차 기능 · 수동 처리</span>}</h2>
              <span className="small muted">{rows.filter((r) => r.stage === s.key && r.status !== "error").length}건</span>
            </div>
            <div className="list">
              {rows
                .filter((r) => r.stage === s.key && r.status !== "error")
                .map((r) => (
                  <div key={r.id} className="list-item" style={{ flexWrap: "wrap" }}>
                    <Link href={`/projects/${r.id}`} style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div className="strong ellipsis">{r.title}</div>
                      <div className="row">
                        <BlogTag name={r.blog_name} color={r.blog_color} />
                        <span className="tiny muted">· {fmtDate(r.updated_at)}</span>
                        {r.needs_rereview && <span className="badge badge-bad">승인 후 변경됨 · 재검수 필요</span>}
                      </div>
                    </Link>
                    <div className="row">
                      <Link href={`/projects/${r.id}`} className="btn btn-sm btn-primary">검토하기</Link>
                      {r.stage === "topic_approval" && (
                        <ActionButton url={`/api/projects/${r.id}/actions`} payload={{ action: "approve" }} label="바로 승인" className="btn btn-sm btn-ok" />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
        {!rows.length && <div className="card empty">승인 대기 중인 항목이 없습니다. 🎉</div>}
      </div>
    </div>
  );
}
