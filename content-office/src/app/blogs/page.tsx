import Link from "next/link";
import { listBlogs } from "@/lib/repo";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Blogs() {
  const blogs = await listBlogs(true);
  const counts = await q<{ blog_id: string; n: number; done: number }>(
    "SELECT blog_id, COUNT(*)::int AS n, SUM(CASE WHEN stage='done' THEN 1 ELSE 0 END)::int AS done FROM projects GROUP BY blog_id",
  );
  const c = Object.fromEntries(counts.map((x) => [x.blog_id, x]));
  const sampleRows = await q<{ blog_id: string; n: number }>("SELECT blog_id, COUNT(*)::int AS n FROM blog_samples WHERE enabled=TRUE GROUP BY blog_id");
  const sc = Object.fromEntries(sampleRows.map((x) => [x.blog_id, x.n]));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>블로그 관리</h1>
          <p className="sub">블로그마다 문체·AI 배정·이미지 스타일·검수 규칙을 독립적으로 관리합니다.</p>
        </div>
        <Link href="/blogs/new" className="btn btn-primary">+ 블로그 추가</Link>
      </div>
      <div className="grid grid-3">
        {blogs.map((b) => (
          <Link key={b.id} href={`/blogs/${b.id}`} className="card card-pad stack" style={{ gap: 8, opacity: b.archived ? 0.55 : 1 }}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="blog-dot" style={{ background: b.color, width: 14, height: 14 }} />
              <span className="strong ellipsis">{b.name}</span>
              <span className="badge" style={{ marginLeft: "auto" }}>{{ naver: "네이버", tistory: "티스토리", wordpress: "워드프레스" }[b.platform] ?? b.platform}</span>
            </div>
            <div className="small muted">{b.category}</div>
            <div className="small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b.style_guide}</div>
            <div className="row tiny muted">
              <span>프로젝트 {c[b.id]?.n ?? 0}</span>·<span>완료 {c[b.id]?.done ?? 0}</span>·<span>검수 규칙 {b.review_rules.length}개</span>·<span>말투 예시 {sc[b.id] ?? 0}개</span>
              {b.archived && <span className="badge">보관됨</span>}
            </div>
          </Link>
        ))}
        <Link href="/blogs/new" className="card card-pad stack phase2" style={{ justifyContent: "center", alignItems: "center", minHeight: 140, color: "var(--muted)" }}>
          <span style={{ fontSize: 24 }}>+</span>
          <span className="small">새 블로그 추가 (예: 여행 블로그)</span>
        </Link>
      </div>
    </div>
  );
}
