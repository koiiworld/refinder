import Link from "next/link";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { BlogTag, fmtDate, StageBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; stage: string; status: string; updated_at: string; scheduled_date: string | null; blog_id: string; blog_name: string; blog_color: string; needs_rereview: boolean };

export default async function Projects({ searchParams }: { searchParams: Promise<{ blog?: string; view?: string }> }) {
  const sp = await searchParams;
  const blogs = await listBlogs();
  const view = sp.view ?? "active";
  const rows = await q<Row>(
    `SELECT p.id, p.title, p.stage, p.status, p.updated_at, p.scheduled_date, p.blog_id, p.needs_rereview, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id
     WHERE ($1::text IS NULL OR p.blog_id=$1)
       AND (($2::text = 'active' AND p.stage NOT IN ('done','rejected')) OR ($2::text = 'done' AND p.stage IN ('done','rejected')) OR $2::text = 'all')
     ORDER BY p.updated_at DESC`,
    [sp.blog ?? null, view],
  );
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { blog: sp.blog, view, ...o };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/projects?${p}`;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>프로젝트</h1>
          <p className="sub">블로그별로 독립된 콘텐츠 제작 프로젝트</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">+ 새 프로젝트</Link>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Link href={qs({ blog: undefined })} className={`btn btn-sm ${!sp.blog ? "btn-primary" : ""}`}>전체 블로그</Link>
        {blogs.map((b) => (
          <Link key={b.id} href={qs({ blog: b.id })} className={`btn btn-sm ${sp.blog === b.id ? "btn-primary" : ""}`}>
            <span className="blog-dot" style={{ background: b.color }} /> {b.name}
          </Link>
        ))}
      </div>
      <div className="tabs">
        {[["active", "진행 중"], ["done", "완료·반려"], ["all", "전체"]].map(([k, l]) => (
          <Link key={k} href={qs({ view: k })} className={`tab ${view === k ? "on" : ""}`}>{l}</Link>
        ))}
      </div>

      <div className="card">
        <div className="list">
          {rows.map((r) => (
            <Link key={r.id} href={`/projects/${r.id}`} className="list-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong ellipsis">{r.title}</div>
                <div className="row">
                  <BlogTag name={r.blog_name} color={r.blog_color} />
                  <span className="tiny muted">수정 {fmtDate(r.updated_at)}</span>
                  {r.scheduled_date && <span className="tiny muted">· 발행 예정 {r.scheduled_date}</span>}
                </div>
              </div>
              {r.needs_rereview && <span className="badge badge-bad">재검수 필요</span>}
              <StageBadge stage={r.stage} status={r.status} />
            </Link>
          ))}
          {!rows.length && (
            <div className="empty">
              프로젝트가 없습니다. <Link href="/projects/new" style={{ color: "var(--accent)" }}>새 프로젝트 만들기</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
