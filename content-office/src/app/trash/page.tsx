import { q } from "@/lib/db";
import TrashList, { type TrashRow } from "./TrashList";

export const dynamic = "force-dynamic";

export default async function Trash() {
  const rows = await q<TrashRow>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.deleted_at, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`,
  );
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>휴지통</h1>
          <p className="sub">진행 현황에서 삭제한 글이 여기 모입니다. 되살리거나, 여기서 삭제하면 완전히 지워집니다(되돌릴 수 없음).</p>
        </div>
      </div>
      <TrashList rows={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
