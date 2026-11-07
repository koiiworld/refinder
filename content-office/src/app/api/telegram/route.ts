import { body, fail, handle, ok } from "@/lib/api";
import { findTelegramChats, sendTelegramTest, telegramConnected } from "@/lib/todos";
import { listTg, markInboxSeen, sendManual, tgCounts } from "@/lib/telegram";

/** ?box=in|out → 메시지함 · 없으면 연결 상태 */
export async function GET(req: Request) {
  return handle(async () => {
    const box = new URL(req.url).searchParams.get("box");
    if (box === "in" || box === "out") {
      const list = await listTg(box);
      const counts = await tgCounts();
      if (box === "in") await markInboxSeen();
      return ok({ list, counts });
    }
    return ok({ connected: telegramConnected(), hasToken: !!process.env.TELEGRAM_BOT_TOKEN?.trim(), counts: await tgCounts() });
  });
}

/** action: find_chat (채팅 ID 찾기, 메시지 안 보냄) · test (시험 메시지 1건) · send {text} (직접 보내기, 누를 때만) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?: string; text?: string }>(req);
    try {
      if (b.action === "find_chat") return ok(await findTelegramChats());
      if (b.action === "test") {
        await sendTelegramTest();
        return ok({ ok: true });
      }
      if (b.action === "send") {
        await sendManual(String(b.text ?? ""));
        return ok({ ok: true });
      }
      return fail("알 수 없는 작업입니다.");
    } catch (e) {
      const m = (e as Error).message;
      return fail(m, /적어 주세요|이하로|먼저 넣어/.test(m) ? 400 : 502);
    }
  });
}
