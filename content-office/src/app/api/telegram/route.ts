import { body, fail, handle, ok } from "@/lib/api";
import { findTelegramChats, sendTelegramTest, telegramConnected } from "@/lib/todos";

export async function GET() {
  return handle(async () => ok({ connected: telegramConnected(), hasToken: !!process.env.TELEGRAM_BOT_TOKEN?.trim() }));
}

/** action: find_chat (채팅 ID 찾기, 메시지 안 보냄) · test (시험 메시지 1건) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?: string }>(req);
    try {
      if (b.action === "find_chat") return ok(await findTelegramChats());
      if (b.action === "test") {
        await sendTelegramTest();
        return ok({ ok: true });
      }
      return fail("알 수 없는 작업입니다.");
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
