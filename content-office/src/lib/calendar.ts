import "server-only";
import { q, q1, newId, j } from "./db";
import { seasonEvents, KIND_LABEL } from "./seasons";

/**
 * 📅 마케팅 달력
 * - season: 매년 돌아오는 시즌·쇼핑 이벤트 (앱 시즌 목록)
 * - official: 공식 일정이 확인된 공휴일·행사 (구글 한국 공휴일 달력 + 직접 넣은 공식 행사)
 * - irregular: 비정기·갑작스런 행사 (선거·임시공휴일 + 직접 넣은 행사)
 * - publish: 내 발행 예정일 · 발행한 날
 */

export type CalCat = "season" | "official" | "irregular" | "publish" | "todo";
export type CalEvent = { id: string; title: string; start: string; end: string; cat: CalCat; sub: string; link: string; note: string; seeds: string[]; postId?: string; custom?: boolean; todoId?: string; done?: boolean; time?: string | null };

export const CAT_LABEL: Record<CalCat, string> = { season: "연간 시즌 행사", official: "공휴일·공식 행사", irregular: "비정기 행사", publish: "콘텐츠 발행 일정", todo: "업무 일정 (할 일)" };

const naverSearch = (s: string) => `https://search.naver.com/search.naver?query=${encodeURIComponent(s)}`;
const ICS_URL = () => process.env.KR_HOLIDAY_ICS_URL?.trim() || "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics";

function addDaysStr(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const toDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** 구글 한국 공휴일 달력 (공휴일·대체공휴일·선거일·임시공휴일), 하루 캐시 */
export async function krHolidays(): Promise<{ title: string; start: string; end: string }[]> {
  const cached = await q1<{ data: { list: { title: string; start: string; end: string }[] }; at: string }>("SELECT data, collected_at AS at FROM research_snapshots WHERE source='kr_holidays' ORDER BY collected_at DESC LIMIT 1");
  if (cached && Date.now() - new Date(cached.at).getTime() < 24 * 3600 * 1000) return cached.data.list;
  try {
    const res = await fetch(ICS_URL(), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ics = (await res.text()).replace(/\r\n[ \t]/g, "");
    const list = [...ics.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)]
      .map((m) => {
        const b = m[1];
        const s = /DTSTART;VALUE=DATE:(\d{8})/.exec(b)?.[1];
        const e = /DTEND;VALUE=DATE:(\d{8})/.exec(b)?.[1];
        const t = /SUMMARY:(.+)/.exec(b)?.[1]?.trim();
        return s && t ? { title: t.replace(/\\,/g, ","), start: toDate(s), end: e ? addDaysStr(toDate(e), -1) : toDate(s) } : null;
      })
      .filter((x): x is { title: string; start: string; end: string } => !!x);
    await q("DELETE FROM research_snapshots WHERE source='kr_holidays'");
    await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'kr_holidays','{}',$2)", [newId("snap_"), j({ list })]);
    return list;
  } catch {
    return cached?.data.list ?? [];
  }
}

const overlaps = (s: string, e: string, from: string, to: string) => s <= to && e >= from;

