import { body, fail, handle, ok } from "@/lib/api";
import { diagnoseBlog, lastDiagnosis } from "@/lib/diagnose";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId") ?? "";
    return ok(blogId ? await lastDiagnosis(blogId) : null);
  });
}

/** 🩺 블로그 진단 실행 (수십 초 걸릴 수 있음) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string }>(req);
    if (!b.blogId) return fail("진단할 블로그를 고르세요.");
    try {
      return ok(await diagnoseBlog(b.blogId));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
