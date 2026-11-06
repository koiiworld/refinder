import "server-only";
import { q, q1, j } from "./db";
import { todayUsage } from "./usage";
import { getSettings } from "./settings";
import { collectVisits, visitDaily, visitSummary } from "./visits";
import { coupangConnected, lastCoupangSync, syncCoupang } from "./coupang";

/**
 * 메인 대시보드 데이터 — 모두 앱 DB의 실제 기록만 사용 (지어낸 숫자 없음)
 * - 발행: ⑦에서 '발행 완료'를 누른 글 (package.publishedAt)
 * - 완성: ⑥ 검수까지 끝난 글 (발행 대기 + 발행 완료)
 * - 검색량: 글 키워드의 네이버 검색광고 월간 검색수
 * - 수익: 실제 연동 API가 없어 사용자가 정산 화면 숫자를 직접 입력
 */

export const PASS_SCORE = 80; // 1차 검수 통과 기준 점수

const KST_MONTH_START = `(date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`;
const KST_PREV_MONTH_START = `(date_trunc('month', (NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '1 month') AT TIME ZONE 'Asia/Seoul')`;
const PUBLISHED_AT = `NULLIF(p.package->>'publishedAt','')::timestamptz`;

export type RevenueChannel = "coupang" | "adpost" | "adsense";
export type RevenueEntry = { krw: number; usd?: number | null; metric?: string };
export type MonthRevenue = Partial<Record<RevenueChannel, RevenueEntry>> & { updatedAt?: string };

