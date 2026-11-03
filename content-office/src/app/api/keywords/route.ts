import { q } from "@/lib/db";
import { addUserKeyword, listPicks, recommendKeywords } from "@/lib/keywords";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId");
    if (!blogId) return fail("블로그를 선택하세요.");
    return ok(await listPicks(blogId));
  });
}

/** recommend(① AI 추천) | add(직접 입력) | dismiss(목록에서 빼기) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action: string; blogId: string; hint?: string; keyword?: string; ids?: string[] }>(req);
    if (!b.blogId) return fail("블로그를 선택하세요.");
    if (b.action === "recommend") {
      try {
        return ok(await recommendKeywords(b.blogId, b.hint ?? ""));
      } catch (e) {
        return fail((e as Error).message, 502);
      }
    }
    if (b.action === "add") return ok({ id: await addUserKeyword(b.blogId, b.keyword ?? "") }, 201);
    if (b.action === "dismiss" && b.ids?.length) {
      await q("UPDATE keyword_picks SET status='dismissed' WHERE blog_id=$1 AND id = ANY($2) AND status='new'", [b.blogId, b.ids]);
      return ok({ ok: true });
    }
    return fail("알 수 없는 요청");
  });
}
