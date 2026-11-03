import { q } from "@/lib/db";
import { deriveSeasonKeywords, keywordsToIdeas } from "@/lib/marketing";
import type { ProviderId } from "@/lib/types";
import { body, fail, handle, ok } from "@/lib/api";

/**
 * derive   : AI로 시즌 키워드 도출
 * to-ideas : 선택한 키워드(또는 출발 키워드)를 글감 보관함으로
 * delete   : 키워드 삭제
 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{
      action: string;
      blogId: string;
      year: number;
      eventKey: string;
      hint?: string;
      ids?: string[];
      seeds?: string[];
      provider?: ProviderId;
      model?: string;
    }>(req);
    if (!b.blogId) return fail("블로그를 선택하세요.");
    const year = Number(b.year);
    if (b.action === "derive") {
      try {
        return ok(
          await deriveSeasonKeywords({
            blogId: b.blogId,
            year,
            eventKey: b.eventKey,
            hint: b.hint,
            override: b.provider && b.model ? { provider: b.provider, model: b.model } : null,
          }),
        );
      } catch (e) {
        const m = (e as Error).message;
        return fail(m, /AI 연결|찾을 수 없/.test(m) ? 400 : 502);
      }
    }
    if (b.action === "to-ideas") {
      if (!b.ids?.length && !b.seeds?.length) return fail("보낼 키워드를 선택하세요.");
      return ok(await keywordsToIdeas({ blogId: b.blogId, year, eventKey: b.eventKey, ids: b.ids, seeds: b.seeds }));
    }
    if (b.action === "delete" && b.ids?.length) {
      await q("DELETE FROM season_keywords WHERE blog_id=$1 AND id = ANY($2)", [b.blogId, b.ids]);
      return ok({ ok: true });
    }
    return fail("알 수 없는 요청");
  });
}