export function monthKey(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // 한국 시간
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}
function prevMonthKey() {
  const [y, m] = monthKey().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function getRevenue(): Promise<Record<string, MonthRevenue>> {
  const row = await q1<{ value: Record<string, MonthRevenue> }>("SELECT value FROM settings WHERE key='revenue'");
  return row?.value ?? {};
}

export async function saveRevenue(month: string, data: MonthRevenue) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("월 형식이 올바르지 않습니다.");
  const all = await getRevenue();
  const clean: MonthRevenue = { updatedAt: new Date().toISOString() };
  for (const ch of ["coupang", "adpost", "adsense"] as RevenueChannel[]) {
    const e = data[ch];
    if (!e) continue;
    const krw = Math.max(0, Math.round(Number(e.krw) || 0));
    const usd = e.usd == null || e.usd === ("" as unknown) ? null : Math.max(0, Number(e.usd) || 0);
    if (krw || usd) clean[ch] = { krw, usd, metric: String(e.metric ?? "").slice(0, 120) };
  }
  all[month] = clean;
  await q(`INSERT INTO settings (key, value) VALUES ('revenue', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(all)]);
  return clean;
}

const revTotal = (r?: MonthRevenue) => (["coupang", "adpost", "adsense"] as RevenueChannel[]).reduce((s, c) => s + (r?.[c]?.krw ?? 0), 0);

export async function dashboardData() {
  const { pricing } = await getSettings();
  const blogs = await q<{ id: string; name: string; color: string; created_at: string }>("SELECT id, name, color, created_at FROM blogs WHERE NOT archived ORDER BY created_at, id");

  // ── 발행 (이번 달 / 지난달 같은 기간)
  const pub = await q1<{ this_month: number; prev_same: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE ${PUBLISHED_AT} >= ${KST_MONTH_START})::int AS this_month,
       COUNT(*) FILTER (WHERE ${PUBLISHED_AT} >= ${KST_PREV_MONTH_START}
                          AND ${PUBLISHED_AT} < ${KST_PREV_MONTH_START} + (NOW() - ${KST_MONTH_START}))::int AS prev_same
     FROM projects p WHERE p.deleted_at IS NULL AND p.stage='published'`,
  );

  // ── 이번 달 완성 글(검수까지 끝남) · 블로그별
  const perBlog = await q<{ blog_id: string; completed: number; published: number; first_pass: number; first_total: number; avg_volume: number | null }>(
    `WITH first_review AS (
       SELECT DISTINCT ON (r.project_id) r.project_id, (r.result->>'score')::numeric AS score, r.created_at
       FROM reviews r ORDER BY r.project_id, r.created_at
     ), vol AS (
       SELECT project_id, MAX((volume->>'total')::numeric) AS v FROM keyword_picks WHERE project_id IS NOT NULL AND volume IS NOT NULL GROUP BY project_id
     )
     SELECT p.blog_id,
       COUNT(*) FILTER (WHERE p.stage IN ('ready','published') AND p.updated_at >= ${KST_MONTH_START})::int AS completed,
       COUNT(*) FILTER (WHERE p.stage='published' AND ${PUBLISHED_AT} >= ${KST_MONTH_START})::int AS published,
       COUNT(*) FILTER (WHERE fr.created_at >= ${KST_MONTH_START} AND fr.score >= ${PASS_SCORE})::int AS first_pass,
       COUNT(*) FILTER (WHERE fr.created_at >= ${KST_MONTH_START} AND fr.score IS NOT NULL)::int AS first_total,
       AVG(vol.v) FILTER (WHERE p.stage IN ('ready','published')) AS avg_volume
     FROM projects p
     LEFT JOIN first_review fr ON fr.project_id = p.id
     LEFT JOIN vol ON vol.project_id = p.id
     WHERE p.deleted_at IS NULL
     GROUP BY p.blog_id`,
  );

  // ── 최근 5주 주간 완성 글 수 (블로그별, 한국 시간 월요일 기준 주)
  const weeksRows = await q<{ blog_id: string; wk: string; n: number }>(
    `SELECT p.blog_id, to_char(date_trunc('week', p.updated_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS wk, COUNT(*)::int AS n
     FROM projects p
     WHERE p.deleted_at IS NULL AND p.stage IN ('ready','published')
       AND p.updated_at >= (date_trunc('week', NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '4 weeks') AT TIME ZONE 'Asia/Seoul'
     GROUP BY 1, 2`,
  );
  const weeks: string[] = [];
  {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const dow = (now.getUTCDay() + 6) % 7; // 월=0
    const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow);
    for (let i = 4; i >= 0; i--) weeks.push(new Date(monday - i * 7 * 86400000).toISOString().slice(0, 10));
  }

  // ── 키워드 TOP 5 (완성 글 키워드, 월간 검색량 순)
  const topKeywords = await q<{ keyword: string; blog_id: string; volume: number; stage: string; project_id: string; title: string }>(
    `SELECT k.keyword, k.blog_id, (k.volume->>'total')::numeric AS volume, p.stage, p.id AS project_id, p.title
     FROM keyword_picks k JOIN projects p ON p.id = k.project_id
     WHERE p.deleted_at IS NULL AND p.stage IN ('ready','published') AND k.volume IS NOT NULL
     ORDER BY (k.volume->>'total')::numeric DESC NULLS LAST LIMIT 5`,
  );

  // ── 블로그별 키워드 TOP 5: 그 블로그 주제로 추천·선택된 키워드 중 월간 검색량 높은 순 (아직 안 쓴 것도 포함)
  const kwRows = await q<{ blog_id: string; keyword: string; volume: number; project_id: string | null; stage: string | null; deleted: boolean | null }>(
    `SELECT k.blog_id, k.keyword, (k.volume->>'total')::numeric AS volume, p.id AS project_id, p.stage, (p.deleted_at IS NOT NULL) AS deleted
       FROM keyword_picks k LEFT JOIN projects p ON p.id = k.project_id
      WHERE k.volume IS NOT NULL AND (k.volume->>'total') IS NOT NULL
      ORDER BY (k.volume->>'total')::numeric DESC LIMIT 2000`,
  );
  const norm = (s: string) => s.replace(/\s+/g, "");
  const keywordsByBlog = Object.fromEntries(
    blogs.map((b) => {
      const seen = new Map<string, { keyword: string; volume: number; project_id: string | null; stage: string | null }>();
      for (const r of kwRows.filter((x) => x.blog_id === b.id)) {
        const k = norm(r.keyword);
        const row = { keyword: r.keyword, volume: Number(r.volume), project_id: r.deleted ? null : r.project_id, stage: r.deleted ? null : r.stage };
        const prev = seen.get(k);
        // 같은 키워드면 글로 이어진 쪽을 우선
        if (!prev || (!prev.project_id && row.project_id)) seen.set(k, row);
      }
      return [b.id, [...seen.values()].sort((a, z) => z.volume - a.volume).slice(0, 5)];
    }),
  );

  // ── 운영 상태
  const ops = await q1<{ ready: number; failed: number; rereview: number; choosing: number }>(
    `SELECT COUNT(*) FILTER (WHERE stage='ready' AND status <> 'running')::int AS ready,
            COUNT(*) FILTER (WHERE status='error')::int AS failed,
            COUNT(*) FILTER (WHERE needs_rereview)::int AS rereview,
            COUNT(*) FILTER (WHERE stage='titles' AND status='waiting')::int AS choosing
     FROM projects WHERE deleted_at IS NULL`,
  );

  // ── AI 비용: 이번 달 누적 · 오늘 · 최근 7일 일별
  const runs = await q<{ provider: string; model: string; status: string; input_tokens: number; output_tokens: number; cost_usd: number; day: string; this_month: boolean }>(
    `SELECT provider, model, status, COALESCE(input_tokens,0) AS input_tokens, COALESCE(output_tokens,0) AS output_tokens, COALESCE(cost_usd,0) AS cost_usd,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
            created_at >= ${KST_MONTH_START} AS this_month
     FROM ai_runs WHERE provider <> 'template' AND created_at >= LEAST(${KST_MONTH_START}, NOW() - INTERVAL '7 days')`,
  );
  const costOf = (r: (typeof runs)[number]) => {
    if (Number(r.cost_usd) > 0) return Number(r.cost_usd);
    const p = pricing[`${r.provider}:${r.model}`];
    return p ? (Number(r.input_tokens) * p.input + Number(r.output_tokens) * p.output) / 1_000_000 : 0;
  };
  let monthUsd = 0;
  let monthCalls = 0;
  const daily = new Map<string, number>();
  for (const r of runs) {
    const c = costOf(r);
    if (r.this_month) {
      monthUsd += c;
      if (r.status === "succeeded") monthCalls++;
    }
    daily.set(r.day, (daily.get(r.day) ?? 0) + c);
  }
  const days: { day: string; usd: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, usd: daily.get(d) ?? 0 });
  }
  const today = await todayUsage();

  const completedMonth = perBlog.reduce((s, b) => s + b.completed, 0);
  const firstPass = perBlog.reduce((s, b) => s + b.first_pass, 0);
  const firstTotal = perBlog.reduce((s, b) => s + b.first_total, 0);
  const volBlogs = perBlog.filter((b) => b.avg_volume != null);

  // 방문자 수 (1시간마다 수집 — 오래됐으면 지금 한 번 시도)
  await collectVisits().catch(() => {});
  const vis = await visitSummary();
  const visitDays = await visitDaily(30);
  const blogUrls = await q<{ id: string; url: string }>("SELECT id, url FROM blogs");

  // 쿠팡파트너스: 키가 있으면 3시간에 한 번 이번 달 수익 자동 집계
  let coupangError = "";
  if (coupangConnected()) await syncCoupang().catch((e) => { coupangError = (e as Error).message; });
  const coupangSync = coupangConnected() ? await lastCoupangSync() : null;
  const revenueAll = await getRevenue();
  const month = monthKey();
  const revenue = revenueAll[month] ?? {};
  const prevRevenue = revenueAll[prevMonthKey()];

  return {
    month,
    blogs,
    kpi: {
      publishedThisMonth: pub?.this_month ?? 0,
      publishedPrevSame: pub?.prev_same ?? 0,
      completedThisMonth: completedMonth,
      firstPassRate: firstTotal ? firstPass / firstTotal : null,
      firstPass,
      firstTotal,
      avgVolume: volBlogs.length ? volBlogs.reduce((s, b) => s + Number(b.avg_volume), 0) / volBlogs.length : null,
    },
    visits: {
      updatedAt: vis.updatedAt,
      blogs: blogs.map((b) => {
        const v = vis.rows.find((r) => r.blog_id === b.id);
        return { id: b.id, name: b.name, hasUrl: !!blogUrls.find((x) => x.id === b.id)?.url, today: v?.today ?? null, week: v?.week ?? null, month: v?.month ?? null, total: v?.total ?? null, since: v?.since ?? null, days: v?.days ?? 0 };
      }),
      daily: { days: visitDays.days, series: blogs.map((b) => ({ id: b.id, name: b.name, values: visitDays.days.map((d) => visitDays.value(b.id, d)) })) },
    },
    perBlog: blogs.map((b) => {
      const r = perBlog.find((x) => x.blog_id === b.id);
      return {
        id: b.id,
        name: b.name,
        completed: r?.completed ?? 0,
        published: r?.published ?? 0,
        passRate: r?.first_total ? r.first_pass / r.first_total : null,
        avgVolume: r?.avg_volume != null ? Number(r.avg_volume) : null,
      };
    }),
    trend: { weeks, series: blogs.map((b) => ({ id: b.id, name: b.name, values: weeks.map((w) => weeksRows.find((x) => x.blog_id === b.id && x.wk === w)?.n ?? 0) })) },
    keywordsByBlog,
    topKeywords: topKeywords.map((k) => ({ ...k, volume: Number(k.volume), blog: blogs.find((b) => b.id === k.blog_id)?.name ?? "" })),
    ops: { ...(ops ?? { ready: 0, failed: 0, rereview: 0, choosing: 0 }), todayCalls: today.models.reduce((s, m) => s + m.calls, 0), todayUsd: today.total },
    cost: { monthUsd, monthCalls, perPost: completedMonth ? monthUsd / completedMonth : null, todayUsd: today.total, todaySteps: today.steps, days },
    revenue: { month, data: revenue, total: revTotal(revenue), prevTotal: prevRevenue ? revTotal(prevRevenue) : null, coupang: { connected: coupangConnected(), at: coupangSync?.at ?? null, error: coupangError } },
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
