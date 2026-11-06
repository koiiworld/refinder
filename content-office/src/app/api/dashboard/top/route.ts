import { body, fail, handle, ok } from "@/lib/api";
import { saveViewsFromCapture, topPosts } from "@/lib/top-posts";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId") ?? "";
    try {
      return ok(await topPosts(blogId));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

/** 조회수 순위 캡처 → AI가 읽어 저장 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string; images?: string[] }>(req);
    const images = (Array.isArray(b.images) ? b.images : []).filter((s) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(String(s))).slice(0, 3);
    if (!b.blogId || !images.length) return fail("블로그와 캡처 이미지를 확인해 주세요.");
    if (images.some((s) => (s.length * 3) / 4 > 6 * 1024 * 1024)) return fail("이미지가 너무 큽니다 (한 장에 6MB 이하).");
    try {
      return ok(await saveViewsFromCapture(b.blogId, images));
    } catch (e) {
      return fail((e as Error).message, 422);
    }
  });
}
