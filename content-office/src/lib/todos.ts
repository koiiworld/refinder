import "server-only";
import { q, q1, newId } from "./db";
import { AiError } from "./ai/providers";

/**
 * ✅ 할 일 + 🔔 텔레그램 알림
 * - 날짜·시간은 한국 시간 기준 문자열(YYYY-MM-DD, HH:MM)로 저장
 * - 알림: 시간을 정하고 알림을 켜면 서버 작업 큐에 예약(run_after) → 웹앱을 닫아도 발송
 * - 시간 변경 = 기존 예약 취소 후 새로 예약, 완료·삭제·알림 끄기 = 예약 취소
 * - 중복 방지: 발송 전에 예약을 'sending'으로 한 번만 가져감. 응답이 불확실한 실패는 다시 보내지 않음
 */

export const TODO_CATEGORIES = [
  { id: "insta", label: "인스타", icon: "📱" },
  { id: "youtube", label: "유튜브", icon: "🎬" },
  { id: "blog", label: "블로그", icon: "📝" },
  { id: "personal", label: "개인일정", icon: "🙋" },
] as const;
export type TodoCategory = (typeof TODO_CATEGORIES)[number]["id"];
/** 예전 할 일(업무내용 없음): 블로그가 있으면 블로그, 없으면 개인일정 */
export const categoryOf = (t: { category?: string | null; blog_id?: string | null }): TodoCategory =>
  (TODO_CATEGORIES.some((c) => c.id === t.category) ? t.category : t.blog_id ? "blog" : "personal") as TodoCategory;

export type Todo = {
  id: string;
  title: string;
  category: string;
  ref_id: string | null;
  ref_title?: string | null;
  due_date: string;
  due_time: string | null;
  blog_id: string | null;
  project_id: string | null;
  idea_id: string | null;
  memo: string;
  notify: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  blog_name?: string | null;
  project_title?: string | null;
  notice?: { status: string; send_at: string; error: string | null; sent_at: string | null } | null;
};

