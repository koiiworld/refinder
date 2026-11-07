import "server-only";
import { q } from "./db";
import { addEvent } from "./repo";
import { purgeSnaps, restoreSnaps, snapKindOf, snapToTrash, TRASH_DAYS } from "./trash-snap";

/** 휴지통에 30일 넘게 있던 것 자동 완전 삭제 (1시간마다) */
export async function purgeExpired() {
  const old = `deleted_at < NOW() - INTERVAL '${TRASH_DAYS} days'`;
  const ids = [
    ...(await q<{ id: string }>(`SELECT id FROM projects WHERE ${old}`)),
    ...(await q<{ id: string }>(`SELECT id FROM reel_projects WHERE ${old}`)),
    ...(await q<{ id: string }>(`SELECT id FROM edit_projects WHERE ${old}`)),
    ...(await q<{ id: string }>(`SELECT id FROM videos WHERE ${old}`)),
  ].map((r) => r.id);
  return (ids.length ? await purge(ids) : 0) + (await purgeSnaps("expired"));
}

/** 휴지통으로 옮기기 (대기 중인 AI 작업은 취소, 키워드는 그대로 '사용됨'으로 둠) */
// 릴스(reel_)·영상 편집(edit_)은 각자 표에서 deleted_at 으로
const MEDIA = [
  ["reel_", "reel_projects"],
  ["edit_", "edit_projects"],
  ["vid_", "videos"],
] as const;
const isOther = (i: string) => i.startsWith("tr_") || !!snapKindOf(i);
const split = (ids: string[]) => ({
  posts: ids.filter((i) => !MEDIA.some(([p]) => i.startsWith(p)) && !isOther(i)),
  media: MEDIA.map(([p, t]) => [t, ids.filter((i) => i.startsWith(p))] as const),
  snaps: ids.filter((i) => i.startsWith("tr_")),
  others: ids.filter((i) => !i.startsWith("tr_") && snapKindOf(i)),
});

export async function moveToTrash(all: string[]) {
  const { posts: ids, media, others } = split(all);
  let n = 0;
  for (const id of others) if (await snapToTrash(snapKindOf(id)!, id)) n++;
  for (const [t, m] of media) if (m.length) n += (await q(`UPDATE ${t} SET deleted_at=NOW() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id`, [m])).length;
  if (!ids.length) return n;
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id = ANY($1) AND status='queued'", [ids]);
  const r = await q<{ id: string }>("UPDATE projects SET deleted_at=NOW() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id", [ids]);
  for (const { id } of r) await addEvent(id, "trash", "휴지통으로 이동");
  return r.length + n;
}

/** 휴지통에서 되살리기 (진행 중이던 작업은 '이어서 다시 실행'으로 이어서 할 수 있음) */
export async function restoreFromTrash(all: string[]) {
  const { posts: ids, media, snaps } = split(all);
  let n = await restoreSnaps(snaps);
  for (const [t, m] of media) if (m.length) n += (await q(`UPDATE ${t} SET deleted_at=NULL, status = CASE WHEN status IN ('analyzing','rendering','working','running','queued') THEN 'error' ELSE status END WHERE id = ANY($1) AND deleted_at IS NOT NULL RETURNING id`, [m])).length;
  if (!ids.length) return n;
  const r = await q<{ id: string }>(
    `UPDATE projects SET deleted_at=NULL,
       status = CASE WHEN status='running' THEN 'error' ELSE status END,
       status_message = CASE WHEN status='running' THEN '휴지통에서 되살렸습니다. ''이어서 다시 실행''을 눌러 주세요.' ELSE status_message END
     WHERE id = ANY($1) AND deleted_at IS NOT NULL RETURNING id`,
    [ids],
  );
  for (const { id } of r) await addEvent(id, "restore", "휴지통에서 되살림");
  return r.length + n;
}

/** 완전 삭제 (휴지통에 있는 글만). 키워드는 다시 고를 수 있게 돌려놓음 */
export async function purge(arg: string[] | "all") {
  let n = await purgeSnaps(arg === "all" ? "all" : split(arg).snaps);
  const media = arg === "all" ? MEDIA.map(([, t]) => [t, null] as const) : split(arg).media;
  for (const [t, m] of media) {
    if (m && !m.length) continue;
    if (t === "videos") {
      const { deleteVideo } = await import("./videos");
      const vs = await q<{ id: string }>(m ? "SELECT id FROM videos WHERE id = ANY($1) AND deleted_at IS NOT NULL" : "SELECT id FROM videos WHERE deleted_at IS NOT NULL", m ? [m] : []);
      for (const v of vs) await deleteVideo(v.id);
      n += vs.length;
      continue;
    }
    n += (await q(m ? `DELETE FROM ${t} WHERE id = ANY($1) AND deleted_at IS NOT NULL RETURNING id` : `DELETE FROM ${t} WHERE deleted_at IS NOT NULL RETURNING id`, m ? [m] : [])).length;
  }
  const ids = arg === "all" ? "all" : split(arg).posts;
  if (ids !== "all" && !ids.length) return n;
  const rows = await q<{ id: string }>(
    ids === "all" ? "SELECT id FROM projects WHERE deleted_at IS NOT NULL" : "SELECT id FROM projects WHERE id = ANY($1) AND deleted_at IS NOT NULL",
    ids === "all" ? [] : [ids],
  );
  const del = rows.map((r) => r.id);
  if (!del.length) return n;
  await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id = ANY($1) AND status='queued'", [del]);
  await q("UPDATE keyword_picks SET status='new', project_id=NULL WHERE project_id = ANY($1)", [del]);
  await q("DELETE FROM projects WHERE id = ANY($1)", [del]);
  return del.length + n;
}
