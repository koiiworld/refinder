import { createPrompt, listPrompts } from "@/lib/promptlab";
import type { ProviderId } from "@/lib/types";
import { body, handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => ok(await listPrompts()));
}

/** 새 프롬프트 다듬기 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ target: string; kind: string; media?: string; blogId?: string; text: string; goal?: string; title?: string; provider?: ProviderId; model?: string }>(req);
    const row = await createPrompt({
      ...b,
      override: b.provider && b.model ? { provider: b.provider, model: b.model } : null,
    });
    return ok(row, 201);
  });
}
