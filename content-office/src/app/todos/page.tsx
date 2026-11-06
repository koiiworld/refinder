import Link from "next/link";
import { q } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { kstToday, listTodos, telegramConnected } from "@/lib/todos";
import TodoBoard from "./TodoBoard";
import TelegramSetup from "./TelegramSetup";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "today", label: "오늘" },
  { id: "upcoming", label: "예정" },
  { id: "done", label: "완료" },
] as const;

export default async function Todos({ searchParams }: { searchParams: Promise<{ tab?: string; title?: string; blog?: string; memo?: string; idea?: string; date?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "today";
  const [items, blogs, posts] = await Promise.all([
    listTodos(tab),
    listBlogs(),
    q<{ id: string; title: string; blog_id: string }>(
      "SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.blog_id FROM projects p LEFT JOIN documents d ON d.project_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 100",
    ),
  ]);
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
      <div style={{ marginBottom: 16 }}><TelegramSetup connected={telegramConnected()} hasToken={!!process.env.TELEGRAM_BOT_TOKEN?.trim()} /></div>
      <TodoBoard
        key={tab}
        tab={tab}
        today={kstToday()}
        initial={JSON.parse(JSON.stringify(items))}
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
        posts={posts}
        telegram={telegramConnected()}
        prefill={prefill}
      />
    </div>
  );
}
