import { q, q1 } from "@/lib/db";
import { ensureWorker } from "@/lib/jobs";
import type { Job } from "@/lib/types";
import { Ctx, fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    ensureWorker();
    const job = await q1<Job>("SELECT * FROM jobs WHERE id=$1", [(await params).id]);
    return job ? ok(job) : fail("작업 없음", 404);
  });
}

/** 실패한 작업 수동 재시도 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const job = await q1<Job>("SELECT * FROM jobs WHERE id=$1", [id]);
    if (!job) return fail("작업 없음", 404);
    if (job.status !== "failed" && job.status !== "canceled") return fail("실패/취소된 작업만 재시도할 수 있습니다.");
    await q("UPDATE jobs SET status='queued', attempts=0, run_after=NOW(), error=NULL, finished_at=NULL WHERE id=$1", [id]);
    if (job.project_id) await q("UPDATE projects SET status='running', status_message='' WHERE id=$1", [job.project_id]);
    ensureWorker();
    return ok({ ok: true });
  });
}
