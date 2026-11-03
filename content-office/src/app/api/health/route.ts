import { dbKind, q1 } from "@/lib/db";
import { connectionStatus } from "@/lib/ai/providers";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const r = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM blogs");
    return ok({ ok: true, db: await dbKind(), blogs: r?.n ?? 0, ai: connectionStatus() });
  });
}
