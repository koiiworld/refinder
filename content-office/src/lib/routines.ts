import "server-only";
import crypto from "node:crypto";
import { q, q1, newId, j } from "./db";
import { kstToDate, kstToday, telegramConnected } from "./todos";

/**
 * 🔁 루틴 관리 + 텔레그램 알림 (기획안: 루틴 관리 및 텔레그램 알림 자동화)
 * - 반복 업무(루틴)를 한 번 등록 → 날마다 실행(run)을 만들고 정해진 시각에 텔레그램으로 알림
 * - 완료 조건(완료 버튼 / 필수 체크리스트·캡처 / 시스템 확인)을 채울 때까지 설정대로 재알림, 마감 지나면 '미수집'
 * - 서버 작업자가 1분마다 처리 (브라우저를 닫아도 동작). 실행·알림은 DB 고유키로 한 번만 만들고, 보낼 알림은 한 서버만 가져감
 * - 텔레그램 버튼(완료 처리·30분 뒤 알림)은 서버가 주기적으로 받아 처리 (웹훅 설정 없이)
 * - 시각은 한국 시간으로 입력·표시, DB 에는 실제 시각(UTC)으로 저장
 */
export const ROUTINE_CATS = [
  { id: "blog", label: "블로그 관리" },
  { id: "research", label: "콘텐츠 리서치" },
  { id: "insta", label: "인스타그램 관리" },
  { id: "video", label: "영상 제작" },
  { id: "etc", label: "기타" },
] as const;
export type ChecklistItem = { id: string; label: string; kind: "capture" | "views" | "check"; required: boolean };
export type Routine = {
  id: string; name: string; category: string; blog_id: string | null; link: string;
  schedule: { type: "daily" | "weekly" | "monthly"; days?: number[]; day?: number; baseOffset?: number };
  time: string; deadline: string; notify: boolean;
  remind: { mode: "interval" | "times" | "none"; minutes?: number; times?: string[]; max?: number };
  completion: "button" | "checklist" | "system"; checklist: ChecklistItem[];
  skip_holidays: boolean; paused: boolean; priority: string; created_at: string; updated_at: string;
};
export type RunItem = { id: string; done: boolean; at?: string; img?: string; note?: string };
export type Run = { id: string; routine_id: string; run_date: string; base_date: string; due_at: string; deadline_at: string; status: "pending" | "in_progress" | "done" | "missed"; items: RunItem[]; completed_at: string | null; created_at: string };
export type Policy = { quietOn: boolean; quietStart: string; quietEnd: string; briefingOn: boolean; briefingTime: string };
export const DEFAULT_POLICY: Policy = { quietOn: true, quietStart: "22:00", quietEnd: "08:00", briefingOn: false, briefingTime: "08:30" };

const isTime = (s: unknown) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const sid = () => crypto.randomBytes(4).toString("hex");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const kstNowHM = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(11, 16);
const tgBase = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/$/, "");

// ── 루틴 ──
export async function listRoutines() {
  return q<Routine>("SELECT * FROM routines ORDER BY paused, time, created_at");
}
export async function getRoutine(id: string) {
  return q1<Routine>("SELECT * FROM routines WHERE id=$1", [id]);
}

