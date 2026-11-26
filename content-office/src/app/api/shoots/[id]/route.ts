import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { approveShoot, deleteShoot, getShoot, retryShoot, reviseShoot, saveShootScript } from "@/lib/shoots";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const s = await getShoot((await ctx.params).id);
    return s ? ok(s) : fail("찾을 수 없어요.", 404);
  });
}

/** action: save {script} 대본 고친 것 저장 · approve {script?} 승인 → 영상 만들기 · revise {feedback, confirm} AI에게 수정 요청(유료) · retry {confirm} 멈춘 단계부터 다시 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; script?: unknown; feedback?: string; confirm?: boolean }>(req);
    try {
      if (b.action === "save") await saveShootScript(id, b.script);
      else if (b.action === "approve") await approveShoot(id, b.script);
      else if (b.action === "revise") {
        if (b.confirm !== true) return fail("예상 비용을 확인한 뒤 요청해 주세요.");
        await reviseShoot(id, String(b.feedback ?? ""));
      } else if (b.action === "retry") {
        if (b.confirm !== true) return fail("확인한 뒤 다시 시작해 주세요.");
        await retryShoot(id);
      } else return fail("알 수 없는 요청이에요.");
      return ok(await getShoot(id));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteShoot((await ctx.params).id);
    return ok({ ok: true });
  });
}
