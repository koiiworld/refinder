import { listBlogs, listIdeas } from "@/lib/repo";
import { q } from "@/lib/db";
import { naverConnected } from "@/lib/research";
import { connectionStatus } from "@/lib/ai/providers";
import ResearchLab from "./ResearchLab";

export const dynamic = "force-dynamic";

export default async function Research() {
  const [blogs, ideas, snapshots, jobs] = await Promise.all([
    listBlogs(),
    listIdeas(),
    q("SELECT * FROM research_snapshots ORDER BY collected_at DESC LIMIT 10"),
    q("SELECT id, blog_id, status, error, created_at FROM jobs WHERE type='suggest_ideas' ORDER BY created_at DESC LIMIT 5"),
  ]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>트렌드·키워드 연구소</h1>
          <p className="sub">블로그별 글감을 모으고, 실제 조회된 자료만 출처·수집일과 함께 저장합니다.</p>
        </div>
      </div>
      <ResearchLab
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color, category: b.category }))}
        ideas={JSON.parse(JSON.stringify(ideas))}
        snapshots={JSON.parse(JSON.stringify(snapshots))}
        jobs={JSON.parse(JSON.stringify(jobs))}
        naver={naverConnected()}
        aiConnected={connectionStatus().some((c) => c.connected && !c.media)}
      />
    </div>
  );
}
