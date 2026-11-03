import { q } from "@/lib/db";
import { Ctx, handle, ok } from "@/lib/api";

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await q("DELETE FROM marketing_events WHERE id=$1", [(await params).id]);
    return ok({ ok: true });
  });
}
