import { body, fail, handle, ok } from "@/lib/api";
import { approveItem, createReport, lastReport, skipItem } from "@/lib/hot-report";
import { AiError } from "@/lib/ai/providers";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId") ?? "";
    return ok(blogId ? await lastReport(blogId) : null);
  });
}

/** action: report(새 리포트) · approve(승인 → 글 만들기 시작) · skip(넘기기) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?: string; blogId?: string; reportId?: string; index?: number; keyword?: string }>(req);
    try {
      if (b.action === "approve") return ok({ projectId: await approveItem(String(b.reportId), Number(b.index), b.keyword) });
      if (b.action === "skip") {
        await skipItem(String(b.reportId), Number(b.index));
        return ok({ ok: true });
      }
      if (!b.blogId) return fail("블로그를 고르세요.");
      return ok(await createReport(b.blogId));
    } catch (e) {
      return fail((e as Error).message, e instanceof AiError ? 502 : 400);
    }
  });
}
