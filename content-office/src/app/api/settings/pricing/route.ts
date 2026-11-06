import { body, fail, handle, ok } from "@/lib/api";
import { refreshPricing } from "@/lib/pricing-refresh";

/** 단가 새로고침 (공개 가격표와 비교해 바뀐 모델만 반영) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ keys?: string[] }>(req);
    const keys = (Array.isArray(b.keys) ? b.keys : []).filter((k) => typeof k === "string" && /^(openai|anthropic|google):[\w.\-:]+$/.test(k)).slice(0, 50);
    try {
      return ok(await refreshPricing(keys));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
