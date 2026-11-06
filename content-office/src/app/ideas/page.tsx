import Link from "next/link";
import { listBlogs } from "@/lib/repo";
import { listIdeasNotes } from "@/lib/ideas";
import IdeaBoard from "./IdeaBoard";

export const dynamic = "force-dynamic";

export default async function Ideas({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  const [ideas, blogs] = await Promise.all([listIdeasNotes(), listBlogs()]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>💡 아이디어 노트</h1>
          <p className="sub">떠오른 글감을 한 줄로 바로 적어 두세요. 저장만으로는 AI가 돌지 않아요(비용 없음). 구체화할 때 &apos;할 일 만들기&apos; 또는 &apos;글 기획으로 보내기&apos;를 누르세요.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/todos?tab=today" className="btn btn-sm">✅ 할 일</Link>
          <Link href="/calendar" className="btn btn-sm">📅 달력</Link>
        </div>
      </div>
      <IdeaBoard initial={JSON.parse(JSON.stringify(ideas))} blogs={blogs.map((b) => ({ id: b.id, name: b.name }))} openId={sp.open ?? null} />
    </div>
  );
}
