import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { getRepurpose, repurpose } from "@/lib/repurpose";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => ok(await getRepurpose((await ctx.params).id)));
}

/** { channels: ['reel','cards',...] } 고른 채널만 만들기 (AI 1회) */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ channels?: string[] }>(req);
    try {
      return ok(await repurpose((await ctx.params).id, Array.isArray(b.channels) ? b.channels.map(String) : []));
    } catch (e) {
      return fail((e as Error).message, 400);
    }
  });
}
