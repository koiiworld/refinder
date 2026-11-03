import Link from "next/link";
import { q } from "@/lib/db";
import { stageDef } from "@/lib/stages";
import { seasonEvents } from "@/lib/seasons";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; stage: string; scheduled_date: string; blog_color: string; blog_name: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST 기준
  const [y, m] = (sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : now.toISOString().slice(0, 7)).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startOffset = first.getUTCDay();
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - startOffset));
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86400000).toISOString().slice(0, 10));
  const rows = await q<Row>(
    `SELECT p.id, p.title, p.stage, p.scheduled_date, b.color AS blog_color, b.name AS blog_name
     FROM projects p JOIN blogs b ON b.id=p.blog_id
     WHERE p.scheduled_date BETWEEN $1 AND $2 AND p.stage <> 'rejected' ORDER BY p.scheduled_date`,
    [days[0], days[41]],
  );
  const unscheduled = await q<{ id: string; title: string; stage: string }>(
    "SELECT id, title, stage FROM projects WHERE scheduled_date IS NULL AND stage NOT IN ('done','rejected') ORDER BY updated_at DESC LIMIT 10",
  );
  const ym = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm - 1, 1));
    return d.toISOString().slice(0, 7);
  };
  const today = now.toISOString().slice(0, 10);
  const seasons = [...seasonEvents(y - 1), ...seasonEvents(y), ...seasonEvents(y + 1)];
  const monthStr = `${y}-${String(m).padStart(2, "0")}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>콘텐츠 캘린더</h1>
          <p className="sub">프로젝트의 발행 예정일 기준 · 🗓 표시는 마케팅 달력의 시즌 이벤트</p>
        </div>
        <div className="row">
          <Link className="btn btn-sm" href={`/calendar?m=${ym(y, m - 1)}`}>◀</Link>
          <span className="strong" style={{ minWidth: 90, textAlign: "center" }}>{y}년 {m}월</span>
          <Link className="btn btn-sm" href={`/calendar?m=${ym(y, m + 1)}`}>▶</Link>
          <Link className="btn btn-sm" href="/calendar">오늘</Link>
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="cal">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d} className="cal-h">{d}</div>)}
          {days.map((d) => (
            <div key={d} className={`cal-d ${d.slice(0, 7) !== monthStr ? "out" : ""} ${d === today ? "today" : ""}`}>
              <span className="cal-n">{Number(d.slice(8))}</span>
              {seasons.filter((s) => s.start === d).map((s) => (
                <Link key={s.key + s.start} href="/marketing" className="cal-ev" style={{ borderLeftColor: "var(--warn)", background: "transparent", color: "var(--muted)" }} title={`마케팅 달력: ${s.name}`}>
                  🗓 {s.name}
                </Link>
              ))}
              {rows.filter((r) => r.scheduled_date === d).map((r) => (
                <Link key={r.id} href={`/projects/${r.id}`} className="cal-ev" style={{ borderLeftColor: r.blog_color }} title={`${r.blog_name} · ${r.title} (${stageDef(r.stage).label})`}>
                  {r.stage === "done" ? "✓ " : ""}{r.title}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!!unscheduled.length && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>발행일 미지정 프로젝트</h2></div>
          <div className="list">
            {unscheduled.map((u) => (
              <Link key={u.id} href={`/projects/${u.id}`} className="list-item">
                <span className="ellipsis" style={{ flex: 1 }}>{u.title}</span>
                <span className="small muted">{stageDef(u.stage).label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
