import {createFromRepurpose} from "@/lib/carousel";
import { body,fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteRepurpose, getRepurposeDoc } from "@/lib/repurpose";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const d = await getRepurposeDoc((await ctx.params).id);
    return d ? ok(d) : fail("찾을 수 없어요.", 404);
  });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteRepurpose((await ctx.params).id);
    return ok({ ok: true });
  });
}

export async function POST(req:Request,ctx:Ctx){return handle(async()=>{const b=await body(req);if(b.action!=='carousel')return fail('알 수 없는 요청이에요.');try{return ok({id:await createFromRepurpose((await ctx.params).id)},201);}catch(e){return fail((e as Error).message);}});}
