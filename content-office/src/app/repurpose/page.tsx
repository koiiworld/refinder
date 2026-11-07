import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { recentPosts } from "@/lib/blog-posts";
import { CHANNELS, listRepurpose } from "@/lib/repurpose";
import RepurposeBoard from "./RepurposeBoard";

export const dynamic = "force-dynamic";

export default async function RepurposePage({ searchParams }: { searchParams: Promise<{ post?: string; url?: string; convert?: string }> }) {
  const sp = await searchParams;
  const blogs = await listBlogs();
  // 내 블로그에 이미 올린 글 (RSS 최근 글) + 이 앱에서 만든 글
  const published = (await Promise.all(blogs.map(async (b) => (await recentPosts(b, 30).catch(() => [])).map((p) => ({ title: p.title, url: p.url, blogId: b.id }))))).flat();
  const appPosts = await q<{ id: string; title: string; blog_id: string }>(
    `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id FROM projects p LEFT JOIN documents d ON d.project_id=p.id
      WHERE p.deleted_at IS NULL AND COALESCE(d.content_html,'') <> '' ORDER BY p.updated_at DESC LIMIT 60`,
  );
  const history = await listRepurpose();
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1>📣 채널 변환</h1>
          <p className="sub">블로그 글 하나로 릴스 대본·카드뉴스·스레드·인스타 캡션·당근·네이버 플레이스·FAQ·카톡 소식 초안을 만들어요. 이 앱에서 만든 글, 이미 블로그에 올린 글(주소·최근 글), 직접 붙여넣은 글 모두 돼요.</p>
        </div>
      </div>
      <RepurposeBoard
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
        published={published}
        appPosts={appPosts.map((p) => ({ id: p.id, title: p.title, blogId: p.blog_id }))}
        channels={CHANNELS.map((c) => ({ id: c.id, label: c.label, hint: c.hint }))}
        history={JSON.parse(JSON.stringify(history))}
        initialPost={sp.post ?? ""}
        initialUrl={sp.url ?? ""}
        initialConvert={sp.convert ?? ""}
      />
    </div>
  );
}
