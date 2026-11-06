import { listBlogs } from "@/lib/repo";
import { ensureWorker } from "@/lib/jobs";
import { WORK_COLS, WORK_TYPES, workItems } from "@/lib/work";
import AutoRefresh from "../posts/AutoRefresh";
import WorkBoard from "./WorkBoard";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  ensureWorker();
  const [items, blogs] = await Promise.all([workItems(), listBlogs()]);
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      {items.some((i) => i.running) && <AutoRefresh seconds={6} />}
      <div className="page-head">
        <div>
          <h1>📊 전체 작업 현황</h1>
          <p className="sub">블로그 글·캐러셀·영상을 기획 → 제작 중 → 검토 → 발행 대기 → 완료로 한 번에 봐요. 카드를 누르면 자세히 보이고, 캐러셀·영상은 올린 뒤 &apos;게시함&apos;을 눌러 주세요.</p>
        </div>
      </div>
      <WorkBoard items={JSON.parse(JSON.stringify(items))} cols={WORK_COLS} types={WORK_TYPES} blogs={blogs.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