function clean(input: Partial<Routine>, cur?: Routine) {
  const name = String(input.name ?? cur?.name ?? "").trim().slice(0, 80);
  if (!name) throw new Error("루틴 이름을 적어 주세요.");
  const sc = input.schedule ?? cur?.schedule ?? { type: "daily" };
  const type = ["daily", "weekly", "monthly"].includes(String(sc.type)) ? sc.type : "daily";
  const days = Array.from(new Set((sc.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))).sort();
  const day = Math.max(1, Math.min(31, Number(sc.day) || 1));
  if (type === "weekly" && !days.length) throw new Error("매주 반복할 요일을 골라 주세요.");
  const time = isTime(input.time) ? String(input.time) : cur?.time ?? "09:00";
  const deadline = isTime(input.deadline) ? String(input.deadline) : cur?.deadline ?? "23:59";
  if (deadline <= time) throw new Error("마감 시각은 첫 알림보다 늦어야 해요.");
  const rm = input.remind ?? cur?.remind ?? { mode: "none" };
  const mode = ["interval", "times", "none"].includes(String(rm.mode)) ? rm.mode : "none";
  const remind = {
    mode,
    minutes: [30, 60, 120, 180].includes(Number(rm.minutes)) ? Number(rm.minutes) : 120,
    times: Array.from(new Set((rm.times ?? []).filter(isTime))).sort().slice(0, 6),
    max: Math.max(1, Math.min(6, Number(rm.max) || 2)),
  };
  // 정한 시각: 횟수만큼 시각이 있게 (모자라면 앞 시각 +2시간)
  if (remind.mode === "times") {
    while (remind.times.length < remind.max) {
      const [h, m] = (remind.times[remind.times.length - 1] ?? time).split(":").map(Number);
      remind.times.push(`${String(Math.min(23, h + 2)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    remind.times = Array.from(new Set(remind.times)).sort().slice(0, remind.max);
    if (remind.times.some((x) => x <= time)) throw new Error("재알림 시각은 첫 알림보다 늦어야 해요.");
  }
  const completion = ["button", "checklist", "system"].includes(String(input.completion ?? cur?.completion)) ? (input.completion ?? cur?.completion)! : "button";
  const checklist: ChecklistItem[] = (input.checklist ?? cur?.checklist ?? [])
    .map((c) => ({ id: c.id || sid(), label: String(c.label ?? "").trim().slice(0, 80), kind: (["capture", "views", "check"].includes(String(c.kind)) ? c.kind : "check") as ChecklistItem["kind"], required: c.required !== false }))
    .filter((c) => c.label)
    .slice(0, 10);
  if (completion === "checklist" && !checklist.some((c) => c.required)) throw new Error("필수 항목을 하나 이상 넣어 주세요.");
  const blog_id = input.blog_id !== undefined ? input.blog_id || null : cur?.blog_id ?? null;
  if (completion === "system" && !blog_id) throw new Error("시스템 확인은 블로그를 골라야 해요 (그 블로그의 조회수 순위 캡처가 저장됐는지 확인).");
  return {
    name, category: ROUTINE_CATS.some((c) => c.id === input.category) ? String(input.category) : cur?.category ?? "blog",
    blog_id, link: String(input.link ?? cur?.link ?? "").trim().slice(0, 300),
    schedule: { type, ...(type === "weekly" ? { days } : {}), ...(type === "monthly" ? { day } : {}), baseOffset: Number((input.schedule ?? cur?.schedule)?.baseOffset) === -1 ? -1 : 0 },
    time, deadline, notify: input.notify !== undefined ? !!input.notify : cur?.notify ?? true, remind, completion, checklist,
    skip_holidays: input.skip_holidays !== undefined ? !!input.skip_holidays : cur?.skip_holidays ?? false,
    paused: input.paused !== undefined ? !!input.paused : cur?.paused ?? false,
    priority: ["high", "normal", "low"].includes(String(input.priority)) ? String(input.priority) : cur?.priority ?? "normal",
  };
}

export async function createRoutine(input: Partial<Routine>) {
  const c = clean(input);
  const id = newId("rt_");
  await q(
    `INSERT INTO routines (id, name, category, blog_id, link, schedule, time, deadline, notify, remind, completion, checklist, skip_holidays, paused, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, c.name, c.category, c.blog_id, c.link, j(c.schedule), c.time, c.deadline, c.notify, j(c.remind), c.completion, j(c.checklist), c.skip_holidays, c.paused, c.priority],
  );
  await ensureRuns(); // 오늘 해당되면 바로 오늘 실행을 만듦
  return getRoutine(id);
}

export async function updateRoutine(id: string, input: Partial<Routine>) {
  const cur = await getRoutine(id);
  if (!cur) throw new Error("루틴을 찾을 수 없어요.");
  const c = clean(input, cur);
  await q(
    `UPDATE routines SET name=$2, category=$3, blog_id=$4, link=$5, schedule=$6, time=$7, deadline=$8, notify=$9, remind=$10, completion=$11, checklist=$12, skip_holidays=$13, paused=$14, priority=$15, updated_at=NOW() WHERE id=$1`,
    [id, c.name, c.category, c.blog_id, c.link, j(c.schedule), c.time, c.deadline, c.notify, j(c.remind), c.completion, j(c.checklist), c.skip_holidays, c.paused, c.priority],
  );
  // 일시정지면 오늘 남은 알림 취소, 다시 켜면 아직 시작 안 한 오늘 실행의 알림을 다시 예약
  const today = await q1<Run>("SELECT * FROM routine_runs WHERE routine_id=$1 AND run_date=$2", [id, kstToday()]);
  if (today && !["done", "missed"].includes(today.status)) {
    await q("UPDATE routine_notifications SET status='canceled' WHERE run_id=$1 AND status='pending'", [today.id]);
    if (!c.paused) await scheduleNotifications(today, (await getRoutine(id))!);
  }
  return getRoutine(id);
}

export async function deleteRoutine(id: string) {
  await q("DELETE FROM routines WHERE id=$1", [id]);
}

/** 이 날짜에 해당하는 루틴인지 (매월 지정일이 없는 달은 건너뜀) */
export function isDueOn(r: Pick<Routine, "schedule">, date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (r.schedule.type === "weekly") return (r.schedule.days ?? []).includes(d.getUTCDay());
  if (r.schedule.type === "monthly") return d.getUTCDate() === (r.schedule.day ?? 1);
  return true;
}

// ── 실행 ──
export async function getRun(id: string) {
  return q1<Run>("SELECT * FROM routine_runs WHERE id=$1", [id]);
}

export async function listRuns(opts: { from?: string; to?: string; status?: string; routineId?: string } = {}) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.from) { args.push(opts.from); where.push(`r.run_date >= $${args.length}`); }
  if (opts.to) { args.push(opts.to); where.push(`r.run_date <= $${args.length}`); }
  if (opts.status) { args.push(opts.status); where.push(`r.status = $${args.length}`); }
  if (opts.routineId) { args.push(opts.routineId); where.push(`r.routine_id = $${args.length}`); }
  return q<Run & { name: string; time: string; completion: string; checklist: ChecklistItem[]; blog_id: string | null; link: string; category: string }>(
    `SELECT r.*, t.name, t.time, t.completion, t.checklist, t.blog_id, t.link, t.category FROM routine_runs r JOIN routines t ON t.id=r.routine_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.run_date DESC, r.due_at LIMIT 300`,
    args,
  );
}

