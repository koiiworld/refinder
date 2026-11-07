import { q } from "@/lib/db";
import { body, fail, handle, ok } from "@/lib/api";

type P = { params: Promise<{ id: string; sid: string }> };

/** 사용 여부 전환 */
export async function PATCH(req: Request, { params }: P) {
  return handle(async () => {
    const { id, sid } = await params;
    const b = await body<{ enabled?: boolean }>(req);
    if (typeof b.enabled !== "boolean") return fail("변경할 값이 없습니다.");
    await q("UPDATE blog_samples SET enabled=$3 WHERE id=$1 AND blog_id=$2", [sid, id, b.enabled]);
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, { params }: P) {
  return handle(async () => {
    const { id, sid } = await params;
    // 휴지통으로 (30일 뒤 자동 완전 삭제)
    if ((await q("SELECT id FROM blog_samples WHERE id=$1 AND blog_id=$2", [sid, id])).length) await (await import("@/lib/trash-snap")).snapToTrash("sample", sid);
    return ok({ ok: true });
  });
}
