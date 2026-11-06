import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteStudy, getStudy, setCategory } from "@/lib/reel-study";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const s = await getStudy((await ctx.params).id);
    return s ? ok(s) : fail("찾을 수 없어요.", 404);
  });
}
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ category?: string }>(req);
    await setCategory((await ctx.params).id, String(b.category ?? ""));
    return ok(await getStudy((await ctx.params).id));
  });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteStudy((await ctx.params).id);
    return ok({ ok: true });
  });
}