/** 오늘(한국 날짜) 해당하는 루틴의 실행을 만듦 — 루틴+날짜 고유키라 여러 번 불러도 한 번만 */
export async function ensureRuns(date = kstToday()) {
  const routines = await q<Routine>("SELECT * FROM routines WHERE paused = FALSE");
  let holidays: Set<string> | null = null;
  for (const r of routines) {
    if (!isDueOn(r, date)) continue;
    if (r.skip_holidays) {
      if (!holidays) {
        const { krHolidays } = await import("./calendar");
        holidays = new Set((await krHolidays().catch(() => [])).map((h) => h.start));
      }
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (holidays.has(date) || dow === 0 || dow === 6) continue;
    }
    const id = newId("run_");
    const base = addDays(date, r.schedule.baseOffset === -1 ? -1 : 0);
    const items: RunItem[] = r.checklist.map((c) => ({ id: c.id, done: false }));
    const ins = await q1<Run>(
      `INSERT INTO routine_runs (id, routine_id, run_date, base_date, due_at, deadline_at, items) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (routine_id, run_date) DO NOTHING RETURNING *`,
      [id, r.id, date, base, kstToDate(date, r.time).toISOString(), kstToDate(date, r.deadline).toISOString(), j(items)],
    );
    if (ins) await scheduleNotifications(ins, r);
  }
}

