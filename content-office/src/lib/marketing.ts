import "server-only";
import { q, newId, j } from "./db";
import { getBlog, getBlogForAi } from "./repo";
import { extractJson, resolveAssignment, runAI } from "./ai/run";
import { seasonKeywordsPrompt } from "./ai/prompts";
import { seasonEvents, seedsFor, type SeasonEvent } from "./seasons";
import type { RoleAssignment } from "./types";
import { WorkflowError } from "./workflow";
import { creatorTrendContext } from "./creator";

type CustomRow = { id: string; blog_id: string | null; name: string; start_date: string; end_date: string; lead_days: number; keywords: string[]; note: string };

export interface SeasonKeyword {
  id: string;
  blog_id: string;
  event_key: string;
  event_name: string;
  year: number;
  keyword: string;
  angle: string;
  timing: string;
  intent: string;
  source: "ai" | "seed";
  provider: string | null;
  model: string | null;
  idea_id: string | null;
  created_at: string;
}

/** 기본 시즌 + 직접 추가한 이벤트 (blogId 가 있으면 해당 블로그·공통 이벤트만) */
export async function eventsForYear(year: number, blogId?: string | null): Promise<SeasonEvent[]> {
  const custom = await q<CustomRow>(
    `SELECT * FROM marketing_events WHERE (start_date LIKE $1 OR end_date LIKE $1) ${blogId ? "AND (blog_id IS NULL OR blog_id=$2)" : ""} ORDER BY start_date`,
    blogId ? [`${year}-%`, blogId] : [`${year}-%`],
  );
  const customEvents: SeasonEvent[] = custom.map((c) => ({
    key: `custom:${c.id}`,
    name: c.name,
    start: c.start_date,
    end: c.end_date,
    leadDays: c.lead_days,
    kind: "custom",
    seeds: { all: c.keywords },
    note: c.note,
    custom: true,
    customId: c.id,
    blogId: c.blog_id,
  }));
  return [...seasonEvents(year), ...customEvents].sort((a, b) => (a.start < b.start ? -1 : 1));
}

export async function findEvent(year: number, key: string) {
  const all = await eventsForYear(year);
  return all.find((e) => e.key === key) ?? null;
}

export async function addCustomEvent(input: { blogId?: string | null; name: string; start: string; end?: string; leadDays?: number; keywords?: string[]; note?: string }) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!input.name?.trim()) throw new WorkflowError("이벤트 이름을 입력하세요.");
  if (!re.test(input.start || "")) throw new WorkflowError("시작일을 입력하세요.");
  const end = input.end && re.test(input.end) ? input.end : input.start;
  if (end < input.start) throw new WorkflowError("종료일이 시작일보다 빠릅니다.");
  const id = newId("mev_");
  await q(
    "INSERT INTO marketing_events (id, blog_id, name, start_date, end_date, lead_days, keywords, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, input.blogId || null, input.name.trim(), input.start, end, Math.max(0, Math.min(180, Number(input.leadDays ?? 21))), j((input.keywords ?? []).map((k) => k.trim()).filter(Boolean)), input.note ?? ""],
  );
  return id;
}

export async function listSeasonKeywords(blogId: string, year: number) {
  return q<SeasonKeyword>("SELECT * FROM season_keywords WHERE blog_id=$1 AND year=$2 ORDER BY created_at DESC", [blogId, year]);
}

