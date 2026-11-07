import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { analyzeLearning, updateLearning } from "@/lib/learning";
export async function POST(req: Request, ctx: Ctx) {
  return handle(async()=>{
    const b = await body(req);
    if (b.confirm !== true) return fail("예상 비용을 확인하고 학습 버튼을 눌러 주세요.");
    try { return ok(await analyzeLearning((await ctx.params).id)); } catch(e) { return fail((e as Error).message); }
  });
}
export async function PATCH(req: Request, ctx: Ctx) { return handle(async()=>{ try { return ok(await updateLearning((await ctx.params).id, await body(req))); } catch(e) { return fail((e as Error).message); } }); }