/** 첫 알림 + 재알림 예약 (실행·종류·회차 고유키) */
async function scheduleNotifications(run: Run, r: Routine) {
  if (!r.notify || r.paused) return;
  const due = new Date(run.due_at).getTime();
  const deadline = new Date(run.deadline_at).getTime();
  const now = Date.now();
  const plan: { kind: string; round: number; at: number }[] = [{ kind: "first", round: 0, at: due }];
  if (r.remind.mode === "interval") for (let k = 1; k <= (r.remind.max ?? 2); k++) plan.push({ kind: "remind", round: k, at: due + k * (r.remind.minutes ?? 120) * 60_000 });
  if (r.remind.mode === "times") (r.remind.times ?? []).filter((t) => t > r.time).slice(0, r.remind.max ?? 2).forEach((t, k) => plan.push({ kind: "remind", round: k + 1, at: kstToDate(run.run_date, t).getTime() }));
  for (const p of plan) {
    if (p.at >= deadline) continue;
    // 늦게 만든 실행(첫 알림 시각이 10분 넘게 지남)은 지난 알림을 몰아서 보내지 않음
    const status = p.at < now - 10 * 60_000 ? "skipped" : "pending";
    await q(
      `INSERT INTO routine_notifications (id, run_id, kind, round, send_at, status) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (run_id, kind, round) DO UPDATE SET send_at=EXCLUDED.send_at, status=EXCLUDED.status WHERE routine_notifications.status IN ('pending','canceled')`,
      [newId("rn_"), run.id, p.kind, p.round, new Date(p.at).toISOString(), status],
    );
  }
}

/** 완료 조건 확인: 남은 필수 항목 (없으면 완료 가능) */
export async function missingItems(run: Run, r: Routine) {
  if (r.completion === "button") return [];
  if (r.completion === "system") {
    const ok = r.blog_id ? await q1("SELECT 1 FROM view_captures WHERE blog_id=$1 AND kind='day' AND day=$2::date", [r.blog_id, run.base_date || run.run_date]) : null;
    return ok ? [] : [`${run.base_date || run.run_date} 조회수 순위 캡처 저장`];
  }
  return r.checklist.filter((c) => c.required && !run.items.find((i) => i.id === c.id)?.done).map((c) => c.label);
}

async function finish(run: Run) {
  await q("UPDATE routine_runs SET status='done', completed_at=NOW() WHERE id=$1 AND status <> 'done'", [run.id]);
  // 완료되면 대기 중인 알림은 모두 취소
  await q("UPDATE routine_notifications SET status='canceled' WHERE run_id=$1 AND status='pending'", [run.id]);
}

/** 완료 처리 (웹·텔레그램 버튼 공통) — 필수 자료가 남았으면 완료하지 않고 남은 항목을 돌려줌 */
export async function completeRun(runId: string) {
  const run = await getRun(runId);
  if (!run) throw new Error("실행을 찾을 수 없어요.");
  if (run.status === "done") return { done: true, missing: [] as string[] };
  const r = (await getRoutine(run.routine_id))!;
  const missing = await missingItems(run, r);
  if (missing.length) return { done: false, missing };
  await finish(run);
  return { done: true, missing };
}

