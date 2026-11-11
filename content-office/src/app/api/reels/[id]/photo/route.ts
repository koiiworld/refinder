import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { addReelPhoto } from "@/lib/reels";

/** 릴스에 사진 올리기 { dataUrl } → { url } */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ dataUrl?: string }>(req);
    try {
      return ok({ url: await addReelPhoto((await ctx.params).id, String(b.dataUrl ?? "")) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