export async function monthEvents(ym: string): Promise<CalEvent[]> {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // 그 달 마지막 날
  const out: CalEvent[] = [];
  // 매년 시즌 (앞뒤 해 포함: 연말~연초 걸치는 시즌)
  for (const yr of [y - 1, y]) {
    for (const ev of seasonEvents(yr)) {
      if (!overlaps(ev.start, ev.end, from, to)) continue;
      const seeds = Array.from(new Set(Object.values(ev.seeds).flat().filter(Boolean) as string[])).slice(0, 12);
      out.push({ id: `season:${ev.key}:${ev.start}`, title: ev.name, start: ev.start, end: ev.end, cat: "season", sub: KIND_LABEL[ev.kind] ?? "", link: naverSearch(ev.name), note: `${ev.leadDays}일 전부터 준비하면 좋아요${ev.tentative ? ` · 날짜 미확정: ${ev.tentative}` : ""}${ev.note ? ` · ${ev.note}` : ""}`, seeds });
    }
  }
  // 공휴일·선거 (구글 한국 공휴일 달력)
  for (const h of await krHolidays()) {
    if (!overlaps(h.start, h.end, from, to)) continue;
    const irregular = /선거|임시\s*공휴일|임시공휴일/.test(h.title);
    out.push({ id: `holiday:${h.start}:${h.title}`, title: h.title, start: h.start, end: h.end, cat: irregular ? "irregular" : "official", sub: irregular ? "임시공휴일 등" : "공휴일·기념일", link: naverSearch(`${h.start.slice(0, 4)} ${h.title}`), note: "출처: 구글 대한민국 공휴일 달력", seeds: [] });
  }
  // 직접 넣은 행사
  for (const c of await q<{ id: string; title: string; start_date: string; end_date: string; kind: string; link: string; memo: string }>(
    "SELECT * FROM calendar_events WHERE start_date <= $2 AND end_date >= $1 ORDER BY start_date",
    [from, to],
  )) {
    out.push({ id: `custom:${c.id}`, title: c.title, start: c.start_date, end: c.end_date, cat: c.kind === "official" ? "official" : "irregular", sub: "직접 추가", link: c.link, note: c.memo, seeds: [], custom: true });
  }
  // 내 발행 예정일·발행한 날
  for (const p of await q<{ id: string; title: string; publish_date: string | null; published_at: string | null; stage: string; blog_name: string }>(
    `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.publish_date, p.stage, b.name AS blog_name,
            to_char((p.package->>'publishedAt')::timestamptz AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS published_at
       FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id
      WHERE p.deleted_at IS NULL AND (p.publish_date BETWEEN $1 AND $2 OR (p.package->>'publishedAt') IS NOT NULL)`,
    [from, to],
  )) {
    const day = p.stage === "published" && p.published_at ? p.published_at : p.publish_date;
    if (!day || day < from || day > to) continue;
    out.push({ id: `post:${p.id}`, title: p.title, start: day, end: day, cat: "publish", sub: `${p.blog_name} · ${p.stage === "published" ? "발행함" : "발행 예정"}`, link: "", note: "", seeds: [], postId: p.id });
  }
  // 내 할 일 (할 일에서 추가·수정하면 바로 반영)
  const CAT_ICON: Record<string, string> = { insta: "📱", youtube: "🎬", blog: "📝", personal: "🙋" };
  for (const t of await q<{ id: string; title: string; due_date: string; due_time: string | null; category: string; blog_id: string | null; blog_name: string | null; done_at: string | null; memo: string }>(
    "SELECT t.id, t.title, t.due_date, t.due_time, t.category, t.blog_id, b.name AS blog_name, t.done_at, t.memo FROM todos t LEFT JOIN blogs b ON b.id=t.blog_id WHERE t.due_date BETWEEN $1 AND $2",
    [from, to],
  )) {
    const cat = ["insta", "youtube", "blog", "personal"].includes(t.category) ? t.category : t.blog_id ? "blog" : "personal";
    const label = { insta: "인스타", youtube: "유튜브", blog: "블로그", personal: "개인일정" }[cat]!;
    out.push({ id: `todo:${t.id}`, todoId: t.id, title: `${CAT_ICON[cat]} ${t.title}`, start: t.due_date, end: t.due_date, cat: "todo", sub: `${label}${t.blog_name ? ` · ${t.blog_name}` : ""}${t.due_time ? ` · ${t.due_time}` : ""}${t.done_at ? " · 완료" : ""}`, link: "", note: t.memo, seeds: [], done: !!t.done_at, time: t.due_time });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || (a.time ?? "").localeCompare(b.time ?? "") || a.cat.localeCompare(b.cat));
}

export async function addCalendarEvent(input: { title?: string; start?: string; end?: string; kind?: string; link?: string; memo?: string }) {
  const title = String(input.title ?? "").trim().slice(0, 120);
  const ok = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!title || !ok(input.start)) throw new Error("행사 이름과 날짜를 적어 주세요.");
  const end = ok(input.end) && String(input.end) >= String(input.start) ? String(input.end) : String(input.start);
  const id = newId("cal_");
  await q("INSERT INTO calendar_events (id, title, start_date, end_date, kind, link, memo) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    id, title, input.start, end, input.kind === "official" ? "official" : "irregular", String(input.link ?? "").slice(0, 500), String(input.memo ?? "").slice(0, 500),
  ]);
  return id;
}

export async function deleteCalendarEvent(id: string) {
  await q("DELETE FROM calendar_events WHERE id=$1", [id]);
}
