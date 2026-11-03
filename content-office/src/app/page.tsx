import { listBlogs } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import { naverAdConnected } from "@/lib/searchad";
import { naverConnected } from "@/lib/research";
import { youtubeConnected } from "@/lib/youtube";
import KeywordStep from "./KeywordStep";

export const dynamic = "force-dynamic";

export default async function Home() {
  const blogs = await listBlogs();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>글 만들기</h1>
          <p className="sub">① AI가 블로그별 키워드를 추천하면 → ② 쓸 키워드만 고르세요. 그다음 제목·글·검수는 자동으로 진행됩니다.</p>
        </div>
      </div>
      <KeywordStep
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color, category: b.category }))}
        sources={{
          ai: connectionStatus().some((c) => c.connected && !c.media),
          naverAd: naverAdConnected(),
          datalab: naverConnected(),
          youtube: youtubeConnected(),
        }}
      />
    </div>
  );
}
