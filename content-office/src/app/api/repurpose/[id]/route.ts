import { fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteRepurpose, getRepurposeDoc } from "@/lib/repurpose";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const d = await getRepurposeDoc((await ctx.params).id);
    return d ? ok(d) : fail("찾을 수 없어요.", 404);
  });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteRepurpose((await ctx.params).id);
    return ok({ ok: true });
  });
}
