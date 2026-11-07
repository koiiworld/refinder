import "server-only";
import { extractJson, runStep } from "./ai/run";
import { naverSearch } from "./diagnose";

/**
 * ③-2 기획안 '확인 필요' 사실을 AI가 확인 (무료 Gemini + 네이버 뉴스·블로그 검색 결과)
 * - 검색 결과에 뒷받침하는 내용이 있으면 확인완료(+출처 주소), 없거나 다르면 확인안됨
 * - 검색 결과에 없는 내용은 지어내지 않음 → 애매하면 확인안됨
 */
export type ClaimIn = { claim: string; evidence: string; source: string; comment?: string };

/** 개인 블로그·카페·커뮤니티 주소 (공식 자료로 치지 않음) */
export const PERSONAL_RE = /(blog\.naver\.com|m\.blog\.naver\.com|cafe\.naver\.com|tistory\.com|brunch\.co\.kr|velog\.io|blog\.daum\.net|cafe\.daum\.net|medium\.com|blogspot\.|wordpress\.com|instagram\.com|youtube\.com|youtu\.be|kin\.naver\.com|dcinside|theqoo|fmkorea|clien\.net|ruliweb)/i;
/** 코멘트가 '공식 자료로' 같은 요청인지 */
export const wantsOfficial = (c = "") => /공식|정부|기관|공공|법령|보도자료|1차\s*자료|원문|official/i.test(c);
export type Verdict = { status: "verified" | "unverified"; note: string; source: string };

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;|&gt;/g, "").trim();

export async function verifyClaims(projectId: string, topic: string, claims: ClaimIn[]): Promise<Verdict[]> {
  if (!claims.length) return [];
  const evidence: string[] = [];
  for (const [i, c] of claims.slice(0, 8).entries()) {
    const official = wantsOfficial(c.comment);
    const query = `${topic} ${c.claim}${official ? " 공식" : ""}`.replace(/[^\p{L}\p{N}\s.%]/gu, " ").replace(/\s+/g, " ").slice(0, 70);
    const found: string[] = [];
    // 공식 자료 요청이면 개인 블로그는 빼고 뉴스·웹문서에서, 개인 블로그·카페 주소는 버림
    for (const kind of official ? (["news", "webkr"] as const) : (["news", "blog"] as const)) {
      try {
        const r = await naverSearch(kind, query, kind === "blog" ? 3 : 5, "sim");
        for (const it of r.items) {
          const url = String(it.originallink || it.link || "");
          if (official && PERSONAL_RE.test(url)) continue;
          found.push(`- (${kind === "news" ? "뉴스" : kind === "webkr" ? "웹문서" : "블로그"}) ${strip(String(it.title ?? ""))}: ${strip(String(it.description ?? "")).slice(0, 200)} <${url}>`);
        }
      } catch {
        /* 검색이 안 되면 그 사실은 확인안됨으로 */
      }
    }
    evidence.push(`[사실 ${i + 1}] ${c.claim}\n근거(AI가 적은 것): ${c.evidence}${c.comment ? `\n사용자 코멘트(반드시 지켜서 판단): ${c.comment}` : ""}${official ? "\n→ 공식 자료(정부·공공기관·기업 공식 사이트·언론 보도)만 근거로 인정. 개인 블로그·카페·커뮤니티는 인정하지 않음." : ""}\n검색 결과:\n${found.join("\n") || "(없음)"}`);
  }
  const res = await runStep({
    step: "factcheck", role: "ideas", purpose: "factcheck", blog: null, projectId, json: true, maxTokens: 2500, retries: 0,
    system: "너는 꼼꼼한 한국어 팩트체커야. 반드시 함께 준 검색 결과만 보고 판단해. 검색 결과로 뒷받침되면 verified, 결과가 없거나·다르거나·애매하면 unverified. 사용자 코멘트가 있으면 그 조건을 꼭 지켜. 지어내지 마. JSON만.",
    prompt: `${evidence.join("\n\n")}\n\n사실마다 판단해서 {"results": [{"i": 1, "status": "verified|unverified", "note": "한 줄 이유 (한국어)", "source": "뒷받침한 검색 결과 주소 또는 빈칸"}]} 로 답해.`,
    template: () => JSON.stringify({ results: claims.map((_, i) => ({ i: i + 1, status: "unverified", note: "확인할 검색 결과가 없어요", source: "" })) }),
  });
  const raw = extractJson<{ results?: { i?: number; status?: string; note?: string; source?: string }[] }>(res.text).results ?? [];
  return claims.map((c, i) => {
    const r = raw.find((x) => Number(x.i) === i + 1);
    let ok = r?.status === "verified";
    const src = String(r?.source ?? "").trim();
    let note = String(r?.note ?? "확인하지 못했어요").slice(0, 200);
    // 공식 자료를 요청했는데 근거가 개인 블로그 등이면 확인안됨으로
    if (ok && wantsOfficial(c.comment) && (!/^https?:\/\//.test(src) || PERSONAL_RE.test(src))) {
      ok = false;
      note = `공식 자료에서 확인되지 않았어요 (근거가 개인 블로그·커뮤니티라 인정 안 함)`;
    }
    return { status: ok ? "verified" : "unverified", note, source: ok && /^https?:\/\//.test(src) ? src.slice(0, 300) : wantsOfficial(c.comment) && PERSONAL_RE.test(c.source) ? "" : c.source };
  });
}
