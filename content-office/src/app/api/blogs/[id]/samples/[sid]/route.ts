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
    await q("DELETE FROM blog_samples WHERE id=$1 AND blog_id=$2", [sid, id]);
    return ok({ ok: true });
  });
}
