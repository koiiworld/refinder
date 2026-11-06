import { body, handle, ok, type Ctx } from "@/lib/api";
import { getKit, saveKit, type ImageKit } from "@/lib/image-refs";

/** 🎨 블로그 이미지 컨셉 키트 (레퍼런스·스타일 문구·Soul ID·켜기) */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => ok(await getKit((await ctx.params).id)));
}

export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => ok(await saveKit((await ctx.params).id, await body<Partial<ImageKit>>(req))));
}
