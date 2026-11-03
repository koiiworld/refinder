import { q, q1, j } from "@/lib/db";
import type { Idea } from "@/lib/types";
import { createProject } from "@/lib/workflow";
import { fetchUrlMeta } from "@/lib/research";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const idea = await q1<Idea>("SELECT * FROM ideas WHERE id=$1", [id]);
    if (!idea) return fail("글감 없음", 404);
    const b = await body<{
      action: "approve" | "reject" | "reopen" | "add_source";
      brief?: string;
      scheduledDate?: string;
      url?: string;
      note?: string;
    }>(req);
    if (b.action === "approve") {
      if (idea.status === "approved") return fail("이미 승인된 글감입니다.");
      // 주제 승인 = 프로젝트 생성 + 기획안 작성 자동 시작
      const projectId = await createProject({
        blogId: idea.blog_id,
        title: idea.title,
        topic: idea.title,
        brief: [idea.memo, b.brief].filter(Boolean).join("\n"),
        sources: idea.sources,
        ideaId: idea.id,
        scheduledDate: b.scheduledDate ?? null,
        autoApproveTopic: true,
      });
      await q("UPDATE ideas SET status='approved', project_id=$2 WHERE id=$1", [id, projectId]);
      return ok({ projectId });
    }
    if (b.action === "reject") {
      await q("UPDATE ideas SET status='rejected' WHERE id=$1", [id]);
      return ok({ ok: true });
    }
    if (b.action === "reopen") {
      await q("UPDATE ideas SET status='new' WHERE id=$1 AND project_id IS NULL", [id]);
      return ok({ ok: true });
    }
    if (b.action === "add_source" && b.url) {
      try {
        const src = await fetchUrlMeta(b.url, b.note ?? "");
        await q("UPDATE ideas SET sources = sources || $2::jsonb WHERE id=$1", [id, j([src])]);
        return ok(src);
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    return fail("알 수 없는 요청");
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await q("DELETE FROM ideas WHERE id=$1", [(await params).id]);
    return ok({ ok: true });
  });
}
