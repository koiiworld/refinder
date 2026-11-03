import { savePlan } from "@/lib/workflow";
import { projectBundle } from "@/lib/bundle";
import type { Plan } from "@/lib/types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

/** 기획안 직접 수정 */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ plan: Plan }>(req);
    if (!b.plan || !Array.isArray(b.plan.outline)) return fail("기획안 형식이 올바르지 않습니다.");
    await savePlan(id, b.plan);
    return ok(await projectBundle(id));
  });
}