/** 체크리스트 항목 표시 (캡처는 사진 아이디와 함께) → 필수 항목이 다 차면 자동 완료 */
export async function setItem(runId: string, itemId: string, patch: { done?: boolean; img?: string | null; note?: string }) {
  const run = await getRun(runId);
  if (!run) throw new Error("실행을 찾을 수 없어요.");
  const r = (await getRoutine(run.routine_id))!;
  if (!r.checklist.some((c) => c.id === itemId)) throw new Error("항목을 찾을 수 없어요.");
  const items = r.checklist.map((c) => {
    const cur = run.items.find((i) => i.id === c.id) ?? { id: c.id, done: false };
    if (c.id !== itemId) return cur;
    const next: RunItem = { ...cur, ...(patch.img !== undefined ? { img: patch.img ?? undefined } : {}), ...(patch.note !== undefined ? { note: String(patch.note).slice(0, 300) } : {}) };
    next.done = patch.done !== undefined ? patch.done : next.done;
    next.at = next.done ? new Date().toISOString() : undefined;
    return next;
  });
  // 마감 지나 '미수집'이 된 건도 나중에 보완하면 그 기준일에 그대로 연결 (상태는 미수집→진행/완료)
  const status = items.some((i) => i.done) ? "in_progress" : run.status === "missed" ? "missed" : "pending";
  await q("UPDATE routine_runs SET items=$2, status=CASE WHEN status='done' THEN 'done' ELSE $3 END WHERE id=$1", [runId, j(items), status]);
  const fresh = (await getRun(runId))!;
  if (r.completion === "checklist" && !(await missingItems(fresh, r)).length) await finish(fresh);
  return getRun(runId);
}

/** 캡처 사진 저장 (비공개: 로그인한 사람만 /api/routines/capture/<id> 로 봄) */
export async function saveCapture(data: Buffer, mime: string, label: string) {
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error("JPG·PNG·WEBP 캡처만 올릴 수 있어요.");
  if (!data.length || data.length > 10 * 1024 * 1024) throw new Error("캡처는 10MB 이하로 올려 주세요.");
  const id = `img_${crypto.randomBytes(12).toString("hex")}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'capture','routine',$2,$3,$4)", [id, mime, data, label.slice(0, 200)]);
  return id;
}

export async function snooze(runId: string, minutes = 30) {
  const run = await getRun(runId);
  if (!run || ["done", "missed"].includes(run.status)) return false;
  const at = new Date(Date.now() + minutes * 60_000);
  if (at.getTime() >= new Date(run.deadline_at).getTime()) return false;
  // 실행 건당 '30분 뒤' 알림은 한 건만 유지 (다시 누르면 시각만 바뀜)
  await q(
    `INSERT INTO routine_notifications (id, run_id, kind, round, send_at, status) VALUES ($1,$2,'snooze',0,$3,'pending')
     ON CONFLICT (run_id, kind, round) DO UPDATE SET send_at=EXCLUDED.send_at, status='pending', attempts=0, error=NULL WHERE routine_notifications.status <> 'sending'`,
    [newId("rn_"), runId, at.toISOString()],
  );
  return true;
}

// ── 알림 정책 ──
export async function getPolicy(): Promise<Policy> {
  const r = await q1<{ value: Partial<Policy> }>("SELECT value FROM settings WHERE key='notify_policy'").catch(() => null);
  return { ...DEFAULT_POLICY, ...(r?.value ?? {}) };
}
export async function savePolicy(p: Partial<Policy>) {
  const cur = await getPolicy();
  const next: Policy = {
    quietOn: p.quietOn !== undefined ? !!p.quietOn : cur.quietOn,
    quietStart: isTime(p.quietStart) ? p.quietStart! : cur.quietStart,
    quietEnd: isTime(p.quietEnd) ? p.quietEnd! : cur.quietEnd,
    briefingOn: p.briefingOn !== undefined ? !!p.briefingOn : cur.briefingOn,
    briefingTime: isTime(p.briefingTime) ? p.briefingTime! : cur.briefingTime,
  };
  await q(`INSERT INTO settings (key, value) VALUES ('notify_policy', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(next)]);
  return next;
}
/** 방해 금지 시간이면 끝나는 시각(실제 시각)을, 아니면 null */
function quietUntil(p: Policy, now = new Date()) {
  if (!p.quietOn) return null;
  const hm = kstNowHM(now);
  const inQuiet = p.quietStart <= p.quietEnd ? hm >= p.quietStart && hm < p.quietEnd : hm >= p.quietStart || hm < p.quietEnd;
  if (!inQuiet) return null;
  const today = kstToday(now);
  const endDate = hm >= p.quietStart && p.quietStart > p.quietEnd ? addDays(today, 1) : today;
  return kstToDate(endDate, p.quietEnd);
}

