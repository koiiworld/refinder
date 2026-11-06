import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteTodo, updateTodo } from "@/lib/todos";

/** 수정 · 완료(done: true/false) · 알림 켜기/끄기 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<Parameters<typeof updateTodo>[1]>(req);
    try {
      return ok(await updateTodo((await ctx.params).id, b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteTodo((await ctx.params).id);
    return ok({ ok: true });
  });
}
