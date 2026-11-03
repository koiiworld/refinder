import "server-only";
import { q, newId, j } from "./db";
import type { Source } from "./types";

/** 경쟁·참고 콘텐츠 URL에서 제목/설명을 실제로 수집 (수집일 기록) */
export async function fetchUrlMeta(url: string, note = ""): Promise<Source> {
  const collected_at = new Date().toISOString();
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("올바른 http(s) URL이 아닙니다.");
  }
  // 내부망 주소 차단 (SSRF 방지)
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1)/.test(parsed.hostname)) {
    throw new Error("내부 주소는 수집할 수 없습니다.");
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(parsed, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOfficeBot/0.1)", accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(t);
    const html = (await res.text()).slice(0, 400_000);
    const pick = (re: RegExp) => decode(html.match(re)?.[1]?.trim() ?? "");
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<title[^>]*>([^<]*)<\/title>/i);
    const description =
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    return { url, title: title || url, description, note, collected_at, fetched: res.ok };
  } catch {
    // 수집 실패 시에도 URL과 등록일은 저장 (수집되지 않았음을 표시)
    return { url, title: url, description: "", note, collected_at, fetched: false };
  }
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function naverConnected() {
  return !!(process.env.NAVER_CLIENT_ID?.trim() && process.env.NAVER_CLIENT_SECRET?.trim());
}

/**
 * 네이버 데이터랩 검색어 트렌드 (공식 API)
 * 반환값은 기간 내 최대값=100 기준 '상대 지표'이며 절대 검색량이 아닙니다.
 */
export async function naverTrend(input: {
  blogId: string | null;
  keywords: string[];
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
}) {
  if (!naverConnected()) throw new Error("네이버 데이터랩 API 키(NAVER_CLIENT_ID/SECRET)가 설정되지 않았습니다.");
  const groups = input.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((k) => ({ groupName: k, keywords: [k] }));
  if (!groups.length) throw new Error("키워드를 입력하세요.");
  const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!.trim(),
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!.trim(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: input.timeUnit,
      keywordGroups: groups,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`네이버 API 오류 ${res.status}: ${data?.errorMessage ?? ""}`);
  const id = newId("snap_");
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,$2,'naver_datalab',$3,$4)", [
    id,
    input.blogId,
    j(input),
    j(data),
  ]);
  return { id, data };
}
