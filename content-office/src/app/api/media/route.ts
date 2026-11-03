import { createMediaJob, listMediaJobs } from "@/lib/media";
import { HiggsfieldError } from "@/lib/higgsfield";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => ok(await listMediaJobs(new URL(req.url).searchParams.get("projectId"))));
}

/** Higgsfield 생성 요청 (크레딧 차감) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ model: string; projectId?: string } & Record<string, unknown>>(req);
    try {
      return ok(await createMediaJob(b), 201);
    } catch (e) {
      if (e instanceof HiggsfieldError) return fail(e.message, e.status === 401 || e.status === 403 ? e.status : 502);
      throw e;
    }
  });
}
