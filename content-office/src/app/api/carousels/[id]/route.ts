import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { addUpload, deleteCarousel, generate, getCarousel, importBlogImages, regenerateHooks, saveCarousel, switchType, type CarouselStyle, type ContentTypeId, type Slide, removeImage, restoreImage } from "@/lib/carousel";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const c = await getCarousel((await ctx.params).id);
    return c ? ok(c) : fail("캐러셀을 찾을 수 없습니다.", 404);
  });
}

/** 장면·캡션·해시태그·디자인 저장 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ title?: string; slides?: Slide[]; caption?: string; hashtags?: string[]; style?: Partial<CarouselStyle> & { contentType?: ContentTypeId } }>(req);
    try {
      await saveCarousel(id, b);
      return ok(await getCarousel(id));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

/** action: regenerate(AI 다시 만들기, feedback) · upload(내 사진 추가, dataUrl) */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; index?: number; at?: string; feedback?: string; dataUrl?: string; url?: string; type?: ContentTypeId; slides?: Slide[]; caption?: string; hashtags?: string[] }>(req);
    try {
      if (b.action === "regenerate") await generate(id, String(b.feedback ?? "").slice(0, 2000));
      else if (b.action === "switch_type") {
        const r = await switchType(id, b.type as ContentTypeId, { slides: b.slides, caption: b.caption, hashtags: b.hashtags });
        return ok({ ...(await getCarousel(id)), reused: r.reused });
      } else if (b.action === "hooks") {
        await regenerateHooks(id);
      }
      else if (b.action === "upload") {
        const index = await addUpload(id, String(b.dataUrl ?? ""));
        return ok({ index, carousel: await getCarousel(id) });
      } else if (b.action === "remove_image") {
        return ok(await removeImage(id, Number(b.index), b.slides));
      } else if (b.action === "restore_image") {
        return ok(await restoreImage(id, String(b.at ?? ""), String(b.url ?? "")));
      } else if (b.action === "import_images") {
        const added = await importBlogImages(id, String(b.url ?? ""));
        return ok({ added, carousel: await getCarousel(id) });
      } else return fail("알 수 없는 작업입니다.");
      return ok(await getCarousel(id));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteCarousel((await ctx.params).id);
    return ok({ ok: true });
  });
}