/** AI로 시즌 키워드 도출 (검색량 수치 없이 키워드·의도·글 방향·발행 시점만) */
export async function deriveSeasonKeywords(input: { blogId: string; year: number; eventKey: string; hint?: string; override?: RoleAssignment | null }) {
  const blog = await getBlogForAi(input.blogId);
  if (!blog) throw new WorkflowError("블로그를 찾을 수 없습니다.");
  const ev = await findEvent(input.year, input.eventKey);
  if (!ev) throw new WorkflowError("이벤트를 찾을 수 없습니다.");
  const r = await resolveAssignment(blog, "ideas", input.override ?? null);
  if (r.fallback || r.assignment.provider === "template")
    throw new WorkflowError("AI 시즌 키워드 도출은 AI 연결이 필요합니다. 연결 전에는 '출발 키워드'를 글감으로 보낼 수 있습니다.");
  const existing = await q<{ keyword: string }>("SELECT keyword FROM season_keywords WHERE blog_id=$1 AND year=$2 AND event_key=$3", [blog.id, input.year, ev.key]);
  const { system, prompt } = seasonKeywordsPrompt({
    blog,
    eventName: ev.name,
    start: ev.start,
    end: ev.end,
    leadDays: ev.leadDays,
    seeds: seedsFor(ev, blog.category),
    existing: existing.map((e) => e.keyword),
    hint: input.hint ?? "",
    trendContext: await creatorTrendContext(blog.id),
  });
  const res = await runAI({ purpose: "season-keywords", role: "ideas", blog, system, prompt, json: true, retries: 2, maxTokens: 4000, override: input.override ?? null });
  const data = extractJson<{ keywords?: { keyword?: string; intent?: string; angle?: string; timing?: string }[] }>(res.text);
  const seen = new Set(existing.map((e) => e.keyword));
  let added = 0;
  for (const k of data.keywords ?? []) {
    const kw = String(k.keyword ?? "").trim();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    await q(
      `INSERT INTO season_keywords (id, blog_id, event_key, event_name, year, keyword, angle, timing, intent, source, provider, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ai',$10,$11)`,
      [newId("skw_"), blog.id, ev.key, ev.name, input.year, kw, String(k.angle ?? ""), String(k.timing ?? ""), String(k.intent ?? ""), res.provider, res.model],
    );
    added++;
  }
  return { added, provider: res.provider, model: res.model };
}

/** 키워드 → 글감 보관함 (연구소). 출발 키워드(seed)는 즉석에서 저장 후 보냄 */
export async function keywordsToIdeas(input: { blogId: string; year: number; eventKey: string; ids?: string[]; seeds?: string[] }) {
  const blog = await getBlog(input.blogId);
  if (!blog) throw new WorkflowError("블로그를 찾을 수 없습니다.");
  const ev = await findEvent(input.year, input.eventKey);
  if (!ev) throw new WorkflowError("이벤트를 찾을 수 없습니다.");
  const rows: SeasonKeyword[] = [];
  if (input.ids?.length) {
    rows.push(...(await q<SeasonKeyword>("SELECT * FROM season_keywords WHERE blog_id=$1 AND id = ANY($2)", [blog.id, input.ids])));
  }
  for (const s of input.seeds ?? []) {
    const id = newId("skw_");
    await q(
      `INSERT INTO season_keywords (id, blog_id, event_key, event_name, year, keyword, source) VALUES ($1,$2,$3,$4,$5,$6,'seed')`,
      [id, blog.id, ev.key, ev.name, input.year, s.trim()],
    );
    rows.push((await q<SeasonKeyword>("SELECT * FROM season_keywords WHERE id=$1", [id]))[0]);
  }
  let created = 0;
  for (const k of rows) {
    if (k.idea_id) continue;
    const ideaId = newId("idea_");
    const memo = [
      `마케팅 달력: ${ev.name} (${ev.start}${ev.end !== ev.start ? ` ~ ${ev.end}` : ""}) · 준비 시작 권장 D-${ev.leadDays}`,
      k.angle && `글 방향: ${k.angle}`,
      k.timing && `발행 시점: ${k.timing}`,
      k.intent && `검색 의도: ${k.intent}`,
    ]
      .filter(Boolean)
      .join("\n");
    await q(
      `INSERT INTO ideas (id, blog_id, title, memo, keywords, origin, origin_detail) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ideaId, blog.id, k.keyword, memo, j([k.keyword]), k.source === "ai" ? "ai" : "user", k.source === "ai" ? `마케팅 달력 AI 제안 (${k.provider}/${k.model}) · 검색량 데이터 없음` : "마케팅 달력 출발 키워드"],
    );
    await q("UPDATE season_keywords SET idea_id=$2 WHERE id=$1", [k.id, ideaId]);
    created++;
  }
  return { created };
}
