import { body, fail, handle, ok } from "@/lib/api";
import { createStudio, listStudio } from "@/lib/studio";
import { AiError } from "@/lib/ai/providers";

export async function GET() {
  return handle(async () => ok(await listStudio()));
}

/** ① 프롬프트로 기획 시작 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ prompt?: string; seconds?: number; style?: string; imageModel?: string; clipSeconds?: number; resolution?: string }>(req);
    try {
      return ok({ id: await createStudio({ prompt: String(b.prompt ?? ""), seconds: b.seconds, style: b.style, imageModel: b.imageModel, clipSeconds: b.clipSeconds, resolution: b.resolution }) });
    } catch (e) {
      return fail((e as Error).message, e instanceof AiError ? 502 : 400);
    }
  });
}
