import { getVersion } from "@/lib/repo";
import { fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) {
  return handle(async () => {
    const { id, vid } = await params;
    const v = await getVersion(vid);
    if (!v || v.project_id !== id) return fail("버전 없음", 404);
    return ok(v);
  });
}
