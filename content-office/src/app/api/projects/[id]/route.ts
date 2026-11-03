import { q, j } from "@/lib/db";
import { projectBundle } from "@/lib/bundle";
import { ensureWorker } from "@/lib/jobs";
import { getProject, addEvent } from "@/lib/repo";
import { fetchUrlMeta } from "@/lib/research";
import type { Source } from "@/lib/types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    ensureWorker();
    const bundle = await projectBundle((await params).id);
    return bundle ? ok(bundle) : fail("프로젝트 없음", 404);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const p = await getProject(id);
    if (!p) return fail("프로젝트 없음", 404);
    const b = await body<{
      title?: string;
      brief?: string;
      scheduledDate?: string | null;
      addSourceUrl?: string;
      sourceNote?: string;
      removeSourceUrl?: string;
    }>(req);
    if (b.title !== undefined) await q("UPDATE projects SET title=$2, topic=$2, updated_at=NOW() WHERE id=$1", [id, b.title]);
    if (b.brief !== undefined) await q("UPDATE projects SET brief=$2, updated_at=NOW() WHERE id=$1", [id, b.brief]);
    if (b.scheduledDate !== undefined)
      await q("UPDATE projects SET scheduled_date=$2, updated_at=NOW() WHERE id=$1", [id, b.scheduledDate || null]);
    if (b.addSourceUrl) {
      let src: Source;
      try {
        src = await fetchUrlMeta(b.addSourceUrl, b.sourceNote ?? "");
      } catch (e) {
        return fail((e as Error).message);
      }
      await q("UPDATE projects SET sources = sources || $2::jsonb, updated_at=NOW() WHERE id=$1", [id, j([src])]);
      await addEvent(id, "source", `출처 추가: ${src.title}`);
    }
    if (b.removeSourceUrl) {
      const next = p.sources.filter((s) => s.url !== b.removeSourceUrl);
      await q("UPDATE projects SET sources=$2, updated_at=NOW() WHERE id=$1", [id, j(next)]);
    }
    return ok(await projectBundle(id));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    await q("UPDATE jobs SET status='canceled' WHERE project_id=$1 AND status IN ('queued')", [id]);
    await q("DELETE FROM projects WHERE id=$1", [id]);
    await q("UPDATE ideas SET project_id=NULL, status='new' WHERE project_id=$1", [id]);
    return ok({ ok: true });
  });
}
