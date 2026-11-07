import "server-only";
import { q, q1, newId } from "./db";

/**
 * 💬 텔레그램 메시지함: 앱이 보낸 메시지(보낸 메시지함)와 봇에게 온 메시지·버튼(받은 메시지함)을 기록
 * - 보내기는 각 기능(루틴·할 일·브리핑·시험)에서, 받기는 루틴 1분 확인(getUpdates)에서
 */
export type TgMessage = { id: string; direction: "out" | "in"; kind: string; chat_id: string; chat_name: string; text: string; status: string; error: string | null; created_at: string };
export const TG_KIND: Record<string, string> = { routine: "🔁 루틴 알림", todo: "✅ 할 일 알림", briefing: "☀️ 업무 브리핑", test: "🧪 시험 메시지", manual: "✉️ 직접 보냄", reply: "↩️ 자동 답", text: "💬 메시지", button: "🔘 버튼 누름", other: "기타" };

export const tgBase = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/$/, "");

export async function logTg(m: { direction: "out" | "in"; kind: string; text: string; chatId?: string | number; chatName?: string; ok?: boolean; error?: string | null }) {
  await q("INSERT INTO telegram_messages (id, direction, kind, chat_id, chat_name, text, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    newId("tgm_"), m.direction, m.kind, String(m.chatId ?? process.env.TELEGRAM_CHAT_ID?.trim() ?? ""), (m.chatName ?? "").slice(0, 80), String(m.text ?? "").slice(0, 4000),
    m.direction === "in" ? "received" : m.ok === false ? "failed" : "sent", m.error ? String(m.error).slice(0, 300) : null,
  ]).catch(() => {});
}

export async function listTg(direction: "out" | "in", limit = 100) {
  return q<TgMessage>("SELECT * FROM telegram_messages WHERE direction=$1 ORDER BY created_at DESC LIMIT $2", [direction, Math.min(300, limit)]);
}
export async function tgCounts() {
  const r = await q1<{ out: number; inn: number; unread: number }>(
    `SELECT COUNT(*) FILTER (WHERE direction='out')::int AS out, COUNT(*) FILTER (WHERE direction='in')::int AS inn,
            COUNT(*) FILTER (WHERE direction='in' AND created_at > COALESCE((SELECT (value->>'at')::timestamptz FROM settings WHERE key='tg_inbox_seen'), 'epoch'))::int AS unread
     FROM telegram_messages`,
  );
  return { out: r?.out ?? 0, in: r?.inn ?? 0, unread: r?.unread ?? 0 };
}
export async function markInboxSeen() {
  await q("INSERT INTO settings (key, value) VALUES ('tg_inbox_seen', jsonb_build_object('at', NOW()::text)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
}

/** 내 채팅으로 직접 보내기 (텔레그램 탭에서 버튼을 눌렀을 때만) */
export async function sendManual(text: string) {
  const t = String(text ?? "").trim();
  if (!t) throw new Error("보낼 내용을 적어 주세요.");
  if (t.length > 2000) throw new Error("2000자 이하로 적어 주세요.");
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) throw new Error("텔레그램 봇 토큰과 채팅 ID를 먼저 넣어 주세요.");
  const res = await fetch(`${tgBase()}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: t, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  const ok = res.ok && d.ok !== false;
  await logTg({ direction: "out", kind: "manual", text: t, ok, error: ok ? null : `텔레그램 오류 ${res.status}: ${d.description ?? ""}` });
  if (!ok) throw new Error(`텔레그램 오류: ${d.description ?? res.status}`);
}
