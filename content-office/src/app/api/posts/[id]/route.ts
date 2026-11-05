import { q } from "@/lib/db";
import { postBundle } from "@/lib/post-bundle";
import { ensureWorker } from "@/lib/jobs";
import { cancelJobs, insertImage, markPublished, rerun, selectTitle, setHashtags, setImage, startWriting, requestFix, requestEdit, saveIssueNotes, WorkflowError } from "@/lib/workflow";
import { createMediaJob, estimateMedia } from "@/lib/media";
import { HF_MODELS, HiggsfieldError } from "@/lib/higgsfield";
import { generateDirect, ImageGenError } from "@/lib/image-gen";
import { imageModel } from "@/lib/image-models";
import { getProject } from "@/lib/repo";
import { moveToTrash } from "@/lib/trash";
import { checkImageUrl, findOfficialImages } from "@/lib/official-images";
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
    const b = await body<{ action: string; step?: "titles" | "write" | "review"; feedback?: string; index?: number; title?: string; hashtags?: string[]; url?: string; prompt?: string; aspect?: string; pageUrl?: string; credit?: string; model?: string; indexes?: number[]; note?: string; notes?: Record<string, string>; general?: string }>(req);
    switch (b.action) {
      case "rerun":
        if (!b.step) throw new WorkflowError("다시 실행할 단계를 고르세요.");
        await rerun(id, b.step, b.feedback);
        break;
      case "select_title":
        await selectTitle(id, { index: b.index, title: b.title });
        break;
      case "edit_request":
        await requestEdit(id, String(b.note ?? ""));
        break;
      case "fix_issues":
        await requestFix(id, Array.isArray(b.indexes) ? b.indexes : [], b.notes && typeof b.notes === "object" ? b.notes : {}, String(b.general ?? ""));
        break;
      case "issue_note":
        await saveIssueNotes(id, { [String(Number(b.index))]: String(b.note ?? "") });
        break;
      case "write":
        await startWriting(id, { index: b.index, title: b.title });
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
        const chosen = String(b.model ?? im.model ?? "soul-standard");
        // ChatGPT·Gemini: 바로 만들어 DB에 저장하고 이 사이트 주소로 보여 줌
        if (imageModel(chosen) && imageModel(chosen)!.provider !== "higgsfield") {
          try {
            const imgId = await generateDirect({ modelId: chosen, prompt: im.prompt, aspect: im.aspect, projectId: id, blogId: p?.blog_id });
            const h = req.headers;
            const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
            await setImage(id, Number(b.index), { mediaJobId: null, url: `${origin}/api/img/${imgId}.jpg`, inserted: false, model: chosen });
          } catch (e) {
            if (e instanceof ImageGenError) return fail(e.message, 502);
            throw e;
          }
          break;
        }
        try {
          const model = chosen in HF_MODELS && HF_MODELS[chosen as keyof typeof HF_MODELS].media === "image" ? chosen : "soul-standard";
          const job = await createMediaJob({ model, projectId: id, prompt: im.prompt, aspect_ratio: im.aspect, resolution: "1080p" });
          await setImage(id, Number(b.index), { mediaJobId: job.id, url: null, inserted: false, model });
        } catch (e) {
          if (e instanceof HiggsfieldError) return fail(e.message, 502);
          throw e;
        }
        break;
      }
      case "find_images": {
        // ⑤ 공식 홈페이지에서 제품 이미지 후보 찾기
        const pageUrl = String(b.pageUrl ?? "").trim();
        if (!pageUrl) throw new WorkflowError("공식 페이지 주소를 넣어 주세요.");
        let candidates: string[];
        try {
          candidates = await findOfficialImages(pageUrl);
        } catch (e) {
          return fail((e as Error).message, 400);
        }
        await setImage(id, Number(b.index), { pageUrl, candidates, ...(b.credit !== undefined ? { credit: b.credit } : {}) });
        break;
      }
      case "image_credit":
        await setImage(id, Number(b.index), { credit: String(b.credit ?? "").slice(0, 100) });
        break;
      case "pick_image": {
        // ⑤ 후보 중 하나를 고르거나 이미지 주소를 직접 입력
        let url: string;
        try {
          url = await checkImageUrl(String(b.url ?? ""));
        } catch {
          return fail("올바른 이미지 주소가 아닙니다.", 400);
        }
        await setImage(id, Number(b.index), { url, inserted: false, ...(b.credit !== undefined ? { credit: b.credit } : {}) });
        break;
      }
      case "estimate_image": {
        // 생성 전 예상 비용 (Higgsfield 견적 — 생성·차감 없음)
        const p = await getProject(id);
        const im = (p?.package as unknown as PostExtras | null)?.images?.[Number(b.index)];
        if (!im) throw new WorkflowError("이미지 프롬프트를 찾을 수 없습니다.");
        if (imageModel(String(b.model)) && imageModel(String(b.model))!.provider !== "higgsfield") return ok({ usd: null, credits: null, note: "만든 뒤 각 사 사용량 페이지에서 확인 (토큰 과금)" });
        try {
          return ok(await estimateMedia({ model: String(b.model ?? "soul-standard"), prompt: im.prompt, aspect_ratio: im.aspect, resolution: "1080p" }));
        } catch (e) {
          if (e instanceof HiggsfieldError) return fail(e.message, 502);
          throw e;
        }
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
    // 바로 지우지 않고 휴지통으로 (휴지통에서 다시 삭제해야 완전 삭제)
    await moveToTrash([id]);
    return ok({ ok: true, trashed: true });
  });
}
