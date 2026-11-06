import "server-only";
import { q, q1, newId, j } from "./db";
import { getBlogForAi } from "./repo";
import { blogContext } from "./ai/prompts";
import { extractJson, runStep } from "./ai/run";
import { naverSearch } from "./diagnose";
import { hotTab } from "./blog-hot";
import { blogTags } from "./seasons";
import { writtenTitles } from "./blog-posts";
import { addUserKeyword } from "./keywords";
import { createPosts, WorkflowError } from "./workflow";
import type { PostBrief } from "./posts-types";

/**
 * 📋 블로그 글감 추천 리포트
 * 1) 실시간 이슈 수집: 구글 트렌드(한국) · 네이버 뉴스(블로그 분야별) · 네이버 블로그 홈 인기 글
 * 2) AI 분석·검증: 중복 제거 · 이슈 시점 · 출처 확인 · 화제성 평가 (출처 번호로만 근거)
 * 3) 리포트: 추천 제목 · 원출처 링크 · 선정 이유 · 콘텐츠 방향
 * 4) 사용자 승인 → 그 글감으로 ③ 제목 추천부터 시작 (자동으로 쓰지 않음)
 */

export type Issue = { id: string; source: "구글 트렌드" | "네이버 뉴스" | "블로그 홈"; title: string; detail: string; url: string; at: string | null; signal: string };
export type ReportItem = {
  issue: string;
  keyword: string;
  title: string;
  why: string;
  direction: string;
  hotness: number;
  timing: string;
  sources: { title: string; url: string; source: string }[];
  status: "new" | "approved" | "skipped";
  projectId?: string;
};
export type HotReport = { id: string; blogId: string; at: string; items: ReportItem[]; collected: Record<string, number>; errors: string[]; ai?: { provider: string; model: string } };

const NEWS_SEEDS: Record<string, string[]> = {
  food: ["제철 음식", "레시피", "외식 물가", "편의점 신상"],
  parenting: ["육아 지원금", "어린이집", "아동수당", "출산 지원"],
  it: ["신제품 출시", "아이폰", "갤럭시", "AI 서비스"],
  travel: ["축제", "여행지 추천"],
  life: ["생활 지원금", "생활 정보"],
};
const HOT_OF: Record<string, string> = { food: "food", parenting: "kids", it: "it", travel: "travel", life: "life" };

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
const tag = (x: string, t: string) => decode(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i").exec(x)?.[1] ?? "");

/** 구글 트렌드 한국 '지금 뜨는 검색어' (공개 RSS) */
export async function googleTrends(): Promise<{ title: string; traffic: string; at: string | null; news: { title: string; url: string; source: string }[] }[]> {
  const url = process.env.GOOGLE_TRENDS_RSS_URL?.trim() || "https://trends.google.com/trending/rss?geo=KR";
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)" }, signal: AbortSignal.timeout(10_000) });
  const { markFail, markOk } = await import("./health");
  if (!res.ok) {
    await markFail("google_trends", `HTTP ${res.status}`);
    throw new Error(`구글 트렌드 응답 오류 (HTTP ${res.status})`);
  }
  const xml = await res.text();
  if (!/<item>/.test(xml)) await markFail("google_trends", "검색어 목록이 비어 있음");
  else await markOk("google_trends");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const pub = tag(it, "pubDate");
    const d = pub ? new Date(pub) : null;
    return {
      title: tag(it, "title"),
      traffic: tag(it, "ht:approx_traffic"),
      at: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      news: [...it.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((n) => ({ title: tag(n[1], "ht:news_item_title"), url: tag(n[1], "ht:news_item_url"), source: tag(n[1], "ht:news_item_source") })).filter((n) => /^https?:\/\//.test(n.url)).slice(0, 3),
    };
  }).filter((t) => t.title);
}

