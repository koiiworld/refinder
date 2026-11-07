import "server-only";
import { q, q1, j } from "./db";
import { getBlog } from "./repo";
import { naverPostStats } from "./blog-posts";
import { extractJson, runStep } from "./ai/run";

/**
 * 블로그별 인기 글 TOP 10
 * - 조회수: 네이버·티스토리는 글별 조회수를 공개하지 않아, 통계 화면 캡처를 AI가 읽어 날짜별로 저장(view_captures)
 *   · 일간: 가장 최근 일간 캡처
 *   · 주간·월간: 그 기간 캡처가 있으면 그것, 없으면 최근 7일·30일 일간 캡처를 글별로 더함
 * - 반응 순위: 공개된 공감·댓글 수 (네이버)
 */

export type ViewItem = { rank: number; title: string; views: number };
export type ViewKind = "day" | "week" | "month";
export type ViewsBlock = { items: ViewItem[]; source: "capture" | "sum" | "none"; label: string; days: number; capturedAt: string | null };
export type ReactionTop = { title: string; url: string; likes: number; comments: number; views: number | null; date: string | null }[];

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
/** 잘린 제목('…')도 같은 글로 묶기 위한 키 */
const keyOf = (t: string) => t.replace(/(\.\.\.|…)$/, "").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 18).toLowerCase();

function rankItems(list: { title: string; views: number }[]): ViewItem[] {
  return list.sort((a, b) => b.views - a.views).slice(0, 10).map((x, i) => ({ rank: i + 1, ...x }));
}

/** 일간 캡처 여러 개를 글별로 합산 (제목이 긴 쪽을 대표로) */
function sumDaily(rows: { items: ViewItem[] }[]) {
  const m = new Map<string, { title: string; views: number }>();
  for (const r of rows)
    for (const it of r.items) {
      const k = keyOf(it.title);
      if (!k) continue;
      const cur = m.get(k);
      m.set(k, { title: cur && cur.title.length >= it.title.length ? cur.title : it.title, views: (cur?.views ?? 0) + it.views });
    }
  return rankItems([...m.values()]);
}

