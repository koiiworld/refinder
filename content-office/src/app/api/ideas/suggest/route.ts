import { enqueue } from "@/lib/jobs";
import { resolveAssignment } from "@/lib/ai/run";
import { getBlog } from "@/lib/repo";
import { body, fail, handle, ok } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId: string; hint?: string }>(req);
    const blog = b.blogId ? await getBlog(b.blogId) : null;
    if (!blog) return fail("블로그를 선택하세요.");
    try {
      const r = await resolveAssignment(blog, "ideas");
      if (r.fallback) return fail("AI 글감 추천은 AI 연결이 필요합니다. 템플릿 모드에서는 글감을 만들어내지 않습니다. (설정 > AI 연결)");
    } catch (e) {
      return fail((e as Error).message);
    }
    const jobId = await enqueue("suggest_ideas", { blogId: b.blogId, payload: { hint: b.hint ?? "" }, maxAttempts: 2 });
    return ok({ jobId });
  });
}
