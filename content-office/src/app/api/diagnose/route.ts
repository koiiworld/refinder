import { body, fail, handle, ok } from "@/lib/api";
import { getDiagnoseState, lastDiagnosis, startDiagnose } from "@/lib/diagnose";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId") ?? "";
    if (!blogId) return ok(null);
    return ok({ last: await lastDiagnosis(blogId), state: await getDiagnoseState(blogId) });
  });
}

/** 🩺 블로그 진단 시작 (서버 작업 큐에서 진행 — 화면을 떠나도 계속) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string }>(req);
    if (!b.blogId) return fail("진단할 블로그를 고르세요.");
    try {
      return ok({ state: await startDiagnose(b.blogId) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
