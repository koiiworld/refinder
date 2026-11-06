import { body, fail, handle, ok } from "@/lib/api";
import { carouselIdeas } from "@/lib/carousel";

/** 알고리즘 타기 쉬운 캐러셀 주제 추천 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ niche?: string; blogId?: string }>(req);
    try {
      return ok(await carouselIdeas(String(b.niche ?? ""), b.blogId ?? null));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