export function kstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
/** 한국 날짜 + 시간 → 실제 시각 */
export function kstToDate(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`);
}
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
const isTime = (s: unknown) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function telegramConnected() {
  return !!(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}
const tgBase = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/$/, "");

export async function listTodos(tab: "today" | "upcoming" | "done") {
  const today = kstToday();
  const where = tab === "done" ? "t.done_at IS NOT NULL" : tab === "today" ? "t.done_at IS NULL AND t.due_date <= $1" : "t.done_at IS NULL AND t.due_date > $1";
  const order = tab === "done" ? "t.done_at DESC" : "t.due_date, t.due_time NULLS LAST, t.created_at";
  return q<Todo>(
    `SELECT t.*, b.name AS blog_name, COALESCE(NULLIF(d.title,''), p.title) AS project_title,
       COALESCE((SELECT c.title FROM carousels c WHERE c.id=t.ref_id), (SELECT s.title FROM studio_projects s WHERE s.id=t.ref_id), (SELECT v.title FROM videos v WHERE v.id=t.ref_id)) AS ref_title,
       (SELECT json_build_object('status', n.status, 'send_at', n.send_at, 'error', n.error, 'sent_at', n.sent_at)
          FROM todo_notifications n WHERE n.todo_id = t.id ORDER BY n.created_at DESC LIMIT 1) AS notice
     FROM todos t LEFT JOIN blogs b ON b.id=t.blog_id LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN documents d ON d.project_id=t.project_id
     WHERE ${where} ORDER BY ${order} LIMIT 300`,
    tab === "done" ? [] : [today],
  );
}

export async function todayCount() {
  const r = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM todos WHERE done_at IS NULL AND due_date <= $1", [kstToday()]);
  return Number(r?.n ?? 0);
}

export async function getTodo(id: string) {
  return q1<Todo>("SELECT * FROM todos WHERE id=$1", [id]);
}

type Input = { title?: string; due_date?: string; due_time?: string | null; category?: string; ref_id?: string | null; blog_id?: string | null; project_id?: string | null; idea_id?: string | null; memo?: string; notify?: boolean };

function clean(input: Input, cur?: Todo) {
  const title = String(input.title ?? cur?.title ?? "").trim().slice(0, 200);
  if (!title) throw new Error("할 일 이름을 적어 주세요.");
  const due_date = input.due_date ?? cur?.due_date ?? kstToday();
  if (!isDate(due_date)) throw new Error("날짜를 확인해 주세요.");
  const rawTime = input.due_time === undefined ? cur?.due_time ?? null : input.due_time;
  const due_time = rawTime ? String(rawTime).slice(0, 5) : null;
  if (due_time && !isTime(due_time)) throw new Error("시간을 확인해 주세요 (예: 09:30).");
  const notify = (input.notify ?? cur?.notify ?? false) && !!due_time;
  const blogIn = input.blog_id === undefined ? cur?.blog_id ?? null : input.blog_id || null;
  const category = categoryOf({ category: input.category ?? cur?.category, blog_id: blogIn });
  // 업무내용에 맞는 연결만 남김: 블로그 → 블로그·글, 인스타·유튜브 → 캐러셀·영상, 개인일정 → 없음
  const isBlog = category === "blog";
  const refIn = input.ref_id === undefined ? cur?.ref_id ?? null : input.ref_id || null;
  return {
    title,
    due_date,
    due_time,
    category,
    ref_id: category === "insta" || category === "youtube" ? refIn : null,
    blog_id: isBlog ? blogIn : null,
    project_id: isBlog ? (input.project_id === undefined ? cur?.project_id ?? null : input.project_id || null) : null,
    idea_id: input.idea_id === undefined ? cur?.idea_id ?? null : input.idea_id || null,
    memo: String(input.memo ?? cur?.memo ?? "").slice(0, 1000),
    notify,
  };
}

export async function createTodo(input: Input) {
  const v = clean(input);
  const id = newId("todo_");
  await q(
    "INSERT INTO todos (id, title, due_date, due_time, blog_id, project_id, idea_id, memo, notify, category, ref_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [id, v.title, v.due_date, v.due_time, v.blog_id, v.project_id, v.idea_id, v.memo, v.notify, v.category, v.ref_id],
  );
  await reschedule(id);
  return getTodo(id);
}

export async function updateTodo(id: string, input: Input & { done?: boolean }) {
  const cur = await getTodo(id);
  if (!cur) throw new Error("할 일을 찾을 수 없습니다.");
  const v = clean(input, cur);
  const done = input.done === undefined ? !!cur.done_at : !!input.done;
  await q(
    `UPDATE todos SET title=$2, due_date=$3, due_time=$4, blog_id=$5, project_id=$6, idea_id=$7, memo=$8, notify=$9,
       done_at = CASE WHEN $10 THEN COALESCE(done_at, NOW()) ELSE NULL END, category=$11, ref_id=$12, updated_at=NOW() WHERE id=$1`,
    [id, v.title, v.due_date, v.due_time, v.blog_id, v.project_id, v.idea_id, v.memo, v.notify, done, v.category, v.ref_id],
  );
  await reschedule(id);
  return getTodo(id);
}

export async function deleteTodo(id: string) {
  await cancelPending(id);
  // 바로 지우지 않고 휴지통으로 (30일 뒤 자동 완전 삭제)
  await (await import("./trash-snap")).snapToTrash("todo", id);
}

async function cancelPending(todoId: string) {
  await q("UPDATE todo_notifications SET status='canceled' WHERE todo_id=$1 AND status='pending'", [todoId]);
}

/** 지금 상태에 맞게 예약 정리: 같은 시각 예약이 이미 있으면 그대로, 아니면 취소 후 새로 */
export async function reschedule(todoId: string) {
  const t = await getTodo(todoId);
  if (!t) return cancelPending(todoId);
  const want = t.notify && t.due_time && !t.done_at ? kstToDate(t.due_date, t.due_time) : null;
  const pending = await q1<{ id: string; send_at: string }>("SELECT id, send_at FROM todo_notifications WHERE todo_id=$1 AND status='pending'", [todoId]);
  if (pending && want && new Date(pending.send_at).getTime() === want.getTime()) return;
  await cancelPending(todoId);
  if (!want) return;
  // 이미 지난 시각(1분 넘게)은 예약하지 않음
  if (want.getTime() < Date.now() - 60_000) return;
  const nid = newId("ntf_");
  await q("INSERT INTO todo_notifications (id, todo_id, send_at) VALUES ($1,$2,$3)", [nid, todoId, want.toISOString()]);
  const { enqueue } = await import("./jobs");
  await enqueue("todo_notify", { payload: { notificationId: nid }, maxAttempts: 4, runAfter: want });
}

/** 작업: 예약된 알림 보내기 */
export async function sendTodoNotification(notificationId: string) {
  // 이 서버에 텔레그램 키가 없으면 건드리지 않고 키가 있는 서버(Render 등)에 넘김 — 2분 뒤 다시 대기열로
  // (6시간 넘게 아무 서버도 못 보냈으면 그때 실패 처리)
  if (!telegramConnected()) {
    const old = await q1<{ id: string }>("UPDATE todo_notifications SET status='failed', error=$2 WHERE id=$1 AND status='pending' AND send_at < NOW() - interval '6 hours' RETURNING id", [notificationId, "6시간 동안 텔레그램 키가 있는 서버가 없어 못 보냈어요 (설정에서 봇 토큰·채팅 ID)"]);
    if (old) return;
    const still = await q1<{ id: string }>("SELECT id FROM todo_notifications WHERE id=$1 AND status='pending'", [notificationId]);
    if (!still) return;
    const { enqueue } = await import("./jobs");
    await enqueue("todo_notify", { payload: { notificationId }, maxAttempts: 4, runAfter: new Date(Date.now() + 2 * 60_000) });
    return;
  }
  // 한 번만 가져감 (다른 서버·재시도가 같은 알림을 또 보내지 않게)
  const n = await q1<{ id: string; todo_id: string; send_at: string; attempts: number }>(
    "UPDATE todo_notifications SET status='sending', attempts=attempts+1 WHERE id=$1 AND status='pending' RETURNING id, todo_id, send_at, attempts",
    [notificationId],
  );
  if (!n) return; // 취소됐거나 이미 보냄
  const t = await getTodo(n.todo_id);
  if (!t || t.done_at || !t.notify || !t.due_time || kstToDate(t.due_date, t.due_time).getTime() !== new Date(n.send_at).getTime()) {
    await q("UPDATE todo_notifications SET status='canceled' WHERE id=$1", [n.id]);
    return;
  }
  if (!telegramConnected()) {
    await q("UPDATE todo_notifications SET status='failed', error=$2 WHERE id=$1", [n.id, "텔레그램이 연결되지 않았어요 (설정에서 봇 토큰·채팅 ID)"]);
    return;
  }
  const blog = t.blog_id ? await q1<{ name: string }>("SELECT name FROM blogs WHERE id=$1", [t.blog_id]) : null;
  const cat = TODO_CATEGORIES.find((c) => c.id === categoryOf(t));
  const text = `🚨 할 일 알림 · ${t.due_time}\n${t.title}\n${cat ? `${cat.icon} ${cat.label}` : ""}${blog ? ` · ${blog.name}` : ""}${t.memo ? `\n${t.memo}` : ""}`;
  let res: Response;
  try {
    res = await fetch(`${tgBase()}/bot${process.env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID!.trim(), text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // 응답을 못 받음 → 이미 갔을 수도 있어 다시 보내지 않음 (중복 방지)
    await q("UPDATE todo_notifications SET status='failed', error=$2 WHERE id=$1", [n.id, `응답 없음(이미 발송됐을 수 있어 다시 보내지 않음): ${(e as Error).message}`.slice(0, 300)]);
    return;
  }
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  await (await import("./telegram")).logTg({ direction: "out", kind: "todo", text, ok: res.ok && d.ok !== false, error: res.ok && d.ok !== false ? null : `텔레그램 오류 ${res.status}: ${d.description ?? ""}` });
  if (res.ok && d.ok !== false) {
    await q("UPDATE todo_notifications SET status='sent', sent_at=NOW(), error=NULL WHERE id=$1", [n.id]);
    return;
  }
  // 텔레그램이 거절(확실히 안 보내짐): 일시 오류면 다시 대기로 돌려 재시도
  const retry = res.status === 429 || res.status >= 500;
  await q("UPDATE todo_notifications SET status=$2, error=$3 WHERE id=$1", [n.id, retry && n.attempts < 4 ? "pending" : "failed", `텔레그램 오류 ${res.status}: ${d.description ?? ""}`.slice(0, 300)]);
  if (retry && n.attempts < 4) throw new AiError(`텔레그램 일시 오류 ${res.status}`, true, res.status);
}

