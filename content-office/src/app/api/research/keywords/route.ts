import { cachedStats, keywordStats, naverAdConnected } from "@/lib/searchad";
import { body, fail, handle, ok } from "@/lib/api";

/** 키워드 월간 검색량 (네이버 검색광고). cacheOnly 면 저장된 값만 반환 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ keywords: string[]; withRelated?: boolean; cacheOnly?: boolean; force?: boolean }>(req);
    const kws = Array.isArray(b.keywords) ? b.keywords.map(String) : [];
    if (!kws.length) return fail("키워드를 입력하세요.");
    if (b.cacheOnly) return ok({ stats: await cachedStats(kws), connected: naverAdConnected() });
    try {
      return ok({ ...(await keywordStats(kws, { withRelated: b.withRelated, force: b.force })), connected: true });
    } catch (e) {
      return fail((e as Error).message, naverAdConnected() ? 502 : 400);
    }
  });
}