async function collect(category: string) {
  const tags = blogTags(category).filter((t) => t !== "all");
  const issues: Issue[] = [];
  const errors: string[] = [];
  try {
    for (const t of await googleTrends()) {
      issues.push({ id: `g${issues.length + 1}`, source: "구글 트렌드", title: t.title, detail: t.news.map((n) => n.title).join(" / "), url: t.news[0]?.url ?? `https://trends.google.com/trends/explore?geo=KR&q=${encodeURIComponent(t.title)}`, at: t.at, signal: `검색 ${t.traffic}` });
    }
  } catch (e) {
    errors.push(`구글 트렌드: ${(e as Error).message}`);
  }
  const cutoff = Date.now() - 3 * 86400000;
  for (const seed of tags.flatMap((t) => NEWS_SEEDS[t] ?? []).slice(0, 6)) {
    try {
      const r = await naverSearch("news", seed, 10, "date");
      for (const n of r.items) {
        const at = n.pubDate ? new Date(n.pubDate) : null;
        if (at && at.getTime() < cutoff) continue;
        if (issues.some((x) => x.title === n.title)) continue;
        issues.push({ id: `n${issues.length + 1}`, source: "네이버 뉴스", title: n.title, detail: (n.description ?? "").slice(0, 120), url: n.originallink || n.link, at: at?.toISOString() ?? null, signal: `'${seed}' 최신 뉴스` });
      }
    } catch (e) {
      errors.push(`네이버 뉴스(${seed}): ${(e as Error).message}`);
      break;
    }
  }
  for (const t of tags.map((x) => HOT_OF[x]).filter(Boolean).slice(0, 2)) {
    const hot = await hotTab(t);
    if (hot.error && !hot.posts.length) errors.push(`블로그 홈: ${hot.error}`);
    for (const p of hot.posts.slice(0, 12)) issues.push({ id: `b${issues.length + 1}`, source: "블로그 홈", title: p.title, detail: p.brief, url: p.url, at: p.at ? new Date(p.at).toISOString() : null, signal: `공감 ${p.likes} · 댓글 ${p.comments}` });
  }
  return { issues, errors };
}

export async function createReport(blogId: string): Promise<HotReport> {
  const blog = await getBlogForAi(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const { issues, errors } = await collect(blog.category);
  if (!issues.length) throw new Error(`이슈를 하나도 모으지 못했어요. ${errors.join(" / ")}`);
  const written = await writtenTitles(blog);
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  const system = `당신은 블로그 글감 기획자입니다. 수집된 이슈 목록만 근거로, 이 블로그가 지금 쓰면 검색·홈피드 유입이 기대되는 글감을 고릅니다. 목록에 없는 사건·수치를 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다. 한국어로 씁니다.`;
  const prompt = `${blogContext(blog)}
[지금 시각] ${today} (한국)

[이 블로그에 이미 쓴 글 제목 - 겹치지 않게]
${written.slice(0, 40).map((t) => `- ${t}`).join("\n") || "(없음)"}

[수집한 실시간 이슈 - 번호: (출처 · 시각 · 반응) 제목 — 요약]
${issues.map((i) => `${i.id}: (${i.source} · ${i.at ? i.at.slice(5, 16).replace("T", " ") : "시각 모름"} · ${i.signal}) ${i.title}${i.detail ? ` — ${i.detail}` : ""}`).join("\n")}

위 이슈를 분석해 이 블로그 글감 5~8개를 추천하세요.
- 중복 제거: 같은 사건·주제는 하나로 묶고, 묶은 이슈 번호를 sources 에 모두 넣으세요.
- 검증: 출처가 1개뿐이고 단정하기 어려운 이슈는 hotness 를 낮추고 why 에 "출처 1곳"이라고 적으세요. 연예 가십·사건사고·정치 논쟁은 이 블로그 분야와 직접 관련 있을 때만.
- 블로그 분야와 맞게 '정보형'으로 각도를 바꾸세요 (예: 뉴스 "아동수당 확대" → "2027 아동수당 달라지는 점 한눈에 정리").
- keyword: 사람들이 검색창에 칠 짧은 메인 키워드 (1~3어절)
- title: 추천 블로그 제목 (25~35자, 메인 키워드 앞쪽, 자연스러운 한 문장. '｜' '|' '[]' 같은 구분 기호로 키워드를 나열하지 말 것)
- why: 선정 이유 (언제 뜬 이슈인지·반응 근거 포함, 한두 문장)
- direction: 콘텐츠 방향 (어떤 구성·무슨 정보를 넣을지, 한두 문장)
- hotness: 화제성 1~5
- timing: "오늘 바로" / "이번 주" / "시즌 미리" 중 하나
- sources: 근거 이슈 번호 배열 (예: ["n3", "g1"]) — 반드시 1개 이상
형식: {"items": [{"issue": "이슈 한 줄 요약", "keyword": "", "title": "", "why": "", "direction": "", "hotness": 4, "timing": "이번 주", "sources": ["n3"]}]}`;
  const res = await runStep({ step: "titles", purpose: "hot-report", blog, system, prompt, json: true, maxTokens: 4000 });
  const raw = extractJson<{ items?: { issue?: string; keyword?: string; title?: string; why?: string; direction?: string; hotness?: number; timing?: string; sources?: string[] }[] }>(res.text);
  const items: ReportItem[] = (raw.items ?? [])
    .map((it) => ({
      issue: String(it.issue ?? ""),
      keyword: String(it.keyword ?? "").trim().slice(0, 40),
      title: String(it.title ?? "").trim().slice(0, 80),
      why: String(it.why ?? ""),
      direction: String(it.direction ?? ""),
      hotness: Math.min(5, Math.max(1, Math.round(Number(it.hotness) || 3))),
      timing: String(it.timing ?? ""),
      sources: (it.sources ?? []).map((sid) => issues.find((x) => x.id === String(sid))).filter((x): x is Issue => !!x).map((x) => ({ title: x.title, url: x.url, source: x.source })),
      status: "new" as const,
    }))
    // 출처 번호가 실제로 있는 글감만 (근거 없는 추천 제외)
    .filter((it) => it.keyword && it.title && it.sources.length)
    .slice(0, 10);
  const report: HotReport = {
    id: newId("hr_"),
    blogId,
    at: new Date().toISOString(),
    items,
    collected: { "구글 트렌드": issues.filter((i) => i.source === "구글 트렌드").length, "네이버 뉴스": issues.filter((i) => i.source === "네이버 뉴스").length, "블로그 홈": issues.filter((i) => i.source === "블로그 홈").length },
    errors,
    ai: { provider: res.provider, model: res.model },
  };
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,$2,'hot_report','{}',$3)", [report.id, blogId, j(report)]);
  return report;
}

