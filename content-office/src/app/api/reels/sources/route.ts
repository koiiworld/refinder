import { fail, handle, ok } from "@/lib/api";
import { listBlogs } from "@/lib/repo";
import { recentPosts } from "@/lib/blog-posts";

/** 릴스 대본용 블로그 글 목록: ?blogId= (없으면 첫 블로그) — 최근 글 30개 (저장된 목록, 새로고침은 /api/carousels/sources/refresh) */
export async function GET(req: Request) {
  return handle(async () => {
    const blogs = await listBlogs();
    const id = new URL(req.url).searchParams.get("blogId") || blogs[0]?.id;
    const blog = blogs.find((b) => b.id === id);
    if (!blog) return fail("블로그를 먼저 등록해 주세요.");
    const posts = await recentPosts(blog, 30).catch(() => []);
    return ok({ blogId: blog.id, blogs: blogs.map((b) => ({ id: b.id, name: b.name, color: b.color })), posts: posts.map((p) => ({ title: p.title, url: p.url })) });
  });
}
