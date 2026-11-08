import { q } from "@/lib/db";
import { listCreatorTrends, saveCreatorTrend } from "@/lib/creator";
import { body, fail,handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {const blogId=new URL(req.url).searchParams.get("blogId");return blogId?ok(await listCreatorTrends(blogId)):fail("자료를 확인할 블로그를 선택해 주세요.");});
}

/** 크리에이터 어드바이저 유입 트렌드 붙여넣기 저장 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string; category?: string; date?: string; text: string }>(req);
    return ok(await saveCreatorTrend(b), 201);
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const id = new URL(req.url).searchParams.get("id");
    if (id) await q("DELETE FROM research_snapshots WHERE id=$1 AND source='creator_advisor'", [id]);
    return ok({ ok: true });
  });
}
