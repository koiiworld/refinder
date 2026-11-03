import { q } from "@/lib/db";
import { createProject } from "@/lib/workflow";
import { fetchUrlMeta } from "@/lib/research";
import type { Source } from "@/lib/types";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const blogId = new URL(req.url).searchParams.get("blogId");
    return ok(
      await q(
        `SELECT p.id, p.blog_id, p.title, p.stage, p.status, p.status_message, p.scheduled_date, p.needs_rereview,
                p.created_at, p.updated_at, b.name AS blog_name, b.color AS blog_color
         FROM projects p JOIN blogs b ON b.id = p.blog_id
         ${blogId ? "WHERE p.blog_id=$1" : ""} ORDER BY p.updated_at DESC`,
        blogId ? [blogId] : [],
      ),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{
      blogId: string;
      title: string;
      brief?: string;
      urls?: string[];
      scheduledDate?: string;
      autoApproveTopic?: boolean;
    }>(req);
    if (!b.blogId) return fail("블로그를 선택하세요.");
    const sources: Source[] = [];
    for (const url of (b.urls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 10)) {
      try {
        sources.push(await fetchUrlMeta(url));
      } catch (e) {
        return fail(`${url}: ${(e as Error).message}`);
      }
    }
    const id = await createProject({
      blogId: b.blogId,
      title: b.title,
      brief: b.brief,
      sources,
      scheduledDate: b.scheduledDate || null,
      autoApproveTopic: !!b.autoApproveTopic,
    });
    return ok({ id }, 201);
  });
}
