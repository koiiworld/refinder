import { q } from "@/lib/db";
import TrashList, { type MediaTrashRow, type TrashRow } from "./TrashList";

export const dynamic = "force-dynamic";

export default async function Trash() {
  const rows = await q<TrashRow>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.deleted_at, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`,
  );
  const media = await q<MediaTrashRow>(
    `SELECT id, title, 'reel' AS kind, deleted_at FROM reel_projects WHERE deleted_at IS NOT NULL
     UNION ALL SELECT id, title, 'edit' AS kind, deleted_at FROM edit_projects WHERE deleted_at IS NOT NULL
     UNION ALL SELECT id, title, 'video' AS kind, deleted_at FROM videos WHERE deleted_at IS NOT NULL
     UNION ALL SELECT id, title, label AS kind, deleted_at FROM trash_items
     ORDER BY deleted_at DESC`,
  );
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>휴지통</h1>
          <p className="sub">지운 것은 모두 여기로 와요. 30일 안에 되살릴 수 있고, 30일이 지나면 자동으로 완전히 지워집니다. 여기서 바로 완전 삭제하면 되돌릴 수 없어요.</p>
        </div>
      </div>
      <TrashList rows={JSON.parse(JSON.stringify(rows))} media={JSON.parse(JSON.stringify(media))} />
    </div>
  );
}