// ── 텔레그램 ──
async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${tgBase()}/bot${process.env.TELEGRAM_BOT_TOKEN!.trim()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown; parameters?: { retry_after?: number } };
  return { res, d };
}

async function buttons(runId: string, r: Routine) {
  const { publicBase } = await import("./image-refs");
  const base = await publicBase();
  const rows: { text: string; url?: string; callback_data?: string }[][] = [];
  if (base) rows.push([{ text: r.checklist.some((c) => c.kind !== "check") ? "📸 캡처 화면 열기" : "📋 업무 열기", url: `${base}/routines/run/${runId}` }]);
  rows.push([{ text: "✅ 완료 처리", callback_data: `rd:${runId}` }, { text: "⏰ 30분 뒤 알림", callback_data: `rs:${runId}` }]);
  return { inline_keyboard: rows };
}

function messageText(kind: string, run: Run, r: Routine, missing: string[]) {
  const list = r.checklist.length ? r.checklist.map((c, i) => `${"①②③④⑤⑥⑦⑧⑨⑩"[i]} ${c.label}${run.items.find((x) => x.id === c.id)?.done ? " ✔" : ""}`).join("\n") : "";
  const base = run.base_date && run.base_date !== run.run_date ? `\n기준일: ${run.base_date}` : "";
  if (kind === "first") return `📋 ${r.name}\n${r.time} · 지금 할 시간이에요.${base}${list ? `\n\n${list}` : ""}`;
  const left = missing.length ? `아직 ${missing.join(", ")}이(가) 남아 있어요.` : "아직 완료 처리가 안 됐어요.";
  return `⏰ ${r.name}\n${left}${base}\n마감 ${r.deadline}`;
}

