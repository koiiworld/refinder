import { body, fail, handle, ok } from "@/lib/api";
import { estimateSteps } from "@/lib/estimate";
import { getVoice, listIgRuns, runIgTool, saveVoice } from "@/lib/ig-ops";
import { isIgTool } from "@/lib/ig-ops-types";

/** GET ?estimate=reel → 예상 비용 · 그 외 → 기록 목록 + 내 말투 */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const est = sp.get("estimate");
    if (est) return isIgTool(est) ? ok(await estimateSteps([`ig_${est}`])) : fail("알 수 없는 도구예요.");
    return ok({ runs: await listIgRuns(sp.get("tool") ?? undefined), voice: await getVoice() });
  });
}

/** action: voice {text} → 내 말투 저장 · run {tool, confirm:true, ...입력} → AI 1회 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<Record<string, unknown> & { action?: string; confirm?: boolean; tool?: string }>(req);
    if (b.action === "voice") return ok({ voice: await saveVoice(String(b.text ?? "")) });
    if (b.action !== "run") return fail("알 수 없는 요청이에요.");
    if (b.confirm !== true) return fail("모델과 예상 비용을 확인해 주세요.");
    try {
      return ok(await runIgTool(b as Parameters<typeof runIgTool>[0]), 201);
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
