import Link from "next/link";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { recentPosts } from "@/lib/blog-posts";
import { FORMATS, listCarousels } from "@/lib/carousel";
import { fmtDate } from "@/components/ui";
import NewCarousel from "./NewCarousel";

export const dynamic = "force-dynamic";

export default async function Carousels({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const list = await listCarousels();
  const allBlogs = await listBlogs();
  const blogs = allBlogs.map((b) => ({ id: b.id, name: b.name, category: b.category }));
  const published = (await Promise.all(allBlogs.map(async (b) => (await recentPosts(b, 15)).map((p) => ({ title: p.title, url: p.url, blogId: b.id, blog_name: b.name }))))).flat();
  const posts = await q<{ id: string; title: string; blog_id: string; blog_name: string; stage: string }>(
    `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id, b.name AS blog_name, p.stage
       FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id
      WHERE p.deleted_at IS NULL AND p.stage IN ('reviewing','ready','published') ORDER BY p.created_at DESC LIMIT 40`,
  );
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📱 인스타 캐러셀</h1>
          <p className="sub">블로그 글을 카드뉴스로 바꾸거나, 저장·공유가 잘 되는 주제로 따로 만들어요. 이미지는 폰·컴퓨터 브라우저에서 바로 만들어 저장합니다.</p>
        </div>
      </div>
      <NewCarousel posts={posts} published={published} blogs={blogs} formats={FORMATS.map((f) => ({ id: f.id, label: f.label }))} defaultFrom={sp.from} />
      <section className="card">
        <div className="card-head"><h2 style={{ fontSize: 15 }}>만든 캐러셀 ({list.length})</h2></div>
        <div className="card-pad stack" style={{ gap: 6 }}>
          {!list.length && <p className="small muted" style={{ margin: 0 }}>아직 없어요.</p>}
          {list.map((c) => (
            <Link key={c.id} href={`/carousels/${c.id}`} className="row between card card-pad" style={{ padding: 10, flexWrap: "nowrap" }}>
              <span className="small ellipsis" style={{ flex: 1 }}><b>{c.title}</b> <span className="tiny muted">· {c.blog_name ?? "주제로 만듦"} · {c.slides.length}장</span></span>
              <span className="tiny muted">{fmtDate(c.updated_at)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
