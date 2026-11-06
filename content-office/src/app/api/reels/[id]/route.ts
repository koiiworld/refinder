import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteReel, getReel, saveDoc } from "@/lib/reels";
import type { ReelDoc } from "@/remotion/types";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const r = await getReel((await ctx.params).id);
    return r ? ok(r) : fail("릴스를 찾을 수 없어요.", 404);
  });
}

/** { doc, title? } 편집 저장 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ doc?: ReelDoc; title?: string }>(req);
    try {
      return ok({ doc: await saveDoc((await ctx.params).id, b.doc as ReelDoc, b.title) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteReel((await ctx.params).id);
    return ok({ ok: true });
  });
}
