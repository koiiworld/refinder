import { q } from "@/lib/db";
import { body, fail, handle, ok } from "@/lib/api";
import { moveToTrash, purge, restoreFromTrash } from "@/lib/trash";

export async function GET() {
  return handle(async () =>
    ok(
      await q(
        `SELECT p.id, p.blog_id, p.title, p.topic, p.stage, p.status, p.deleted_at, b.name AS blog_name, b.color AS blog_color
         FROM projects p JOIN blogs b ON b.id=p.blog_id WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`,
      ),
    ),
  );
}

/** action: trash(휴지통으로) | restore(되살리기) | purge(완전 삭제) | empty(휴지통 비우기) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action: string; ids?: string[] }>(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    if (b.action !== "empty" && !ids.length) return fail("글을 선택하세요.");
    switch (b.action) {
      case "trash":
        return ok({ count: await moveToTrash(ids) });
      case "restore":
        return ok({ count: await restoreFromTrash(ids) });
      case "purge":
        return ok({ count: await purge(ids) });
      case "empty":
        return ok({ count: await purge("all") });
      default:
        return fail("알 수 없는 요청");
    }
  });
}
