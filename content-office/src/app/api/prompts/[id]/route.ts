import { q } from "@/lib/db";
import { getPrompt, refineAgain, restorePromptVersion, saveManual } from "@/lib/promptlab";
import type { RefineResult } from "@/lib/prompt-guides";
import type { ProviderId } from "@/lib/types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const row = await getPrompt((await params).id);
    return row ? ok(row) : fail("프롬프트 없음", 404);
  });
}

/** refine(추가 수정 요청) | save(직접 수정 저장) | restore(이전 버전) | rename */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ action: string; feedback?: string; result?: RefineResult; n?: number; title?: string; provider?: ProviderId; model?: string }>(req);
    const override = b.provider && b.model ? { provider: b.provider, model: b.model } : null;
    switch (b.action) {
      case "refine":
        return ok(await refineAgain(id, b.feedback ?? "", override));
      case "save":
        return ok(await saveManual(id, b.result as RefineResult));
      case "restore":
        return ok(await restorePromptVersion(id, Number(b.n)));
      case "rename":
        await q("UPDATE prompts SET title=$2, updated_at=NOW() WHERE id=$1", [id, String(b.title ?? "").slice(0, 100)]);
        return ok(await getPrompt(id));
      default:
        return fail("알 수 없는 요청");
    }
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await q("DELETE FROM prompts WHERE id=$1", [(await params).id]);
    return ok({ ok: true });
  });
}
