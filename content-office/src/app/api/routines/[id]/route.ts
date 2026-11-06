import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteRoutine, updateRoutine, type Routine } from "@/lib/routines";

export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    try {
      return ok(await updateRoutine((await ctx.params).id, await body<Partial<Routine>>(req)));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteRoutine((await ctx.params).id);
    return ok({ ok: true });
  });
}
