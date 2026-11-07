import { fail, type Ctx } from "@/lib/api";
import { getLearning } from "@/lib/learning";
export async function GET(req: Request, ctx: Ctx) {
  const index = Number(new URL(req.url).searchParams.get("index"));
  const r = await getLearning((await ctx.params).id);
  const image = Number.isInteger(index) && index >= 0 ? r?.images[index] : undefined;
  const m = image && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(image);
  if (!m) return fail("이미지를 찾지 못했어요.",404);
  return new Response(Buffer.from(m[2],"base64"), { headers:{ "content-type":m[1], "cache-control":"private, max-age=3600", "x-content-type-options":"nosniff" } });
}
