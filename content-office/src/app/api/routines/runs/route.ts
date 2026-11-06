import { handle, ok } from "@/lib/api";
import { listRuns } from "@/lib/routines";

/** 실행 기록: ?from=&to=&status=&routine= */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    return ok(await listRuns({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, status: sp.get("status") ?? undefined, routineId: sp.get("routine") ?? undefined }));
  });
}
