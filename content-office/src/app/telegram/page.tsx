import { getPolicy, notificationLog } from "@/lib/routines";
import { telegramConnected } from "@/lib/todos";
import { tgCounts } from "@/lib/telegram";
import TelegramSetup from "./TelegramSetup";
import NotifyCard from "./NotifyCard";
import Mailbox from "./Mailbox";

export const dynamic = "force-dynamic";

export default async function TelegramPage() {
  const connected = telegramConnected();
  const [policy, log, counts] = await Promise.all([getPolicy(), notificationLog(50).catch(() => []), tgCounts().catch(() => ({ in: 0, out: 0, unread: 0 }))]);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>💬 텔레그램</h1>
          <p className="sub">텔레그램 연결, 알림 설정(방해 금지·아침 브리핑), 받은 메시지함·보낸 메시지함을 한곳에서 봐요. 루틴·할 일 알림은 브라우저를 닫아도 서버가 보내요.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <Mailbox connected={connected} initialCounts={counts} />
        <TelegramSetup connected={connected} hasToken={!!process.env.TELEGRAM_BOT_TOKEN?.trim()} />
        <NotifyCard connected={connected} bot="@Acontentofficebot" initial={policy} log={JSON.parse(JSON.stringify(log))} />
      </div>
    </div>
  );
}
