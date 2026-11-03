import { q } from "@/lib/db";
import { postBundle } from "@/lib/post-bundle";
import { ensureWorker } from "@/lib/jobs";
import { cancelJobs, insertImage, markPublished, rerun, selectTitle, setHashtags, setImage, WorkflowError } from "@/lib/workflow";
import { createMediaJob } from "@/lib/media";
import { HiggsfieldError } from "@/lib/higgsfield";
import { getProject } from "@/lib/repo";
import type { PostExtras } from "@/lib/posts-types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    ensureWorker();
    const b = await postBundle((await params).id);
    return b ? ok(b) : fail("글 없음", 404);
  });
}

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ action: string; step?: "titles" | "write" | "review"; feedback?: string; index?: number; title?: string; hashtags?: string[]; url?: string; prompt?: string; aspect?: string }>(req);
    switch (b.action) {
      case "rerun":
        if (!b.step) throw new WorkflowError("다시 실행할 단계를 고르세요.");
        await rerun(id, b.step, b.feedback);
        break;
      case "select_title":
        await selectTitle(id, { index: b.index, title: b.title });
        break;
      case "hashtags":
        await setHashtags(id, b.hashtags ?? []);
        break;
      case "image_prompt":
        await setImage(id, Number(b.index), { ...(b.prompt !== undefined ? { prompt: b.prompt } : {}), ...(b.aspect ? { aspect: b.aspect } : {}) });
        break;
      case "generate_image": {
        // ⑤ 사용자가 누를 때만 Higgsfield 생성 (크레딧 차감)
        const p = await getProject(id);
        const im = (p?.package as unknown as PostExtras | null)?.images?.[Number(b.index)];
        if (!im) throw new WorkflowError("이미지 프롬프트를 찾을 수 없습니다.");
        try {
          const job = await createMediaJob({ model: "soul-standard", projectId: id, prompt: im.prompt, aspect_ratio: im.aspect, resolution: "1080p" });
          await setImage(id, Number(b.index), { mediaJobId: job.id, url: null, inserted: false });
        } catch (e) {
          if (e instanceof HiggsfieldError) return fail(e.message, 502);
          throw e;
        }
        break;
      }
      case "insert_image":
        await insertImage(id, Number(b.index));
        break;
      case "publish":
        await markPublished(id, b.url ?? null, true);
        break;
      case "unpublish":
        await markPublished(id, null, false);
        break;
      case "cancel":
        await cancelJobs(id);
        break;
      default:
        return fail("알 수 없는 요청");
    }
    return ok(await postBundle(id));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    await q("UPDATE jobs SET status='canceled' WHERE project_id=$1 AND status='queued'", [id]);
    await q("UPDATE keyword_picks SET status='new', project_id=NULL WHERE project_id=$1", [id]);
    await q("DELETE FROM projects WHERE id=$1", [id]);
    return ok({ ok: true });
  });
}
