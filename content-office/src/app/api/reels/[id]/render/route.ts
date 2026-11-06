import { fail, handle, ok, type Ctx } from "@/lib/api";
import { startReelRender } from "@/lib/reels";

/** 내보내기 (맥에서 Remotion으로 만들어 영상공장에 저장) */
export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    try {
      await startReelRender((await ctx.params).id);
      return ok({ ok: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