export async function viewsOf(blogId: string): Promise<Record<ViewKind, ViewsBlock>> {
  const today = kstToday();
  const rows = await q<{ kind: ViewKind; day: string; period: string; items: ViewItem[]; created_at: string }>(
    "SELECT kind, to_char(day, 'YYYY-MM-DD') AS day, period, items, created_at FROM view_captures WHERE blog_id=$1 AND day >= $2::date ORDER BY day DESC",
    [blogId, addDays(today, -40)],
  );
  const daily = rows.filter((r) => r.kind === "day");
  const latestDay = daily[0];
  const out = {} as Record<ViewKind, ViewsBlock>;
  out.day = latestDay
    ? { items: rankItems(latestDay.items.map((i) => ({ title: i.title, views: i.views }))), source: "capture", label: latestDay.period || latestDay.day, days: 1, capturedAt: latestDay.created_at }
    : { items: [], source: "none", label: "", days: 0, capturedAt: null };
  for (const [kind, span] of [["week", 7], ["month", 30]] as const) {
    const cap = rows.find((r) => r.kind === kind && r.day >= addDays(today, -span));
    if (cap) {
      out[kind] = { items: rankItems(cap.items.map((i) => ({ title: i.title, views: i.views }))), source: "capture", label: cap.period || `~${cap.day}`, days: span, capturedAt: cap.created_at };
      continue;
    }
    const inRange = daily.filter((r) => r.day > addDays(today, -span));
    out[kind] = inRange.length
      ? { items: sumDaily(inRange), source: "sum", label: `일간 캡처 ${inRange.length}일치 합계 (${inRange[inRange.length - 1].day} ~ ${inRange[0].day})`, days: inRange.length, capturedAt: inRange[0].created_at }
      : { items: [], source: "none", label: "", days: 0, capturedAt: null };
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 일간 캡처가 있는 날짜들 (최근 순) */
export async function captureDays(blogId: string) {
  return (await q<{ day: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM view_captures WHERE blog_id=$1 AND kind='day' ORDER BY day DESC LIMIT 400", [blogId])).map((r) => r.day);
}

/** 고른 날 하루 (일간 캡처) */
export async function viewsOnDay(blogId: string, day: string): Promise<ViewsBlock & { day: string }> {
  if (!DATE_RE.test(day)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const r = await q1<{ period: string; items: ViewItem[]; created_at: string }>("SELECT period, items, created_at FROM view_captures WHERE blog_id=$1 AND kind='day' AND day=$2::date", [blogId, day]);
  return r
    ? { day, items: rankItems(r.items.map((i) => ({ title: i.title, views: i.views }))), source: "capture", label: r.period || day, days: 1, capturedAt: r.created_at }
    : { day, items: [], source: "none", label: "", days: 0, capturedAt: null };
}

/** 기간 지정: 그 사이 일간 캡처를 글별로 합산 */
export async function viewsInRange(blogId: string, from: string, to: string): Promise<ViewsBlock & { from: string; to: string; missing: number }> {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new Error("기간을 골라 주세요.");
  if (from > to) [from, to] = [to, from];
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (span > 366) throw new Error("기간은 1년 이하로 골라 주세요.");
  const rows = await q<{ day: string; items: ViewItem[]; created_at: string }>(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, items, created_at FROM view_captures WHERE blog_id=$1 AND kind='day' AND day BETWEEN $2::date AND $3::date ORDER BY day DESC",
    [blogId, from, to],
  );
  return {
    from, to, missing: span - rows.length,
    items: rows.length ? sumDaily(rows) : [], source: rows.length ? "sum" : "none",
    label: rows.length ? `${from} ~ ${to} · 일간 캡처 ${rows.length}일치 합계${span - rows.length ? ` (캡처 없는 날 ${span - rows.length}일 빠짐)` : ""}` : "",
    days: rows.length, capturedAt: rows[0]?.created_at ?? null,
  };
}

export async function topPosts(blogId: string) {
  const blog = await getBlog(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const stats = blog.url ? await naverPostStats(blog.url) : {};
  const reaction: ReactionTop = Object.values(stats)
    .filter((s) => s.title && s.url)
    .map((s) => ({ title: s.title!, url: s.url!, likes: s.likes, comments: s.comments, views: s.views, date: s.date ?? null }))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || b.likes + b.comments * 3 - (a.likes + a.comments * 3))
    .slice(0, 10);
  // 예전 방식으로 한 장 저장해 둔 캡처가 있으면 그날의 일간 기록으로 옮김
  const old = await q1<{ value: { at: string; period: string; items: ViewItem[]; ai?: string } }>("SELECT value FROM settings WHERE key=$1", [`top_views:${blogId}`]);
  if (old?.value?.items?.length) {
    const day = new Date(new Date(old.value.at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    await q("INSERT INTO view_captures (blog_id, kind, day, period, items, ai) VALUES ($1,'day',$2,$3,$4,$5) ON CONFLICT DO NOTHING", [blogId, day, old.value.period ?? "", j(old.value.items), old.value.ai ?? ""]);
    await q("DELETE FROM settings WHERE key=$1", [`top_views:${blogId}`]);
  }
  const days = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM view_captures WHERE blog_id=$1 AND kind='day'", [blogId]);
  return { views: await viewsOf(blogId), reaction, platform: blog.platform, dailyCaptures: Number(days[0]?.n ?? 0), captureDays: await captureDays(blogId) };
}

/** 통계 화면 캡처 → AI가 기간 종류(일간·주간·월간)·날짜·글별 조회수를 읽어 저장 */
export async function saveViewsFromCapture(blogId: string, images: string[], kindHint?: ViewKind) {
  const blog = await getBlog(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const today = kstToday();
  const system = `당신은 블로그 통계 화면을 읽어 옮겨 적는 도우미입니다. 화면에 실제로 보이는 글 제목과 숫자만 옮기고, 보이지 않는 값은 절대 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `첨부한 캡처는 ${blog.platform === "tistory" ? "티스토리 통계(인기글)" : "네이버 크리에이터 어드바이저(또는 블로그 통계)의 조회수 순위·인기 콘텐츠"} 화면입니다. 오늘은 ${today} 입니다.
- kind: 화면의 기간 단위. 일간이면 "day", 주간이면 "week", 월간이면 "month" (선택된 탭·날짜 범위로 판단, 모르면 "day")
- date: 그 기간의 마지막 날짜 (YYYY-MM-DD). 일간이면 그날. 연도가 안 보이면 오늘 기준으로 추정. 모르면 빈 문자열
- period: 화면에 보이는 기간 문구 그대로 (예: "2026.11.06.", "2026.11.02.~11.08.")
- items: 글 제목과 조회수를 조회수가 많은 순서대로 최대 10개. title 은 보이는 그대로(잘려 있으면 보이는 만큼), views 는 숫자만
- 조회수 목록이 안 보이면 items 를 빈 배열로
형식: {"kind": "day", "date": "", "period": "", "items": [{"title": "", "views": 0}]}`;
  const res = await runStep({ step: "keywords", purpose: "top-views", blog: null, system, prompt, images, json: true, maxTokens: 1500 });
  const raw = extractJson<{ kind?: string; date?: string; period?: string; items?: { title?: string; views?: number | string }[] }>(res.text);
  const items = rankItems(
    (raw.items ?? []).map((i) => ({ title: String(i.title ?? "").trim(), views: Number(String(i.views ?? "").replace(/[^\d]/g, "")) || 0 })).filter((i) => i.title),
  );
  if (!items.length) throw new Error("캡처에서 글 제목·조회수를 찾지 못했어요. 조회수 순위가 보이는 화면으로 다시 올려 주세요.");
  const kind: ViewKind = kindHint ?? (["day", "week", "month"].includes(String(raw.kind)) ? (raw.kind as ViewKind) : "day");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) && String(raw.date) <= addDays(today, 1) ? String(raw.date) : today;
  await q(
    `INSERT INTO view_captures (blog_id, kind, day, period, items, ai) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (blog_id, kind, day) DO UPDATE SET period=EXCLUDED.period, items=EXCLUDED.items, ai=EXCLUDED.ai, created_at=NOW()`,
    [blogId, kind, date, String(raw.period ?? "").slice(0, 60), j(items), `${res.provider}/${res.model}`],
  );
  // 예전 방식(한 장만 저장)은 정리
  await q("DELETE FROM settings WHERE key=$1", [`top_views:${blogId}`]).catch(() => {});
  return { kind, date, period: String(raw.period ?? ""), items };
}

export async function lastCaptureDay(blogId: string) {
  const r = await q1<{ day: string }>("SELECT to_char(MAX(day), 'YYYY-MM-DD') AS day FROM view_captures WHERE blog_id=$1 AND kind='day'", [blogId]);
  return r?.day ?? null;
}
