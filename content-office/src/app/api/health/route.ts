import { dbKind, q1 } from "@/lib/db";
import { connectionStatus } from "@/lib/ai/providers";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const r = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM blogs");
    // version: 지금 돌고 있는 배포의 커밋 (Render가 넣어 주는 RENDER_GIT_COMMIT) — "업데이트 됐나?" 확인용
    const version = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || "local";
    return ok({ ok: true, version, db: await dbKind(), blogs: r?.n ?? 0, ai: connectionStatus() });
  });
}
