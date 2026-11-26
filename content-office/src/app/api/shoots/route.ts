import { body, fail, handle, ok } from "@/lib/api";
import { estimateSteps } from "@/lib/estimate";
import { createShoot, listShoots } from "@/lib/shoots";

/** 📹 현장 숏폼 목록 + 대본 예상 비용 (AI 호출 없음) */
export async function GET() {
  return handle(async () => ok({ list: await listShoots(), estimate: await estimateSteps(["shoot_script"]), faceEstimate: await estimateSteps(["shoot_face"]) }));
}

/** { videoIds, kind, memo, seconds, title, mosaic, refs, refUrls, confirm: true } 새 촬영 — 올리기 = 대본 AI 비용까지 승인 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ videoIds?: string[]; kind?: string; memo?: string; seconds?: number; title?: string; confirm?: boolean; mosaic?: boolean; refs?: string[]; refUrls?: string[] }>(req);
    if (b.confirm !== true) return fail("예상 비용을 확인한 뒤 시작해 주세요.");
    try {
      return ok({ id: await createShoot(b) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
