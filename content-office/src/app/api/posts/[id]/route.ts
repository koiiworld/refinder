import { updateProject } from "@/lib/repo";
import { q } from "@/lib/db";
import { postBundle } from "@/lib/post-bundle";
import { ensureWorker } from "@/lib/jobs";
import { approveOutline, cancelJobs, insertImage, markPublished, requestOutline, rerun, selectTitle, setHashtags, setImage, startWriting, requestFix, requestEdit, saveIssueNotes, WorkflowError } from "@/lib/workflow";
import { createMediaJob, estimateMedia } from "@/lib/media";
import { HF_MODELS, HiggsfieldError } from "@/lib/higgsfield";
import { generateDirect, ImageGenError } from "@/lib/image-gen";
import { imageModel } from "@/lib/image-models";
import { loadRefs, prepareImage } from "@/lib/image-refs";
import { editPrompt, hasHangul, recommendModels, toEnglishPrompt } from "@/lib/image-prompt";
import { hfConnected } from "@/lib/higgsfield";
import { getProject } from "@/lib/repo";
import { moveToTrash } from "@/lib/trash";
import { checkImageUrl, findOfficialImages } from "@/lib/official-images";
import type { PostExtras } from "@/lib/posts-types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

const fmtUsdKrw = (usd: number) => `$${usd.toFixed(3)} (₩${Math.round(usd * 1500).toLocaleString("ko-KR")})`;

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
    const b = await body<{ action: string; step?: "titles" | "write" | "review"; feedback?: string; index?: number; title?: string; hashtags?: string[]; url?: string; prompt?: string; aspect?: string; pageUrl?: string; credit?: string; model?: string; refIds?: string[]; useKit?: boolean; soulId?: string | null; request?: string; indexes?: number[]; sectionIndexes?: number[]; note?: string; notes?: Record<string, string>; general?: string; manual?: boolean; date?: string; outline?: Partial<import("@/lib/posts-types").PostOutline> }>(req);
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
      case "estimate": {
        const { postEstimates } = await import("@/lib/estimate");
        return ok(await postEstimates());
      }
      case "outline":
        await requestOutline(id, { index: b.index, title: b.title });
        break;
      case "verify_claims": {
        // ③-2 '확인 필요'를 AI가 확인 (네이버 검색 + 무료 Gemini) — 주장(indexes)·목차(sectionIndexes) 같은 방식
        const { saveOutlineDraft } = await import("@/lib/workflow");
        const { verifyClaims } = await import("@/lib/factcheck");
        const outline = await saveOutlineDraft(id, b.outline ?? {});
        const ci = (b.indexes ?? []).map(Number).filter((i) => outline.claims[i] && !outline.claims[i].removed);
        const si = (b.sectionIndexes ?? []).map(Number).filter((i) => outline.sections[i] && !outline.sections[i].removed);
        if (!ci.length && !si.length) return fail("확인할 내용을 골라 주세요.");
        const p = await getProject(id);
        const items = [
          ...ci.map((i) => ({ claim: outline.claims[i].claim, evidence: outline.claims[i].evidence, source: outline.claims[i].source })),
          ...si.map((i) => ({ claim: `${outline.sections[i].heading}: ${outline.sections[i].points.join(" / ")}`, evidence: "", source: "" })),
        ];
        const verdicts = await verifyClaims(id, p?.topic ?? "", items);
        const at = new Date().toISOString();
        const claims = outline.claims.map((c, i) => {
          const k = ci.indexOf(i);
          if (k < 0) return c;
          const v = verdicts[k];
          return { ...c, source: v.source || c.source, check: v.status !== "verified", verify: { status: v.status, note: v.note, at } };
        });
        const sections = outline.sections.map((x, i) => {
          const k = si.indexOf(i);
          if (k < 0) return x;
          const v = verdicts[ci.length + k];
          return { ...x, check: v.status !== "verified", verify: { status: v.status, note: v.note, at, ...(v.source ? { source: v.source } : {}) } };
        });
        await saveOutlineDraft(id, { ...outline, claims, sections });
        const n = verdicts.filter((v) => v.status === "verified").length;
        return ok({ ...(await postBundle(id)), notice: `확인완료 ${n}개 · 확인안됨 ${verdicts.length - n}개` });
      }
      case "approve_outline":
        await approveOutline(id, b.outline);
        break;
      case "write":
        await startWriting(id, { index: b.index, title: b.title });
        break;
      case "hashtags":
        await setHashtags(id, b.hashtags ?? []);
        break;
      case "image_prompt": {
        // 한국어로 적었으면 영어로 바꿔 저장 (이미지 AI는 영어를 더 잘 따름)
        let prompt = b.prompt;
        let translated = false;
        if (prompt !== undefined && hasHangul(prompt)) {
          const en = await toEnglishPrompt(prompt, id);
          prompt = en.prompt;
          translated = en.translated;
        }
        await setImage(id, Number(b.index), { ...(prompt !== undefined ? { prompt } : {}), ...(b.aspect ? { aspect: b.aspect } : {}) });
        if (translated) return ok({ ...(await postBundle(id)), notice: "한국어 프롬프트를 영어로 바꿔 저장했어요." });
        break;
      }
      case "image_refs":
        // 🎨 이번만 레퍼런스 · 컨셉 키트 쓰기 · Soul ID
        await setImage(id, Number(b.index), {
          ...(b.refIds !== undefined ? { refIds: (b.refIds ?? []).filter((x) => /^img_[0-9a-f]{24}$/.test(x)).slice(0, 5) } : {}),
          ...(b.useKit !== undefined ? { useKit: !!b.useKit } : {}),
          ...(b.soulId !== undefined ? { soulId: b.soulId } : {}),
        });
        break;
      case "prompt_edit": {
        // ✏️ 프롬프트 수정: 한국어 요청 → 고친 영어 프롬프트 저장 (이미지는 만들지 않음)
        const p = await getProject(id);
        const im = (p?.package as unknown as PostExtras | null)?.images?.[Number(b.index)];
        if (!im) throw new WorkflowError("이미지 프롬프트를 찾을 수 없습니다.");
        try {
          const r = await editPrompt(im.prompt, String(b.request ?? ""), id);
          await setImage(id, Number(b.index), { prompt: r.prompt });
          return ok({ ...(await postBundle(id)), notice: r.changed ? `프롬프트를 고쳤어요: ${r.changed}` : "프롬프트를 고쳤어요." });
        } catch (e) {
          return fail((e as Error).message, 400);
        }
      }
      case "recommend_model": {
        // 🤖 모델 추천 (무료 Gemini, 이미지는 만들지 않음)
        const p = await getProject(id);
        const im = (p?.package as unknown as PostExtras | null)?.images?.[Number(b.index)];
        if (!im) throw new WorkflowError("이미지 프롬프트를 찾을 수 없습니다.");
        const { resolveRefs } = await import("@/lib/image-refs");
        const r = await resolveRefs({ blogId: p?.blog_id, refIds: im.refIds, useKit: im.useKit });
        const providers = { higgsfield: hfConnected(), openai: !!process.env.OPENAI_API_KEY?.trim(), google: !!process.env.GOOGLE_AI_API_KEY?.trim() };
        try {
          return ok({ picks: await recommendModels({ prompt: im.prompt, refs: r.refIds.length, providers, projectId: id }) });
        } catch (e) {
          return fail((e as Error).message, 400);
        }
      }
      case "generate_image": {
        // ⑤ 사용자가 누를 때만 Higgsfield 생성 (크레딧 차감)
        const p = await getProject(id);
        const im = (p?.package as unknown as PostExtras | null)?.images?.[Number(b.index)];
        if (!im) throw new WorkflowError("이미지 프롬프트를 찾을 수 없습니다.");
        const chosen = String(b.model ?? im.model ?? "soul-standard");
        // 한국어 → 영어, 컨셉 키트·레퍼런스·Soul ID·스타일 문구
        const prep = await prepareImage({ modelId: chosen, prompt: im.prompt, blogId: p?.blog_id, refIds: im.refIds, useKit: im.useKit, soulId: im.soulId, projectId: id });
        if (prep.translated) await setImage(id, Number(b.index), { prompt: prep.basePrompt });
        // ChatGPT·Gemini: 바로 만들어 DB에 저장하고 이 사이트 주소로 보여 줌
        if (imageModel(chosen) && imageModel(chosen)!.provider !== "higgsfield") {
          try {
            const imgId = await generateDirect({ modelId: chosen, prompt: prep.prompt, aspect: im.aspect, projectId: id, blogId: p?.blog_id, refs: await loadRefs(prep.refIds) });
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
          const job = await createMediaJob({ model, projectId: id, prompt: prep.prompt, aspect_ratio: im.aspect, resolution: "1080p", ref_urls: prep.refUrls, soul_id: prep.soulId });
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
      case "publish_date": {
        const d = String(b.date ?? "");
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail("날짜를 확인해 주세요.");
        await updateProject(id, { publish_date: d || null } as never);
        break;
      }
      case "image_manual":
        await setImage(id, Number(b.index), { manual: !!b.manual });
        break;
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
        const { resolveRefs, publicBase, refUrl } = await import("@/lib/image-refs");
        const info = imageModel(String(b.model));
        const rr = await resolveRefs({ blogId: p?.blog_id, refIds: im.refIds, useKit: im.useKit, soulId: im.soulId });
        const nRefs = Math.min(rr.refIds.length, info?.refs ?? 0);
        if (info && info.provider !== "higgsfield") {
          // 레퍼런스 1장: Gemini 약 $0.001, ChatGPT 약 $0.016 (각 사 가격표 기준 추정)
          const per = info.provider === "google" ? 0.001 : 0.016;
          return ok({ usd: null, credits: null, refs: nRefs, note: `만든 뒤 각 사 사용량 페이지에서 확인 (토큰 과금)${nRefs ? ` · 레퍼런스 ${nRefs}장 최대 약 ${fmtUsdKrw(per * nRefs)} 추가` : ""}` });
        }
        const base = nRefs ? await publicBase() : null;
        try {
          return ok({ ...(await estimateMedia({ model: String(b.model ?? "soul-standard"), prompt: im.prompt, aspect_ratio: im.aspect, resolution: "1080p", ref_urls: base ? rr.refIds.slice(0, nRefs).map((x) => refUrl(base, x)) : [], soul_id: info?.soul ? rr.soulId : null })), refs: base ? nRefs : 0 });
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