/** 설정 도우미: 봇에게 말을 건 채팅 ID 찾기 (메시지 보내지 않음) */
export async function findTelegramChats() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("먼저 TELEGRAM_BOT_TOKEN 을 넣어 주세요.");
  // 이 토큰이 어느 봇 것인지 (메시지 보내지 않음)
  const me = (await (await fetch(`${tgBase()}/bot${token}/getMe`, { signal: AbortSignal.timeout(15_000) })).json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string; first_name?: string } };
  const bot = me.ok && me.result ? { username: me.result.username ?? "", name: me.result.first_name ?? "" } : null;
  const res = await fetch(`${tgBase()}/bot${token}/getUpdates`, { signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message?: { chat?: { id: number; first_name?: string; title?: string; username?: string } } }[]; description?: string };
  if (!res.ok || !d.ok) throw new Error(`텔레그램 오류: ${d.description ?? res.status}`);
  const seen = new Map<number, string>();
  for (const u of d.result ?? []) {
    const c = u.message?.chat;
    if (c) seen.set(c.id, c.title || c.first_name || c.username || String(c.id));
  }
  // 이미 받은 메시지함에 들어온 채팅도 (1분 확인이 먼저 가져갔을 수 있음)
  for (const r of await q<{ chat_id: string; chat_name: string }>("SELECT DISTINCT ON (chat_id) chat_id, chat_name FROM telegram_messages WHERE direction='in' AND chat_id <> '' ORDER BY chat_id, created_at DESC LIMIT 20").catch(() => [])) {
    const idn = Number(r.chat_id);
    if (Number.isFinite(idn) && !seen.has(idn)) seen.set(idn, r.chat_name.replace(" (내 채팅 아님)", "") || r.chat_id);
  }
  return { bot, chats: [...seen.entries()].map(([id, name]) => ({ id: String(id), name })) };
}

/** 설정 도우미: 시험 메시지 (사용자가 버튼을 눌렀을 때만) */
export async function sendTelegramTest() {
  if (!telegramConnected()) throw new Error("텔레그램 봇 토큰과 채팅 ID를 먼저 넣어 주세요.");
  const res = await fetch(`${tgBase()}/bot${process.env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID!.trim(), text: "✅ AI 콘텐츠 오피스 알림 연결 확인" }),
    signal: AbortSignal.timeout(15_000),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  await (await import("./telegram")).logTg({ direction: "out", kind: "test", text: "✅ AI 콘텐츠 오피스 알림 연결 확인", ok: res.ok && d.ok !== false, error: res.ok && d.ok !== false ? null : `텔레그램 오류 ${res.status}: ${d.description ?? ""}` });
  if (!res.ok || d.ok === false) throw new Error(`텔레그램 오류: ${d.description ?? res.status}`);
}
