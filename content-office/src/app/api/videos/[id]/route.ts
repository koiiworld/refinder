import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { addEdit, deleteVideo, getVideo, type EditOptions } from "@/lib/videos";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const v = await getVideo((await ctx.params).id);
    return v ? ok(v) : fail("영상을 찾을 수 없습니다.", 404);
  });
}

/** action: edit (편집본 만들기) */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; opts?: EditOptions }>(req);
    try {
      if (b.action === "edit") return ok({ id: await addEdit(id, b.opts ?? {}) });
      return fail("알 수 없는 작업입니다.");
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteVideo((await ctx.params).id);
    return ok({ ok: true });
  });
}
