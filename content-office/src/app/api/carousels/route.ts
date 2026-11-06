import { body, fail, handle, ok } from "@/lib/api";
import { createFromBlogUrl, createFromProject, createFromTopic, listCarousels } from "@/lib/carousel";
import { AiError } from "@/lib/ai/providers";

export async function GET() {
  return handle(async () => ok(await listCarousels()));
}

/** 새 캐러셀: { projectId } 블로그 글에서 · { topic, niche, format, blogId } 주제로 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ projectId?: string; url?: string; topic?: string; niche?: string; format?: string; blogId?: string }>(req);
    try {
      const id = b.projectId ? await createFromProject(b.projectId) : b.url ? await createFromBlogUrl(b.url, b.blogId) : await createFromTopic({ topic: String(b.topic ?? ""), niche: b.niche, format: b.format, blogId: b.blogId });
      return ok({ id });
    } catch (e) {
      return fail((e as Error).message, e instanceof AiError ? 502 : 400);
    }
  });
}
