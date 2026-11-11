import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { startReelRender } from "@/lib/reels";

/** 내보내기 (맥에서 Remotion으로 만들어 영상공장에 저장) */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    try {
      const b = await body<{ quality?: string }>(req).catch(() => ({ quality: undefined }));
      await startReelRender((await ctx.params).id, b.quality === "720" ? "720" : "1080");
      return ok({ ok: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