/** 보낼 시각이 된 알림 보내기 (한 건씩 한 서버만 가져감) */
export async function sendDue(limit = 10) {
  const due = await q<{ id: string }>("SELECT id FROM routine_notifications WHERE status='pending' AND send_at <= NOW() ORDER BY send_at LIMIT $1", [limit]);
  const policy = await getPolicy();
  for (const { id } of due) {
    const n = await q1<{ id: string; run_id: string; kind: string; attempts: number }>(
      "UPDATE routine_notifications SET status='sending', attempts=attempts+1 WHERE id=$1 AND status='pending' RETURNING id, run_id, kind, attempts",
      [id],
    );
    if (!n) continue;
    const run = await getRun(n.run_id);
    const r = run ? await getRoutine(run.routine_id) : null;
    // 발송 직전 확인: 완료·미수집·일시정지·알림 끔이면 보내지 않음
    if (!run || !r || ["done", "missed"].includes(run.status) || r.paused || !r.notify) {
      await q("UPDATE routine_notifications SET status='canceled' WHERE id=$1", [n.id]);
      continue;
    }
    // 방해 금지: 끝나는 시각으로 미루되, 마감이 지나면 보내지 않음
    const qu = quietUntil(policy);
    if (qu) {
      const ok = qu.getTime() < new Date(run.deadline_at).getTime();
      await q("UPDATE routine_notifications SET status=$2, send_at=$3, attempts=attempts-1 WHERE id=$1", [n.id, ok ? "pending" : "skipped", qu.toISOString()]);
      continue;
    }
    if (!telegramConnected()) {
      await q("UPDATE routine_notifications SET status='failed', error=$2 WHERE id=$1", [n.id, "텔레그램이 연결되지 않았어요 (설정에서 봇 토큰·채팅 ID)"]);
      continue;
    }
    const missing = await missingItems(run, r);
    let out;
    try {
      out = await tg("sendMessage", { chat_id: process.env.TELEGRAM_CHAT_ID!.trim(), text: messageText(n.kind, run, r, missing), reply_markup: await buttons(run.id, r), disable_web_page_preview: true });
    } catch (e) {
      // 응답이 끊김 → 텔레그램이 이미 받았을 수 있어 다시 보내지 않음 (결과 미확인)
      await q("UPDATE routine_notifications SET status='unknown', error=$2 WHERE id=$1", [n.id, `응답 없음 (이미 발송됐을 수 있어 다시 보내지 않음): ${(e as Error).message}`.slice(0, 300)]);
      continue;
    }
    const { res, d } = out;
    if (res.ok && d.ok !== false) {
      await q("UPDATE routine_notifications SET status='sent', sent_at=NOW(), error=NULL, message_id=$2 WHERE id=$1", [n.id, Number((d.result as { message_id?: number })?.message_id) || null]);
      continue;
    }
    if (res.status === 429) {
      // 요청 제한: 텔레그램이 알려 준 시각 뒤에 다시
      const wait = Math.max(5, Number(d.parameters?.retry_after) || 30);
      await q("UPDATE routine_notifications SET status='pending', send_at=NOW() + ($2 || ' seconds')::interval, error=$3 WHERE id=$1", [n.id, String(wait), `요청 제한: ${wait}초 뒤 다시`]);
    } else if (res.status >= 500 && n.attempts < 3) {
      await q("UPDATE routine_notifications SET status='pending', send_at=NOW() + interval '2 minutes', error=$2 WHERE id=$1", [n.id, `텔레그램 일시 오류 ${res.status}`]);
    } else {
      // 토큰 오류·봇 차단 등 → 연결 점검 대상
      await q("UPDATE routine_notifications SET status='failed', error=$2 WHERE id=$1", [n.id, `텔레그램 오류 ${res.status}: ${d.description ?? ""}`.slice(0, 300)]);
    }
  }
}

/** 마감이 지난 실행 → 미수집, 남은 알림 취소 */
export async function markMissed() {
  const rows = await q<{ id: string }>("UPDATE routine_runs SET status='missed' WHERE status IN ('pending','in_progress') AND deadline_at < NOW() RETURNING id");
  for (const r of rows) await q("UPDATE routine_notifications SET status='canceled' WHERE run_id=$1 AND status='pending'", [r.id]);
}