export async function lastReport(blogId: string): Promise<HotReport | null> {
  const r = await q1<{ data: HotReport }>("SELECT data FROM research_snapshots WHERE blog_id=$1 AND source='hot_report' ORDER BY collected_at DESC LIMIT 1", [blogId]);
  return r?.data ?? null;
}

async function saveReport(r: HotReport) {
  await q("UPDATE research_snapshots SET data=$2 WHERE id=$1", [r.id, j(r)]);
}

/** ✅ 승인: 그 글감으로 글 만들기 시작 (③ 제목 추천까지 → 제목 고르고 '글 쓰기'는 사용자가) */
export async function approveItem(reportId: string, index: number, keyword?: string) {
  const row = await q1<{ data: HotReport }>("SELECT data FROM research_snapshots WHERE id=$1 AND source='hot_report'", [reportId]);
  const r = row?.data;
  const it = r?.items[index];
  if (!r || !it) throw new WorkflowError("리포트 항목을 찾을 수 없습니다.");
  if (it.status === "approved" && it.projectId) return it.projectId;
  const pick = await addUserKeyword(r.blogId, (keyword ?? it.keyword).trim() || it.keyword);
  const brief: PostBrief = { issue: it.issue, title: it.title, why: it.why, direction: it.direction, sources: it.sources.map((s) => ({ title: s.title, url: s.url })) };
  const [projectId] = await createPosts(r.blogId, [pick], brief);
  r.items[index] = { ...it, status: "approved", projectId };
  await saveReport(r);
  return projectId;
}

export async function restoreItem(reportId: string, index: number) {
  const row = await q1<{ data: HotReport }>("SELECT data FROM research_snapshots WHERE id=$1 AND source='hot_report'", [reportId]);
  const r = row?.data;
  if (!r?.items[index]) throw new WorkflowError("리포트 항목을 찾을 수 없습니다.");
  if (r.items[index].status === "skipped") r.items[index] = { ...r.items[index], status: "new" };
  await saveReport(r);
}

export async function skipItem(reportId: string, index: number) {
  const row = await q1<{ data: HotReport }>("SELECT data FROM research_snapshots WHERE id=$1 AND source='hot_report'", [reportId]);
  const r = row?.data;
  if (!r?.items[index]) throw new WorkflowError("리포트 항목을 찾을 수 없습니다.");
  r.items[index] = { ...r.items[index], status: "skipped" };
  await saveReport(r);
}
