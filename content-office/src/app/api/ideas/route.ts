import { q, newId, j } from "@/lib/db";
import { listIdeas } from "@/lib/repo";
import { fetchUrlMeta } from "@/lib/research";
import type { Source } from "@/lib/types";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => ok(await listIdeas(new URL(req.url).searchParams.get("blogId") ?? undefined)));
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId: string; title: string; memo?: string; keywords?: string[]; urls?: string[] }>(req);
    if (!b.blogId || !b.title?.trim()) return fail("블로그와 글감 제목을 입력하세요.");
    const sources: Source[] = [];
    for (const url of (b.urls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 10)) {
      try {
        sources.push(await fetchUrlMeta(url));
      } catch (e) {
        return fail(`${url}: ${(e as Error).message}`);
      }
    }
    const id = newId("idea_");
    await q(
      `INSERT INTO ideas (id, blog_id, title, memo, keywords, origin, origin_detail, sources)
       VALUES ($1,$2,$3,$4,$5,'user','사용자 직접 등록',$6)`,
      [id, b.blogId, b.title.trim(), b.memo ?? "", j(b.keywords ?? []), j(sources)],
    );
    return ok({ id }, 201);
  });
}
