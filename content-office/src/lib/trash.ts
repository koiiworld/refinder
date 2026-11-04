import "server-only";
import { q } from "./db";
import { addEvent } from "./repo";

/** 휴지통으로 옮기기 (대기 중인 AI 작업은 취소, 키워드는 그대로 '사용됨'으로 둠) */
export async function moveToTrash(ids: string[]) {
  if (!ids.length) return 0;
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id = ANY($1) AND status='queued'", [ids]);
  const r = await q<{ id: string }>("UPDATE projects SET deleted_at=NOW() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id", [ids]);
  for (const { id } of r) await addEvent(id, "trash", "휴지통으로 이동");
  return r.length;
}

/** 휴지통에서 되살리기 (진행 중이던 작업은 '이어서 다시 실행'으로 이어서 할 수 있음) */
export async function restoreFromTrash(ids: string[]) {
  if (!ids.length) return 0;
  const r = await q<{ id: string }>(
    `UPDATE projects SET deleted_at=NULL,
       status = CASE WHEN status='running' THEN 'error' ELSE status END,
       status_message = CASE WHEN status='running' THEN '휴지통에서 되살렸습니다. ''이어서 다시 실행''을 눌러 주세요.' ELSE status_message END
     WHERE id = ANY($1) AND deleted_at IS NOT NULL RETURNING id`,
    [ids],
  );
  for (const { id } of r) await addEvent(id, "restore", "휴지통에서 되살림");
  return r.length;
}

/** 완전 삭제 (휴지통에 있는 글만). 키워드는 다시 고를 수 있게 돌려놓음 */
export async function purge(ids: string[] | "all") {
  const rows = await q<{ id: string }>(
    ids === "all" ? "SELECT id FROM projects WHERE deleted_at IS NOT NULL" : "SELECT id FROM projects WHERE id = ANY($1) AND deleted_at IS NOT NULL",
    ids === "all" ? [] : [ids],
  );
  const del = rows.map((r) => r.id);
  if (!del.length) return 0;
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id = ANY($1) AND status='queued'", [del]);
  await q("UPDATE keyword_picks SET status='new', project_id=NULL WHERE project_id = ANY($1)", [del]);
  await q("DELETE FROM projects WHERE id = ANY($1)", [del]);
  return del.length;
}
