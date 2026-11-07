import { body, fail, handle, ok } from "@/lib/api";
import { saveViewsFromCapture, topPosts, viewsInRange, viewsOnDay } from "@/lib/top-posts";

/** ?blogId · &day=YYYY-MM-DD (그날 일간) · &from=&to= (기간 지정 합계) */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const blogId = sp.get("blogId") ?? "";
    try {
      if (sp.get("day")) return ok(await viewsOnDay(blogId, sp.get("day")!));
      if (sp.get("from") || sp.get("to")) return ok(await viewsInRange(blogId, sp.get("from") ?? "", sp.get("to") ?? ""));
      return ok(await topPosts(blogId));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

/** 조회수 순위 캡처 → AI가 읽어 저장 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string; images?: string[]; kind?: "day" | "week" | "month" | "reaction"; date?: string }>(req);
    const images = (Array.isArray(b.images) ? b.images : []).filter((s) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(String(s))).slice(0, 3);
    if (!b.blogId || !images.length) return fail("블로그와 캡처 이미지를 확인해 주세요.");
    if (images.some((s) => (s.length * 3) / 4 > 6 * 1024 * 1024)) return fail("이미지가 너무 큽니다 (한 장에 6MB 이하).");
    try {
      return ok(await saveViewsFromCapture(b.blogId, images, b.kind && ["day", "week", "month", "reaction"].includes(b.kind) ? b.kind : undefined, b.date || undefined));
    } catch (e) {
      return fail((e as Error).message, 422);
    }
  });
}
