import { body, fail, handle, ok } from "@/lib/api";
import { estimateSteps } from "@/lib/estimate";
import { SCRIPT_FIELDS, trendContext, writeReelScript, type ReelScriptInput } from "@/lib/reel-script";

/** 예상 비용 + 고른 분야에 저장된 트렌드 수 (AI 호출 없음) */
export async function GET(req: Request) {
  return handle(async () => {
    const field = new URL(req.url).searchParams.get("field") ?? "all";
    const [est, ctx] = await Promise.all([estimateSteps(["reel_script"]), trendContext(field)]);
    return ok({ ...est, counts: ctx.counts, fields: SCRIPT_FIELDS.map((f) => ({ id: f.id, label: f.label })) });
  });
}

/** 버튼을 눌러 비용을 확인한 뒤에만 실행 (confirm: true) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<ReelScriptInput & { confirm?: boolean }>(req);
    if (b.confirm !== true) return fail("모델과 예상 비용을 확인해 주세요.");
    try {
      return ok(await writeReelScript(b));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
