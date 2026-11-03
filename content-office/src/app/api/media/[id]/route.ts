import { cancelMediaJob, refreshMediaJob } from "@/lib/media";
import { HiggsfieldError } from "@/lib/higgsfield";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

/** 상태 조회 (진행 중이면 Higgsfield 에 물어 갱신) */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const job = await refreshMediaJob((await params).id);
    return job ? ok(job) : fail("작업 없음", 404);
  });
}

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const b = await body<{ action: string }>(req);
    if (b.action !== "cancel") return fail("알 수 없는 요청");
    try {
      return ok(await cancelMediaJob((await params).id));
    } catch (e) {
      if (e instanceof HiggsfieldError) return fail(e.message, 502);
      throw e;
    }
  });
}
