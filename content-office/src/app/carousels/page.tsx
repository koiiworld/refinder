import Link from "next/link";
import {capturedPostViews,matchCapturedViews} from "@/lib/captured-post-views";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { naverPostStats, recentPosts } from "@/lib/blog-posts";
import { FORMATS, listCarousels } from "@/lib/carousel";
import { postKey } from "@/lib/diagnose";
import NewCarousel from "./NewCarousel";

export const dynamic = "force-dynamic";

export default async function Carousels({ searchParams }: { searchParams: Promise<{ from?: string; blog?: string }> }) {
  const sp = await searchParams;
  const list = await listCarousels();
  const allBlogs = await listBlogs();
  const blogs = allBlogs.map((b) => ({ id: b.id, name: b.name, category: b.category }));
  // 이미 캐러셀을 만든 글도 순위에 그대로 두고 '✅ 만듦 · 열기'로 표시
  const usedUrls = new Map(list.filter((c) => c.style?.sourceUrl).map((c) => [postKey(c.style.sourceUrl!), c.id] as const));
  const usedProjects = new Map(list.filter((c) => c.project_id).map((c) => [c.project_id!, c.id] as const));
  const viewPeriods:Record<string,string>={};
  const published = (
    await Promise.all(
      allBlogs.map(async (b) => {
        const [posts, stats, captured] = await Promise.all([recentPosts(b, 50), naverPostStats(b.url),capturedPostViews(b.id)]);
        viewPeriods[b.id]=captured.label;
        return posts
          .map((p) => {
            const st = stats[/\/(\d{6,})/.exec(p.url)?.[1] ?? ""] ?? null;
            return { title: p.title, url: p.url, blogId: b.id, blog_name: b.name, likes: st?.likes ?? null, comments: st?.comments ?? null, views: matchCapturedViews(p.title,posts.map(x=>x.title),captured.items), madeId: usedUrls.get(postKey(p.url)) ?? null };
          });
      }),
    )
  ).flat();
  const posts = (
    await q<{ id: string; title: string; blog_id: string; blog_name: string; stage: string }>(
      `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id, b.name AS blog_name, p.stage
         FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id
        WHERE p.deleted_at IS NULL AND p.stage IN ('reviewing','ready','published') ORDER BY p.created_at DESC LIMIT 40`,
    )
  ).map((p) => ({ ...p, madeId: usedProjects.get(p.id) ?? null }));
  const made = list.map((c) => ({ id: c.id, title: c.title, blog_id: c.blog_id, slides: c.slides.length, updated_at: c.updated_at, fromPost: !!(c.project_id || c.style?.sourceUrl) }));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📱 인스타 캐러셀</h1>
          <p className="sub">블로그 글을 카드뉴스로 바꾸거나, 저장·공유가 잘 되는 주제로 따로 만들어요. 이미지는 폰·컴퓨터 브라우저에서 바로 만들어 저장합니다.</p>
        </div>
      </div>
      <Link href="/learn/design" className="btn">📚 AI 학습지 · 디자인 참고 자료 넣기</Link>
      <NewCarousel viewPeriods={viewPeriods} posts={posts} published={published} blogs={blogs} made={JSON.parse(JSON.stringify(made))} formats={FORMATS.map((f) => ({ id: f.id, label: f.label }))} defaultFrom={sp.from} defaultBlog={sp.blog} />
    </div>
  );
}
