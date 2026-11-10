import { handle, ok, fail } from "@/lib/api";
import { listBlogs } from "@/lib/repo";
import { searchBlogPosts } from "@/lib/blog-post-search";

/** 새 캐러셀 만들기: 고른 블로그의 예전 글 검색 ?blogId=&query=&start= */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const blogs = (await listBlogs()).filter((b) => b.id === p.get("blogId"));
    if (!blogs.length) return fail("블로그를 골라 주세요.");
    try {
      return ok(await searchBlogPosts(blogs, (p.get("query") ?? "").trim(), Number(p.get("start") ?? 1)));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
