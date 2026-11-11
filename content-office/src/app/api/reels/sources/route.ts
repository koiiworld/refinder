import { handle, ok } from "@/lib/api";
import { capturedPostViews, matchCapturedViews } from "@/lib/captured-post-views";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { naverPostStats, recentPosts } from "@/lib/blog-posts";

/**
 * 릴스 대본용 블로그 글 목록 — 캐러셀 '블로그 글에서 만들기'와 같은 목록
 * (블로그별 최근 글 + 조회수 캡처·공감·댓글, 앱에서 쓴 글). 새로고침은 /api/carousels/sources/refresh
 */
export async function GET() {
  return handle(async () => {
    const allBlogs = await listBlogs();
    const viewPeriods: Record<string, string> = {};
    const published = (
      await Promise.all(
        allBlogs.map(async (b) => {
          const [posts, stats, captured] = await Promise.all([recentPosts(b, 50).catch(() => []), naverPostStats(b.url).catch(() => ({}) as Record<string, { likes: number; comments: number }>), capturedPostViews(b.id).catch(() => ({ label: "저장된 조회수 기록 없음", items: [] }))]);
          viewPeriods[b.id] = captured.label;
          return posts.map((p) => {
            const st = (stats as Record<string, { likes?: number; comments?: number } | undefined>)[/\/(\d{6,})/.exec(p.url)?.[1] ?? ""] ?? null;
            return { title: p.title, url: p.url, blogId: b.id, likes: st?.likes ?? null, comments: st?.comments ?? null, views: matchCapturedViews(p.title, posts.map((x) => x.title), captured.items as never) };
          });
        }),
      )
    ).flat();
    const posts = await q<{ id: string; title: string; blog_id: string }>(
      `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id
         FROM projects p LEFT JOIN documents d ON d.project_id=p.id
        WHERE p.deleted_at IS NULL AND p.stage IN ('reviewing','ready','published') ORDER BY p.created_at DESC LIMIT 40`,
    );
    return ok({ blogs: allBlogs.map((b) => ({ id: b.id, name: b.name })), published, posts, viewPeriods });
  });
}
