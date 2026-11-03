import { listBlogs } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import MarketingCalendar from "./MarketingCalendar";
import { naverAdConnected } from "@/lib/searchad";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const blogs = await listBlogs();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>마케팅 달력</h1>
          <p className="sub">시즌·기념일·쇼핑 이벤트에 맞춰 미리 준비할 글감과 키워드를 뽑습니다. 검색량 수치는 실제 데이터 연결 전까지 표시하지 않습니다.</p>
        </div>
      </div>
      <MarketingCalendar
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color, category: b.category }))}
        today={today}
        connections={connectionStatus().filter((c) => !c.media)}
        naverAd={naverAdConnected()}
      />
    </div>
  );
}
