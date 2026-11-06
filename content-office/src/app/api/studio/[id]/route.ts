import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteStudio, estimateClips, makeCharacter, makeSceneClip, makeSceneImage, plan, refreshStudio, startRender, updateStudio, getStudio, type StudioCharacter, type StudioOptions, type StudioPlan, type StudioScene } from "@/lib/studio";

/** 상태 (진행 중인 장면 영상은 Higgsfield에 확인해 갱신) */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const s = await refreshStudio((await ctx.params).id);
    return s ? ok(s) : fail("프로젝트를 찾을 수 없습니다.", 404);
  });
}

/** 기획 직접 고치기 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const b = await body<{ character?: Partial<StudioCharacter>; scenes?: Partial<StudioScene>[]; plan?: Partial<StudioPlan>; options?: Partial<StudioOptions> }>(req);
    try {
      return ok(await updateStudio((await ctx.params).id, b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

/** action: replan · character · scene_image · estimate · scene_clip · render */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const origin = new URL(req.url).origin;
    const b = await body<{ action?: string; index?: number; feedback?: string }>(req);
    try {
      switch (b.action) {
        case "replan":
          await plan(id, String(b.feedback ?? "").slice(0, 2000));
          return ok(await getStudio(id));
        case "character":
          return ok(await makeCharacter(id));
        case "scene_image":
          return ok(await makeSceneImage(id, Number(b.index)));
        case "estimate":
          return ok(await estimateClips(id, origin));
        case "scene_clip":
          return ok(await makeSceneClip(id, Number(b.index), origin));
        case "render":
          await startRender(id);
          return ok(await getStudio(id));
        default:
          return fail("알 수 없는 작업입니다.");
      }
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteStudio((await ctx.params).id);
    return ok({ ok: true });
  });
}