/** 텔레그램 버튼 누른 것 받기 (웹훅 없이 주기적으로 · 한 서버만) */
export async function pollButtons() {
  if (!telegramConnected()) return;
  // 최근 이틀 안에 버튼 달린 알림을 보낸 적이 있을 때만 물어봄
  const recent = await q1("SELECT 1 FROM routine_notifications WHERE status='sent' AND sent_at > NOW() - interval '2 days' LIMIT 1");
  if (!recent) return;
  const owner = process.env.RENDER ? "render" : "mac";
  const lease = await q1(
    `INSERT INTO settings (key, value) VALUES ('tg_poll', jsonb_build_object('until', (NOW() + interval '50 seconds')::text, 'owner', $1::text))
     ON CONFLICT (key) DO UPDATE SET value = settings.value || jsonb_build_object('until', (NOW() + interval '50 seconds')::text, 'owner', $1::text)
     WHERE (settings.value->>'until')::timestamptz < NOW() OR settings.value->>'owner' = $1 RETURNING key`,
    [owner],
  );
  if (!lease) return;
  const off = await q1<{ value: { offset?: number } }>("SELECT value FROM settings WHERE key='tg_poll'");
  const offset = Number(off?.value?.offset ?? 0);
  const { res, d } = await tg("getUpdates", { offset: offset ? offset + 1 : undefined, timeout: 0, allowed_updates: ["callback_query"] });
  if (!res.ok || !Array.isArray(d.result)) return;
  let last = offset;
  for (const u of d.result as { update_id: number; callback_query?: { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat?: { id: number } } } }[]) {
    last = Math.max(last, u.update_id);
    const cb = u.callback_query;
    if (!cb?.data) continue;
    // 내 채팅에서 누른 버튼만 처리
    if (String(cb.message?.chat?.id ?? cb.from?.id) !== process.env.TELEGRAM_CHAT_ID!.trim()) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "권한이 없어요." }).catch(() => {});
      continue;
    }
    const [act, runId] = cb.data.split(":");
    let text = "";
    try {
      if (act === "rd") {
        const r = await completeRun(runId);
        text = r.done ? "✅ 완료 처리했어요" : `아직 남았어요: ${r.missing.join(", ")}`;
        if (r.done && cb.message) await tg("editMessageReplyMarkup", { chat_id: cb.message.chat?.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        if (!r.done) await tg("sendMessage", { chat_id: process.env.TELEGRAM_CHAT_ID!.trim(), text: `아직 ${r.missing.join(", ")}이(가) 남아 있어요. 등록하면 자동으로 완료돼요.` }).catch(() => {});
      } else if (act === "rs") {
        text = (await snooze(runId, 30)) ? "⏰ 30분 뒤에 다시 알릴게요" : "마감이 가까워 더 미룰 수 없어요";
      }
    } catch (e) {
      text = (e as Error).message.slice(0, 180);
    }
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => {});
  }
  if (last !== offset) await q("UPDATE settings SET value = value || jsonb_build_object('offset', $1::bigint) WHERE key='tg_poll'", [last]);
}

/** 오늘의 업무 브리핑 (켜 둔 경우 하루 한 번, 개별 알림과 별도) */
export async function sendBriefing() {
  const p = await getPolicy();
  if (!p.briefingOn || !telegramConnected() || kstNowHM() < p.briefingTime) return;
  const today = kstToday();
  const claim = await q1(
    `INSERT INTO settings (key, value) VALUES ('briefing_sent', jsonb_build_object('day', $1::text))
     ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object('day', $1::text) WHERE settings.value->>'day' <> $1 RETURNING key`,
    [today],
  );
  if (!claim) return;
  const runs = await listRuns({ from: today, to: today });
  const { listTodos } = await import("./todos");
  const todos = await listTodos("today").catch(() => []);
  const lines = [`☀️ 오늘의 업무 (${today})`, "", `🔁 루틴 ${runs.length}개`, ...runs.map((r) => `· ${r.time} ${r.name}${r.status === "done" ? " ✔" : ""}`), "", `✅ 할 일 ${todos.length}개`, ...todos.slice(0, 10).map((t) => `· ${t.due_time ?? ""} ${t.title}`)];
  await tg("sendMessage", { chat_id: process.env.TELEGRAM_CHAT_ID!.trim(), text: lines.join("\n") }).catch(() => {});
}

/** 1분마다 (모든 서버, 중복은 DB 가 막음) */
export async function routineTick() {
  await ensureRuns();
  await markMissed();
  await sendDue();
  await sendBriefing().catch(() => {});
  await pollButtons().catch(() => {});
}

export async function notificationLog(limit = 50) {
  return q<{ id: string; kind: string; round: number; send_at: string; status: string; error: string | null; sent_at: string | null; name: string; run_date: string }>(
    `SELECT n.id, n.kind, n.round, n.send_at, n.status, n.error, n.sent_at, t.name, r.run_date FROM routine_notifications n
       JOIN routine_runs r ON r.id=n.run_id JOIN routines t ON t.id=r.routine_id
      WHERE n.status <> 'pending' OR n.send_at < NOW() + interval '1 day' ORDER BY n.send_at DESC LIMIT $1`,
    [limit],
  );
}
