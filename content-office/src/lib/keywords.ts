import "server-only";
import { q, newId, j } from "./db";
import { getBlogForAi } from "./repo";
import { extractJson, runStep } from "./ai/run";
import { keywordsPrompt } from "./ai/step-prompts";
import { addDays, blogTags, seasonEvents, seedsFor } from "./seasons";
import { creatorTrendContext } from "./creator";
import { keywordStats, naverAdConnected, type KeywordStat } from "./searchad";
import { naverConnected, naverTrend } from "./research";
import { trending, youtubeConnected, frequentTerms } from "./youtube";
import { WorkflowError } from "./workflow";

export interface KeywordPick {
  id: string;
  blog_id: string;
  batch_id: string;
  keyword: string;
  reason: string;
  season: string;
  origin: "ai" | "naver_related" | "user";
  volume: KeywordStat | null;
  trend: { recent: number; prev: number; dir: "up" | "flat" | "down" } | null;
  status: "new" | "used" | "dismissed";
  project_id: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** 60일 안에 준비하거나 진행 중인 시즌 */
function seasonContext(category: string) {
  const today = kst();
  const y = Number(today.slice(0, 4));
  return [...seasonEvents(y), ...seasonEvents(y + 1)]
    .filter((e) => e.end >= today && addDays(e.start, -e.leadDays) <= addDays(today, 30))
    .slice(0, 6)
    .map((e) => `- ${e.name} (${e.start}${e.end !== e.start ? `~${e.end}` : ""}) 출발 키워드: ${seedsFor(e, category).slice(0, 6).join(", ")}`)
    .join("\n");
}

const YT_CAT: Record<string, string> = { food: "26", it: "28", parenting: "22", travel: "19", life: "26" };

/** 유튜브 인기 급상승에서 자주 나온 단어 (6시간 안에 조회한 값이 있으면 재사용) */
async function youtubeContext(category: string) {
  if (!youtubeConnected()) return "";
  const cat = YT_CAT[blogTags(category)[0]] ?? "";
  try {
    const cached = await q<{ data: { terms: { term: string; videos: number }[] } }>(
      "SELECT data FROM research_snapshots WHERE source='youtube_trending' AND query->>'categoryId'=$1 AND collected_at > NOW() - INTERVAL '6 hours' ORDER BY collected_at DESC LIMIT 1",
      [cat],
    );
    const terms = cached[0]?.data.terms ?? (await trending(cat)).terms;
    return terms.slice(0, 20).map((t) => t.term).join(", ");
  } catch {
    return "";
  }
}
void frequentTerms;

async function trends(keywords: string[]) {
  const out: Record<string, KeywordPick["trend"]> = {};
  if (!naverConnected() || !keywords.length) return out;
  const end = kst();
  const start = addDays(end, -95);
  for (let i = 0; i < keywords.length; i += 5) {
    try {
      const r = await naverTrend({ blogId: null, keywords: keywords.slice(i, i + 5), startDate: start, endDate: end, timeUnit: "month" });
      for (const res of (r.data as { results?: { title: string; data: { ratio: number }[] }[] }).results ?? []) {
        const d = res.data.map((x) => x.ratio);
        if (d.length < 2) continue;
        const recent = d[d.length - 1];
        const prev = d.slice(0, -1).reduce((a, b) => a + b, 0) / (d.length - 1);
        out[res.title] = { recent, prev, dir: recent > prev * 1.2 ? "up" : recent < prev * 0.8 ? "down" : "flat" };
      }
    } catch {
      /* 추세는 선택 데이터 */
    }
  }
  return out;
}

/** ① 블로그별 키워드 추천: AI 후보 + 네이버 연관 키워드 → 실제 검색량·추세 부착 → 검색량 순 */
export async function recommendKeywords(blogId: string, hint = "") {
  const blog = await getBlogForAi(blogId);
  if (!blog) throw new WorkflowError("블로그를 찾을 수 없습니다.");
  const existing = await q<{ keyword: string }>("SELECT keyword FROM keyword_picks WHERE blog_id=$1 AND created_at > NOW() - INTERVAL '60 days'", [blogId]);
  const { system, prompt } = keywordsPrompt(blog, {
    seasons: seasonContext(blog.category),
    creator: await creatorTrendContext(blogId),
    youtube: await youtubeContext(blog.category),
    existing: existing.map((e) => e.keyword).slice(0, 80),
    hint,
  });
  const res = await runStep({ step: "keywords", role: "ideas", purpose: "keywords", blog, system, prompt, json: true, retries: 1, maxTokens: 3000 });
  const ai = (extractJson<{ keywords?: { keyword?: string; reason?: string; season?: string }[] }>(res.text).keywords ?? [])
    .map((k) => ({ keyword: String(k.keyword ?? "").trim(), reason: String(k.reason ?? ""), season: String(k.season ?? "") }))
    .filter((k) => k.keyword);

  // 네이버 실제 검색량 + 연관 키워드
  let stats: Record<string, KeywordStat | null> = {};
  let related: KeywordStat[] = [];
  if (naverAdConnected() && ai.length) {
    try {
      const r = await keywordStats(ai.map((k) => k.keyword), { withRelated: true });
      stats = r.stats;
      const have = new Set(ai.map((k) => k.keyword.replace(/\s+/g, "")));
      related = r.related.filter((x) => !have.has(x.keyword) && x.total >= 100).slice(0, 10);
    } catch {
      /* 검색량은 선택 데이터 */
    }
  }
  const list = [
    ...ai.map((k) => ({ ...k, origin: "ai" as const, volume: stats[k.keyword] ?? null })),
    ...related.map((r) => ({ keyword: r.keyword, reason: "네이버 연관 키워드 (검색량 상위)", season: "", origin: "naver_related" as const, volume: r })),
  ];
  const tr = await trends(list.slice(0, 15).map((k) => k.keyword));
  const batch = newId("kb_");
  for (const k of list) {
    await q(
      `INSERT INTO keyword_picks (id, blog_id, batch_id, keyword, reason, season, origin, volume, trend, provider, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [newId("kp_"), blogId, batch, k.keyword, k.reason, k.season, k.origin, j(k.volume), j(tr[k.keyword] ?? null), res.provider, res.model],
    );
  }
  return { batch, count: list.length, provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null };
}

/** 사용자가 직접 넣은 키워드 (검색량은 있으면 붙임) */
export async function addUserKeyword(blogId: string, keyword: string) {
  const kw = keyword.trim();
  if (!kw) throw new WorkflowError("키워드를 입력하세요.");
  let vol: KeywordStat | null = null;
  if (naverAdConnected()) {
    try {
      vol = (await keywordStats([kw])).stats[kw] ?? null;
    } catch {
      /* 무시 */
    }
  }
  const id = newId("kp_");
  await q("INSERT INTO keyword_picks (id, blog_id, batch_id, keyword, reason, origin, volume) VALUES ($1,$2,'user',$3,'직접 입력','user',$4)", [id, blogId, kw, j(vol)]);
  return id;
}

export async function listPicks(blogId: string) {
  return q<KeywordPick>(
    "SELECT * FROM keyword_picks WHERE blog_id=$1 AND status <> 'dismissed' AND created_at > NOW() - INTERVAL '30 days' ORDER BY (status='used'), created_at DESC",
    [blogId],
  );
}
