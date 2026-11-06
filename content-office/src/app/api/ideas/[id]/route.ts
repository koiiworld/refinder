import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteIdea, getIdea, updateIdea } from "@/lib/ideas";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const i = await getIdea((await ctx.params).id);
    return i ? ok(i) : fail("아이디어를 찾을 수 없습니다.", 404);
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ memo?: string; blog_id?: string | null; link?: string }>(req);
    try {
      return ok(await updateIdea((await ctx.params).id, b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteIdea((await ctx.params).id);
    return ok({ ok: true });
  });
}
