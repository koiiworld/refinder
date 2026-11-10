import { handle, ok, fail, type Ctx } from "@/lib/api";
import { getCarousel } from "@/lib/carousel";
import { listBlogs } from "@/lib/repo";
import { searchBlogPosts } from "@/lib/blog-post-search";

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const carousel = await getCarousel((await ctx.params).id);
    if (!carousel) return fail("캐러셀을 찾을 수 없습니다.", 404);
    const p = new URL(req.url).searchParams;
    const blogs = (await listBlogs()).filter((b) => !carousel.blog_id || carousel.blog_id === b.id);
    try {
      return ok(await searchBlogPosts(blogs, (p.get("query") ?? "").trim(), Number(p.get("start") ?? 1)));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
