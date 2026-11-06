import Link from "next/link";
import { listBlogs } from "@/lib/repo";
import { monthEvents, CAT_LABEL } from "@/lib/calendar";
import { kstToday } from "@/lib/todos";
import CalendarView from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const today = kstToday();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const [events, blogs] = await Promise.all([monthEvents(ym), listBlogs()]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📅 캘린더</h1>
          <p className="sub">연간 시즌 행사, 공휴일·공식 행사, 비정기 행사, 콘텐츠 발행 일정, 업무 일정(할 일)을 한 곳에서 봐요. 일정을 누르면 날짜·참고 링크를 보고 &apos;아이디어로 저장&apos;할 수 있어요.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/ideas" className="btn btn-sm">💡 아이디어</Link>
          <Link href="/todos?tab=today" className="btn btn-sm">✅ 할 일</Link>
        </div>
      </div>
      <CalendarView ym={ym} today={today} events={JSON.parse(JSON.stringify(events))} labels={CAT_LABEL} blogs={blogs.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
