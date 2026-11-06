import "server-only";
import { q, q1 } from "./db";

/**
 * 블로그 방문자 수 수집 (공개 정보만)
 * - 네이버 블로그: m.blog.naver.com/rego/BlogInfo.naver → dayVisitorCount(오늘), totalVisitorCount(누적)
 * - 티스토리 등: 블로그 첫 화면의 방문자 카운터(Today / Yesterday / Total) — 스킨에 카운터가 보여야 함
 * - 1시간마다 스냅샷 저장(그날 값은 최댓값 유지). 글별 조회수는 공개되지 않아 수집하지 않음
 */

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const mblogBase = () => (process.env.NAVER_MBLOG_BASE_URL?.trim() || "https://m.blog.naver.com").replace(/\/$/, "");
const INTERVAL_MS = 60 * 60 * 1000;

export type VisitSnapshot = { today: number; yesterday?: number | null; total: number | null };

function kstDay(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);
}
const toInt = (s: string | undefined) => (s == null ? null : Number(s.replace(/[^\d]/g, "")) || 0);

export function naverBlogId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)blog\.naver\.com$/i.test(u.hostname)) return null;
    return u.searchParams.get("blogId") ?? u.pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

/** 티스토리 스킨 방문자 카운터: "Today : 2", "Yesterday : 1", "Total ... 29" 같은 문구 */
export function parseCounter(html: string): VisitSnapshot | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const pick = (label: string) => new RegExp(`(?:${label})\\s*[:：]?\\s*([\\d,]+)`, "i").exec(text)?.[1];
  const today = toInt(pick("today|오늘"));
  const total = toInt(pick("total|전체|누적"));
  if (today == null && total == null) return null;
  return { today: today ?? 0, yesterday: toInt(pick("yesterday|어제")), total };
}

export async function fetchVisits(blogUrl: string): Promise<VisitSnapshot | null> {
  const id = naverBlogId(blogUrl);
  if (id) {
    const res = await fetch(`${mblogBase()}/rego/BlogInfo.naver?blogId=${encodeURIComponent(id)}`, { headers: { "user-agent": UA, referer: `https://m.blog.naver.com/${id}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const raw = (await res.text()).replace(/^\)\]\}',?\s*/, "");
    const r = (JSON.parse(raw) as { result?: { dayVisitorCount?: number; totalVisitorCount?: number } }).result;
    if (!r || r.dayVisitorCount == null) return null;
    return { today: Number(r.dayVisitorCount) || 0, total: r.totalVisitorCount == null ? null : Number(r.totalVisitorCount) };
  }
  // 티스토리 모바일 화면에는 방문자 카운터가 없어 PC 화면으로 읽음
  const res = await fetch(blogUrl, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return parseCounter((await res.text()).slice(0, 2_000_000));
}

async function save(blogId: string, day: string, today: number, total: number | null) {
  await q(
    `INSERT INTO blog_visits (blog_id, day, today, total, updated_at) VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (blog_id, day) DO UPDATE SET today = GREATEST(blog_visits.today, EXCLUDED.today), total = COALESCE(EXCLUDED.total, blog_visits.total), updated_at = NOW()`,
    [blogId, day, today, total],
  );
}

/** 모든 블로그의 방문자 수 스냅샷 (force 가 아니면 1시간에 한 번) */
export async function collectVisits(force = false) {
  const g = globalThis as unknown as { __visitsAt?: number; __visitsBusy?: boolean };
  if (g.__visitsBusy || (!force && g.__visitsAt && Date.now() - g.__visitsAt < INTERVAL_MS)) return;
  g.__visitsBusy = true;
  try {
    const blogs = await q<{ id: string; url: string }>("SELECT id, url FROM blogs WHERE NOT archived AND COALESCE(url,'') <> ''");
    for (const b of blogs) {
      try {
        const s = await fetchVisits(b.url);
        if (!s) continue;
        await save(b.id, kstDay(0), s.today, s.total);
        if (s.yesterday != null) await save(b.id, kstDay(1), s.yesterday, null);
      } catch {
        /* 한 블로그가 실패해도 나머지는 계속 */
      }
    }
    g.__visitsAt = Date.now();
  } finally {
    g.__visitsBusy = false;
  }
}

/** 최근 N일(오늘 포함) 블로그별 일별 방문자. 기록 없는 날은 null */
export async function visitDaily(days = 30) {
  const list = Array.from({ length: days }, (_, i) => kstDay(days - 1 - i));
  const rows = await q<{ blog_id: string; d: string; n: number }>(
    "SELECT blog_id, to_char(day, 'YYYY-MM-DD') AS d, today::int AS n FROM blog_visits WHERE day >= $1::date",
    [list[0]],
  );
  return { days: list, value: (blogId: string, d: string) => rows.find((r) => r.blog_id === blogId && r.d === d)?.n ?? null };
}

/** 블로그별 방문자: 오늘 · 최근 7일 합 · 이번 달 합 · 누적 · 수집 시작일 */
export async function visitSummary() {
  const rows = await q<{ blog_id: string; today: number; week: number; month: number; total: number | null; since: string | null; days: number }>(
    `SELECT blog_id,
       COALESCE(MAX(today) FILTER (WHERE day = (NOW() AT TIME ZONE 'Asia/Seoul')::date), 0)::int AS today,
       COALESCE(SUM(today) FILTER (WHERE day > (NOW() AT TIME ZONE 'Asia/Seoul')::date - 7), 0)::int AS week,
       COALESCE(SUM(today) FILTER (WHERE day >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul')::date), 0)::int AS month,
       (ARRAY_AGG(total ORDER BY day DESC) FILTER (WHERE total IS NOT NULL))[1] AS total,
       to_char(MIN(day), 'YYYY-MM-DD') AS since,
       COUNT(*)::int AS days
     FROM blog_visits GROUP BY blog_id`,
  );
  const last = await q1<{ at: string | null }>("SELECT MAX(updated_at) AS at FROM blog_visits");
  return { rows, updatedAt: last?.at ?? null };
}
