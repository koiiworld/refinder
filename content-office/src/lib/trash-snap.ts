import "server-only";
import { q, q1, newId, j } from "./db";

/**
 * 🗑 휴지통 (나머지 항목용): 지울 때 그 줄(+딸린 기록)을 통째로 trash_items 에 보관하고 원래 표에서 뺌
 * → 되살리면 그대로 다시 넣음 · 30일이 지나면 자동으로 완전 삭제
 * (글·릴스·영상 편집·영상공장 영상은 각자 표의 deleted_at 으로 따로 처리)
 */
export const SNAP_KINDS = {
  studio: { table: "studio_projects", label: "🎬 영상 스튜디오", children: [] as [string, string][] },
  series: { table: "studio_series", label: "📺 시리즈", children: [] },
  carousel: { table: "carousels", label: "🖼 캐러셀", children: [] },
  idea: { table: "ideas_notes", label: "💡 아이디어", children: [] },
  todo: { table: "todos", label: "✅ 할 일", children: [] },
  routine: { table: "routines", label: "🔁 루틴", children: [["routine_runs", "routine_id"]] },
  repurpose: { table: "repurpose_docs", label: "🔀 채널 변환", children: [] },
  study: { table: "study_reels", label: "🔍 릴스 분석", children: [] },
  calendar: { table: "calendar_events", label: "📅 캘린더 일정", children: [] },
  sample: { table: "blog_samples", label: "✍️ 문체 샘플", children: [] },
} as const;
export type SnapKind = keyof typeof SNAP_KINDS;
const PREFIX: [string, SnapKind][] = [["std_", "studio"], ["ser_", "series"], ["car_", "carousel"], ["idea_", "idea"], ["todo_", "todo"], ["rt_", "routine"], ["rp_", "repurpose"], ["study_", "study"], ["cal_", "calendar"], ["smp_", "sample"]];
export const snapKindOf = (id: string) => PREFIX.find(([p]) => id.startsWith(p))?.[1] ?? null;
export const TRASH_DAYS = 30;

type Row = Record<string, unknown>;
const titleOf = (r: Row) => String(r.title || r.name || r.memo || r.filename || r.url || r.id || "").replace(/\s+/g, " ").slice(0, 120);

/** 휴지통으로 (원래 표에서는 빠짐). 없으면 false */
export async function snapToTrash(kind: SnapKind, id: string) {
  const k = SNAP_KINDS[kind];
  const main = await q1<{ r: Row }>(`SELECT to_jsonb(t) AS r FROM ${k.table} t WHERE id=$1`, [id]);
  if (!main) return false;
  const rows: { table: string; row: Row }[] = [{ table: k.table, row: main.r }];
  for (const [table, fk] of k.children) for (const c of await q<{ r: Row }>(`SELECT to_jsonb(t) AS r FROM ${table} t WHERE ${fk}=$1`, [id])) rows.push({ table, row: c.r });
  await q("INSERT INTO trash_items (id, kind, ref_id, title, label, rows) VALUES ($1,$2,$3,$4,$5,$6)", [newId("tr_"), kind, id, titleOf(main.r), k.label, j(rows)]);
  await q(`DELETE FROM ${k.table} WHERE id=$1`, [id]);
  return true;
}

export async function restoreSnaps(ids: string[]) {
  if (!ids.length) return 0;
  const items = await q<{ id: string; kind: SnapKind; ref_id: string; rows: { table: string; row: Row }[] }>("SELECT id, kind, ref_id, rows FROM trash_items WHERE id = ANY($1)", [ids]);
  for (const it of items) {
    for (const { table, row } of it.rows) {
      if (!Object.values(SNAP_KINDS).some((k) => k.table === table || k.children.some(([c]) => c === table))) continue;
      await q(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1) ON CONFLICT (id) DO NOTHING`, [j(row)]);
    }
    if (it.kind === "todo") await import("./todos").then((m) => m.reschedule(it.ref_id)).catch(() => {});
    await q("DELETE FROM trash_items WHERE id=$1", [it.id]);
  }
  return items.length;
}

export async function purgeSnaps(ids: string[] | "all" | "expired") {
  const r =
    ids === "all"
      ? await q("DELETE FROM trash_items RETURNING id")
      : ids === "expired"
        ? await q(`DELETE FROM trash_items WHERE deleted_at < NOW() - INTERVAL '${TRASH_DAYS} days' RETURNING id`)
        : ids.length
          ? await q("DELETE FROM trash_items WHERE id = ANY($1) RETURNING id", [ids])
          : [];
  return r.length;
}
