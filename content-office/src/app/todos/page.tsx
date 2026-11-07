import Link from "next/link";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { kstToday, listTodos, telegramConnected } from "@/lib/todos";
import TodoBoard from "./TodoBoard";
import TelegramSetup from "./TelegramSetup";
import { ensureRuns, listRuns } from "@/lib/routines";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "today", label: "오늘" },
  { id: "upcoming", label: "예정" },
  { id: "done", label: "완료" },
] as const;

export default async function Todos({ searchParams }: { searchParams: Promise<{ tab?: string; title?: string; blog?: string; memo?: string; idea?: string; date?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "today";
  const [items, blogs, posts, carousels, videos] = await Promise.all([
    listTodos(tab),
    listBlogs(),
    q<{ id: string; title: string; blog_id: string }>(
      "SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id FROM projects p LEFT JOIN documents d ON d.project_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 100",
    ),
    q<{ id: string; title: string }>("SELECT id, title FROM carousels ORDER BY updated_at DESC LIMIT 60"),
    q<{ id: string; title: string }>(
      "SELECT id, '🎬 ' || title AS title FROM (SELECT id, title, updated_at FROM studio_projects UNION ALL SELECT id, title, updated_at FROM videos WHERE kind <> 'edit' AND deleted_at IS NULL) x ORDER BY updated_at DESC LIMIT 60",
    ),
  ]);
  // 할 일 '오늘'에 당일 루틴도 함께 (루틴 관리와 같은 실행 항목)
  const routineRuns = tab === "today" ? await ensureRuns().then(() => listRuns({ from: kstToday(), to: kstToday() })).catch(() => []) : [];
  const prefill = sp.title || sp.idea ? { title: sp.title ?? "", blog_id: sp.blog ?? "", memo: sp.memo ?? "", idea_id: sp.idea ?? "", due_date: sp.date ?? "" } : null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>✅ 할 일</h1>
          <p className="sub">날짜·시간은 한국 시간이에요. 시간을 정하고 🔔을 켜면 그 시각에 텔레그램으로 알려 줘요 (앱을 닫아도 서버가 보내요).</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/ideas" className="btn btn-sm">💡 아이디어</Link>
          <Link href="/calendar" className="btn btn-sm">📅 달력</Link>
        </div>
      </div>
      <nav className="trend-tabs" aria-label="할 일 구분">
        {TABS.map((t) => (
          <Link key={t.id} href={`/todos?tab=${t.id}`} scroll={false} className={`trend-tab ${t.id === tab ? "on" : ""}`}>{t.label}</Link>
        ))}
      </nav>
      {routineRuns.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2 style={{ fontSize: 15 }}>🔁 오늘의 루틴</h2><Link href="/routines" className="tiny" style={{ color: "var(--accent)" }}>루틴 관리 →</Link></div>
          <div className="list">
            {routineRuns.map((r) => (
              <Link key={r.id} href={`/routines/run/${r.id}`} className="list-item routine-row">
                <span className={`routine-dot ${r.status}`}>{r.status === "done" ? "✓" : ""}</span>
                <span className="small" style={{ flex: 1 }}>{r.time} · {r.name}</span>
                <span className={`badge ${r.status === "done" ? "badge-ok" : r.status === "missed" ? "badge-bad" : r.status === "in_progress" ? "badge-warn" : ""}`}>{{ pending: "예정", in_progress: "진행 중", done: "완료", missed: "미수집" }[r.status]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div style={{ marginBottom: 16 }}><TelegramSetup connected={telegramConnected()} hasToken={!!process.env.TELEGRAM_BOT_TOKEN?.trim()} /></div>
      <TodoBoard
        key={tab}
        tab={tab}
        today={kstToday()}
        initial={JSON.parse(JSON.stringify(items))}
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
        posts={posts}
        refs={{ insta: carousels, youtube: videos }}
        telegram={telegramConnected()}
        prefill={prefill}
      />
    </div>
  );
}
