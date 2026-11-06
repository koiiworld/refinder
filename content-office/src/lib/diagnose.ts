import "server-only";
import { q, q1, newId, j } from "./db";
import { getBlogForAi } from "./repo";
import { recentPosts, type BlogPostLink } from "./blog-posts";
import { importPostFromUrl } from "./sample-html";
import { statsOf, type PostStats } from "./benchmark";
import { keywordStats, naverAdConnected } from "./searchad";
import { extractJson, runStep } from "./ai/run";
import { blogContext } from "./ai/prompts";

/**
 * 🩺 블로그 진단
 * - 발행 리듬·제목 패턴(블로그 RSS) · 검색 누락 여부/키워드 순위·경쟁도(네이버 검색 API)
 * - 최근 글 구조(직접 읽어서 셈) · 방문자 추이 · AI 종합 진단(무료 Gemini 기본)
 */

type SearchItem = { title: string; link: string; bloggerlink: string; postdate: string };

/** 네이버 블로그 검색 API (개발자센터 앱에 '검색' API 권한 필요) */
export async function naverBlogSearch(query: string, display = 10): Promise<{ total: number; items: SearchItem[] }> {
  const id = process.env.NAVER_CLIENT_ID?.trim();
  const secret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("네이버 검색 API 키(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)가 없습니다.");
  // 2026-07-31 이후 키: NAVER API HUB 주소·헤더. 기존 개발자센터 키: openapi.naver.com
  const both = { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret, "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret };
  const attempts: [string, Record<string, string>][] = process.env.NAVER_SEARCH_URL?.trim()
    ? [[process.env.NAVER_SEARCH_URL.trim(), both]]
    : [
        ["https://naverapihub.apigw.ntruss.com/search/v1/blog", { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }],
        ["https://openapi.naver.com/v1/search/blog.json", { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }],
      ];
  let res: Response | null = null;
  let data: { total?: number; items?: SearchItem[]; errorMessage?: string } = {};
  for (const [base, headers] of attempts) {
    res = await fetch(`${base}?query=${encodeURIComponent(query)}&display=${display}&sort=sim`, { headers, signal: AbortSignal.timeout(10_000) });
    data = await res.json().catch(() => ({}));
    if (![401, 403, 404].includes(res.status)) break;
  }
  if (!res) throw new Error("네이버 검색 API에 연결하지 못했습니다.");
  if (res.status === 401 || res.status === 403) throw new Error("네이버 검색 API 권한이 없습니다. NAVER API HUB(또는 개발자센터) 앱에서 '블로그 검색'을 추가해 주세요.");
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (HTTP ${res.status}) ${data.errorMessage ?? ""}`.trim());
  return { total: Number(data.total ?? 0), items: (data.items ?? []).map((i) => ({ ...i, title: String(i.title ?? "").replace(/<[^>]+>/g, "") })) };
}

/** 글 주소 → 비교용 키 (네이버: 아이디/글번호, 그 외: 호스트+경로) */
export function postKey(raw: string): string {
  try {
    const u = new URL(raw);
    if (/naver\.com$/i.test(u.hostname)) {
      const parts = u.pathname.split("/").filter(Boolean);
      const blogId = u.searchParams.get("blogId") ?? parts[0];
      const logNo = u.searchParams.get("logNo") ?? parts[1];
      return `naver:${blogId}/${logNo ?? ""}`.toLowerCase();
    }
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return raw;
  }
}
/** 블로그 주소 → 비교용 키 (네이버: 아이디, 그 외: 호스트) */
export function blogKey(raw: string): string {
  try {
    const u = new URL(raw);
    if (/naver\.com$/i.test(u.hostname)) return `naver:${(u.searchParams.get("blogId") ?? u.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase()}`;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw;
  }
}
const sameBlog = (item: SearchItem, myBlog: string) => blogKey(item.bloggerlink || item.link) === myBlog || blogKey(item.link) === myBlog;

const SPECIAL = /[｜|【】\[\]★☆♥♡✔✅🔥💯]/u;
function titleStats(posts: BlogPostLink[]) {
  const titles = posts.map((p) => p.title);
  const len = titles.map((t) => [...t].length);
  const dup = titles.filter((t) => {
    const words = t.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter((w) => w.length >= 2);
    return new Set(words).size < words.length;
  });
  return {
    count: titles.length,
    avgLen: len.length ? Math.round(len.reduce((a, b) => a + b, 0) / len.length) : 0,
    tooLong: titles.filter((t) => [...t].length > 40),
    tooShort: titles.filter((t) => [...t].length < 15),
    withNumber: titles.filter((t) => /\d/.test(t)).length,
    special: titles.filter((t) => SPECIAL.test(t)),
    repeated: dup,
  };
}

function rhythm(posts: BlogPostLink[]) {
  const dates = posts.map((p) => (p.date ? new Date(p.date).getTime() : NaN)).filter((t) => !isNaN(t)).sort((a, b) => b - a);
  if (!dates.length) return null;
  const now = Date.now();
  const gaps = dates.slice(0, 10).map((t, i, a) => (i ? (a[i - 1] - t) / 86400000 : 0)).slice(1);
  return {
    last30: dates.filter((t) => now - t < 30 * 86400000).length,
    daysSinceLast: Math.floor((now - dates[0]) / 86400000),
    avgGapDays: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
  };
}

export type Check = { label: string; status: "ok" | "warn" | "bad" | "skip"; detail: string };

export async function diagnoseBlog(blogId: string) {
  const blog = await getBlogForAi(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  if (!blog.url) throw new Error("블로그 설정에서 블로그 주소를 먼저 넣어 주세요.");
  const myBlog = blogKey(blog.url);
  const posts = await recentPosts(blog, 30);
  const rh = rhythm(posts);
  const ts = titleStats(posts);
  const notes: string[] = [];

  // 1) 검색 누락 검사: 최근 글 제목으로 검색해 내 글이 나오는지
  let searchError = "";
  const indexed: { title: string; url: string; found: boolean; rank: number | null }[] = [];
  for (const p of posts.slice(0, 8)) {
    try {
      const r = await naverBlogSearch(p.title, 30);
      const idx = r.items.findIndex((i) => postKey(i.link) === postKey(p.url));
      indexed.push({ title: p.title, url: p.url, found: idx >= 0, rank: idx >= 0 ? idx + 1 : null });
    } catch (e) {
      searchError = (e as Error).message;
      break;
    }
  }

  // 2) 앱에서 쓴 글의 메인 키워드: 내 블로그 순위 · 경쟁도(문서 수 ÷ 월간 검색수)
  const projects = await q<{ title: string; topic: string }>(
    "SELECT title, topic FROM projects WHERE blog_id=$1 AND deleted_at IS NULL AND stage IN ('ready','published') ORDER BY created_at DESC LIMIT 6",
    [blogId],
  );
  const keywords = Array.from(new Set(projects.map((p) => (p.topic || "").split(",")[0].trim()).filter(Boolean))).slice(0, 5);
  let volumes: Record<string, number | null> = {};
  if (keywords.length && naverAdConnected()) {
    try {
      const st = await keywordStats(keywords);
      volumes = Object.fromEntries(keywords.map((k) => [k, st.stats[k]?.total ?? null]));
    } catch {
      /* 검색량 없이 진행 */
    }
  }
  const ranks: { keyword: string; rank: number | null; docs: number; volume: number | null; ratio: number | null }[] = [];
  if (!searchError) {
    for (const k of keywords) {
      try {
        const r = await naverBlogSearch(k, 100);
        const idx = r.items.findIndex((i) => sameBlog(i, myBlog));
        const volume = volumes[k] ?? null;
        ranks.push({ keyword: k, rank: idx >= 0 ? idx + 1 : null, docs: r.total, volume, ratio: volume ? Math.round((r.total / volume) * 10) / 10 : null });
      } catch (e) {
        searchError = (e as Error).message;
        break;
      }
    }
  }

  // 3) 최근 글 3개 구조 (직접 읽어서 셈)
  const structure: { title: string; url: string; stats: PostStats | null }[] = [];
  const hosts = (await q<{ url: string }>("SELECT url FROM blogs WHERE COALESCE(url,'') <> ''")).map((r) => {
    try {
      return new URL(r.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  });
  for (const p of posts.slice(0, 3)) {
    try {
      const got = await importPostFromUrl(p.url, hosts);
      structure.push({ title: p.title, url: p.url, stats: got.text.length > 100 ? statsOf(got.text) : null });
    } catch {
      structure.push({ title: p.title, url: p.url, stats: null });
    }
  }
  const readStats = structure.map((s) => s.stats).filter((s): s is PostStats => !!s);
  const avg = (k: keyof PostStats) => (readStats.length ? Math.round(readStats.reduce((a, s) => a + s[k], 0) / readStats.length) : null);

  // 4) 방문자: 최근 7일 vs 그 전 7일
  const vis = await q1<{ cur: number; prev: number; days: number }>(
    `SELECT COALESCE(SUM(today) FILTER (WHERE day > (NOW() AT TIME ZONE 'Asia/Seoul')::date - 7),0)::int AS cur,
            COALESCE(SUM(today) FILTER (WHERE day <= (NOW() AT TIME ZONE 'Asia/Seoul')::date - 7 AND day > (NOW() AT TIME ZONE 'Asia/Seoul')::date - 14),0)::int AS prev,
            COUNT(*)::int AS days
       FROM blog_visits WHERE blog_id=$1`,
    [blogId],
  );

  // 5) 규칙 점검표
  const checks: Check[] = [];
  if (!posts.length) checks.push({ label: "블로그 글 목록(RSS)", status: "bad", detail: "RSS에서 글을 읽지 못했어요. 블로그 주소와 RSS 공개 설정을 확인하세요." });
  if (rh) {
    checks.push({ label: "발행 빈도", status: rh.last30 >= 8 ? "ok" : rh.last30 >= 4 ? "warn" : "bad", detail: `최근 30일 ${rh.last30}개${rh.avgGapDays != null ? ` · 평균 ${rh.avgGapDays}일 간격` : ""} (권장: 주 2~3회)` });
    checks.push({ label: "마지막 발행", status: rh.daysSinceLast <= 3 ? "ok" : rh.daysSinceLast <= 7 ? "warn" : "bad", detail: `${rh.daysSinceLast}일 전` });
  }
  if (ts.count) {
    checks.push({ label: "제목 길이", status: ts.avgLen >= 18 && ts.avgLen <= 35 ? "ok" : "warn", detail: `평균 ${ts.avgLen}자 · 40자 넘는 제목 ${ts.tooLong.length}개 · 15자 미만 ${ts.tooShort.length}개 (권장 18~35자)` });
    checks.push({ label: "같은 단어 반복 제목", status: ts.repeated.length === 0 ? "ok" : ts.repeated.length <= 2 ? "warn" : "bad", detail: ts.repeated.length ? `${ts.repeated.length}개 — 예: ${ts.repeated[0]}` : "없음" });
    checks.push({ label: "특수문자·기호 제목", status: ts.special.length <= 1 ? "ok" : "warn", detail: ts.special.length ? `${ts.special.length}개 — 예: ${ts.special[0]}` : "없음" });
  }
  if (indexed.length) {
    const miss = indexed.filter((i) => !i.found);
    checks.push({ label: "검색 누락", status: miss.length === 0 ? "ok" : miss.length <= 2 ? "warn" : "bad", detail: miss.length ? `최근 글 ${indexed.length}개 중 ${miss.length}개가 제목으로 검색해도 안 나와요` : `최근 글 ${indexed.length}개 모두 검색에 나와요` });
  } else if (searchError) checks.push({ label: "검색 누락·키워드 순위", status: "skip", detail: searchError });
  if (readStats.length) {
    const chars = avg("chars")!, imgs = avg("images")!, heads = avg("headings")!;
    checks.push({ label: "본문 길이", status: chars >= 1500 ? "ok" : chars >= 800 ? "warn" : "bad", detail: `최근 글 평균 ${chars.toLocaleString("ko-KR")}자 (권장 1,500자 이상)` });
    checks.push({ label: "사진 수", status: imgs >= 5 ? "ok" : imgs >= 3 ? "warn" : "bad", detail: `평균 ${imgs}장 (권장 5장 이상, 직접 찍은 사진일수록 좋음)` });
    checks.push({ label: "소제목", status: heads >= 3 ? "ok" : heads >= 1 ? "warn" : "bad", detail: `평균 ${heads}개 (권장 3개 이상)` });
  }
  if (vis && vis.days >= 8) {
    const change = vis.prev ? Math.round(((vis.cur - vis.prev) / vis.prev) * 100) : null;
    checks.push({ label: "방문자 추이", status: change == null ? "skip" : change >= 0 ? "ok" : change > -20 ? "warn" : "bad", detail: `최근 7일 ${vis.cur}명 · 그 전 7일 ${vis.prev}명${change != null ? ` (${change >= 0 ? "+" : ""}${change}%)` : ""}` });
  } else notes.push("방문자 추이는 기록이 8일 넘게 쌓이면 비교해요.");
  for (const r of ranks) {
    checks.push({
      label: `키워드 '${r.keyword}'`,
      status: r.rank != null && r.rank <= 10 ? "ok" : r.rank != null && r.rank <= 30 ? "warn" : "bad",
      detail: `${r.rank != null ? `내 블로그 ${r.rank}위` : "100위 밖"} · 글 ${r.docs.toLocaleString("ko-KR")}개${r.volume != null ? ` · 월 검색 ${r.volume.toLocaleString("ko-KR")}회 · 경쟁도 ${r.ratio}` : ""}`,
    });
  }

  const metrics = { rhythm: rh, titles: { avgLen: ts.avgLen, count: ts.count, withNumber: ts.withNumber, repeated: ts.repeated.slice(0, 5), special: ts.special.slice(0, 5), tooLong: ts.tooLong.slice(0, 5) }, indexed, ranks, structure: { avgChars: avg("chars"), avgImages: avg("images"), avgHeadings: avg("headings"), avgLists: avg("lists") }, visits: vis };

  // 6) AI 종합 진단 (단계별 AI의 '키워드' 담당 — 기본 무료 Gemini)
  const system = `당신은 네이버·티스토리 블로그 성장 컨설턴트입니다. 앱이 직접 잰 수치만 근거로 진단합니다. 수치에 없는 사실(방문자 수, 순위 등)을 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다. 한국어로, 쉽고 짧게 씁니다.`;
  const prompt = `${blogContext(blog)}

[최근 글 제목 - 블로그 RSS]
${posts.slice(0, 20).map((p) => `- ${p.title}${p.date ? ` (${p.date.slice(0, 10)})` : ""}`).join("\n") || "(없음)"}

[앱이 잰 수치]
${JSON.stringify(metrics)}

[점검표]
${checks.map((c) => `- ${c.label}: ${c.status} · ${c.detail}`).join("\n")}

이 블로그가 검색·${blog.platform === "naver" ? "네이버 홈피드(홈판)" : "구글·다음 검색"} 노출을 늘리려면 무엇을 고쳐야 하는지 진단하세요.
- score: 0~100 (위 점검표 기준)
- summary: 2~3문장 요약
- good: 잘하고 있는 점 1~3개
- problems: 가장 큰 문제부터 최대 5개. title(짧게), why(수치 근거), fix(바로 할 수 있는 행동)
- titleTips: 최근 제목을 보고 제목 짓기 개선 팁 2~4개. 가능하면 실제 최근 제목 하나를 고쳐 쓴 예시를 "기존 → 개선" 형식으로
- next: 이번 주에 할 일 3개
형식: {"score": 70, "summary": "", "good": [""], "problems": [{"title": "", "why": "", "fix": ""}], "titleTips": [""], "next": [""]}`;
  let ai: { score?: number; summary?: string; good?: string[]; problems?: { title: string; why: string; fix: string }[]; titleTips?: string[]; next?: string[]; provider?: string; model?: string } = {};
  try {
    const res = await runStep({ step: "keywords", purpose: "diagnose", blog, system, prompt, json: true, maxTokens: 3000 });
    ai = { ...extractJson(res.text), provider: res.provider, model: res.model };
  } catch (e) {
    notes.push(`AI 종합 진단을 만들지 못했어요: ${(e as Error).message}`);
  }

  const result = { blogId, at: new Date().toISOString(), posts: posts.length, checks, metrics, ai, notes, searchError };
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,$2,'diagnose','{}',$3)", [newId("snap_"), blogId, j(result)]);
  return result;
}

export type Diagnosis = Awaited<ReturnType<typeof diagnoseBlog>>;

export async function lastDiagnosis(blogId: string): Promise<Diagnosis | null> {
  const r = await q1<{ data: Diagnosis }>("SELECT data FROM research_snapshots WHERE blog_id=$1 AND source='diagnose' ORDER BY collected_at DESC LIMIT 1", [blogId]);
  return r?.data ?? null;
}
