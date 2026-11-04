import { q } from "@/lib/db";
import { createPosts } from "@/lib/workflow";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () =>
    ok(
      await q(
        `SELECT p.id, p.blog_id, p.title, p.topic, p.stage, p.status, p.status_message, p.updated_at, p.created_at,
                b.name AS blog_name, b.color AS blog_color
         FROM projects p JOIN blogs b ON b.id=p.blog_id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 300`,
      ),
    ),
  );
}

/** ② 선택한 키워드로 글 만들기 → ③④⑥ 자동 진행 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId: string; pickIds: string[] }>(req);
    if (!b.blogId) return fail("블로그를 선택하세요.");
    return ok({ ids: await createPosts(b.blogId, b.pickIds ?? []) }, 201);
  });
}
