import { connectionStatus, listModels } from "@/lib/ai/providers";
import { fail, handle, ok } from "@/lib/api";

/** 연결 상태 및 공식 API 기준 사용 가능한 모델 목록 */
export async function GET(req: Request) {
  return handle(async () => {
    const provider = new URL(req.url).searchParams.get("provider");
    if (!provider) return ok({ connections: connectionStatus() });
    if (!["openai", "anthropic", "google"].includes(provider)) return fail("알 수 없는 제공자");
    try {
      return ok({ models: await listModels(provider as "openai" | "anthropic" | "google") });
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
