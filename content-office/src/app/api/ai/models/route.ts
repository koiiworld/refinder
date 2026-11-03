import { connectionStatus, listModels } from "@/lib/ai/providers";
import { hfTest, HF_MODELS } from "@/lib/higgsfield";
import { fail, handle, ok } from "@/lib/api";

/** 연결 상태 및 공식 API 기준 사용 가능한 모델 목록 */
export async function GET(req: Request) {
  return handle(async () => {
    const provider = new URL(req.url).searchParams.get("provider");
    if (!provider) return ok({ connections: connectionStatus() });
    if (provider === "higgsfield") {
      // 공개된 모델 목록 API가 없어, 비용 없는 인증 확인 + 앱이 지원하는 모델을 보여줌
      try {
        const t = await hfTest();
        return ok({ models: Object.values(HF_MODELS).map((m) => `${m.label}: ${m.path}`), note: `인증 성공 · SOUL 스타일 ${t.styles}개 조회` });
      } catch (e) {
        return fail((e as Error).message, 502);
      }
    }
    if (!["openai", "anthropic", "google"].includes(provider)) return fail("알 수 없는 제공자");
    try {
      return ok({ models: await listModels(provider as "openai" | "anthropic" | "google") });
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
