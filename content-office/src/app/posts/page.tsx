import Link from "next/link";
import { q } from "@/lib/db";
import { ensureWorker } from "@/lib/jobs";
import { stageLabel, stageStep } from "@/lib/steps";
import { BlogTag, fmtDate, Steps } from "@/components/ui";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; topic: string; stage: string; status: string; status_message: string; updated_at: string; blog_name: string; blog_color: string; needs_rereview: boolean };

export default async function Posts() {
  ensureWorker();
  const rows = await q<Row>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.status_message, p.updated_at, p.needs_rereview, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id ORDER BY p.updated_at DESC LIMIT 300`,
  );
  const groups: [string, Row[]][] = [
    ["⑦ 발행 대기 — 확인하고 발행하세요", rows.filter((r) => r.stage === "ready" && r.status !== "error")],
    ["AI가 작업 중 (③ 제목 → ④ 글 → ⑥ 검수)", rows.filter((r) => ["titles", "writing", "reviewing"].includes(r.stage) && r.status !== "error")],
    ["오류 — 다시 실행이 필요해요", rows.filter((r) => r.status === "error")],
    ["발행 완료", rows.filter((r) => r.stage === "published")],
    ["이전 방식으로 만든 글", rows.filter((r) => !["titles", "writing", "reviewing", "ready", "published"].includes(r.stage) && r.status !== "error")],
  ];
  const working = groups[1][1].length > 0;

  return (
    <div className="page">
      {working && <AutoRefresh seconds={4} />}
      <div className="page-head">
        <div>
          <h1>진행 현황</h1>
          <p className="sub">선택한 키워드마다 AI가 ③ 제목 → ④ 글 → ⑥ 검수까지 자동으로 진행합니다. 이 화면을 닫아도 계속됩니다.</p>
        </div>
        <Link href="/" className="btn btn-primary">+ 키워드 더 고르기</Link>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        {groups
          .filter(([, list]) => list.length)
          .map(([title, list]) => (
            <section key={title} className="card">
              <div className="card-head"><h2 style={{ fontSize: 15 }}>{title} ({list.length})</h2></div>
              <div className="list">
                {list.map((r) => (
                  <Link key={r.id} href={`/posts/${r.id}`} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    <div className="row between" style={{ flexWrap: "nowrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="strong ellipsis">{r.title}</div>
                        <div className="row">
                          <BlogTag name={r.blog_name} color={r.blog_color} />
                          <span className="tiny muted">키워드 {r.topic} · {fmtDate(r.updated_at)}</span>
                        </div>
                      </div>
                      <span className={`badge ${r.status === "error" ? "badge-bad" : r.stage === "ready" ? "badge-warn" : r.stage === "published" ? "badge-ok" : "badge-accent"}`} style={{ flexShrink: 0 }}>
                        {r.status === "running" && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />}
                        {stageLabel(r.stage, r.status)}
                      </span>
                    </div>
                    {r.status_message && <div className="tiny" style={{ color: r.status === "error" ? "var(--bad)" : "var(--warn)" }}>{r.status_message}</div>}
                    {r.needs_rereview && <div className="tiny" style={{ color: "var(--warn)" }}>검수 후 글을 고쳤어요 · 다시 검수를 권장합니다</div>}
                    <Steps current={r.stage === "published" ? 8 : stageStep(r.stage)} error={r.status === "error"} />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        {!rows.length && (
          <div className="card empty">
            아직 만든 글이 없습니다. <Link href="/" style={{ color: "var(--accent)" }}>글 만들기</Link>에서 키워드를 골라 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
