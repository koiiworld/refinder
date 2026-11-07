import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteEdit, getEdit, saveEdit, startCaptions, startEditRender, startReverse } from "@/lib/edit";
import type { EditDoc } from "@/remotion/edit-types";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const e = await getEdit((await ctx.params).id);
    return e ? ok(e) : fail("찾을 수 없어요.", 404);
  });
}
/** { doc, title } 저장 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ doc?: EditDoc; title?: string }>(req);
    try {
      return ok({ doc: await saveEdit((await ctx.params).id, b.doc as EditDoc, b.title) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
/** action: render {resolution} · captions · reverse {clipId} (맥에서) */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; resolution?: string; clipId?: string }>(req);
    try {
      if (b.action === "render") await startEditRender(id, String(b.resolution ?? "1080p"));
      else if (b.action === "captions") await startCaptions(id);
      else if (b.action === "reverse") await startReverse(id, String(b.clipId ?? ""));
      else return fail("알 수 없는 작업이에요.");
      return ok(await getEdit(id));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteEdit((await ctx.params).id);
    return ok({ ok: true });
  });
}
