import { shrinkHtml } from "@/lib/ai/html-for-ai";
import { resolveAssignment, runAI } from "@/lib/ai/run";
import { editHtmlPrompt, editPrompt } from "@/lib/ai/prompts";
import { addEvent, getBlogForAi, getProject } from "@/lib/repo";
import type { ProviderId } from "@/lib/types";
import { body, fail, handle, ok } from "@/lib/api";

/** 선택한 문단만 AI 수정 — 결과는 제안으로만 반환하고, 적용은 사용자가 결정 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ projectId: string; selected: string; instruction: string; context?: string; provider?: ProviderId; model?: string; image?: string; html?: string }>(req);
    // ✂️ 캡처한 영역 이미지 (선택)
    const image = /^data:image\/(png|jpe?g|webp);base64,/.test(String(b.image ?? "")) && String(b.image).length < 8_000_000 ? String(b.image) : null;
    const project = await getProject(b.projectId);
    if (!project) return fail("프로젝트 없음", 404);
    const blog = (await getBlogForAi(project.blog_id))!;
    if (!b.selected?.trim() && !b.html?.trim()) return fail("수정할 부분을 선택하세요.");
    const asHtml = !!b.html?.trim();
    if (!b.instruction?.trim()) return fail("수정 지시를 입력하세요.");
    const override = b.provider && b.model ? { provider: b.provider, model: b.model } : null;
    try {
      const r = await resolveAssignment(blog, "editor", override);
      if (r.fallback || r.assignment.provider === "template") {
        return fail("선택 부분 AI 수정은 AI 연결이 필요합니다. (설정 > AI 연결) 템플릿 모드에서는 문장을 고쳐 쓰지 않습니다.");
      }
    } catch (e) {
      return fail((e as Error).message);
    }
    const shrunk = shrinkHtml(String(b.html ?? ""));
    const { system, prompt } = asHtml ? editHtmlPrompt(blog, shrunk.html, b.instruction, b.context ?? "", !!image) : editPrompt(blog, b.selected, b.instruction, b.context ?? "", !!image);
    try {
      const res = await runAI({
        purpose: "edit",
        role: "editor",
        blog,
        projectId: project.id,
        system,
        prompt,
        maxTokens: asHtml ? 8000 : 4000,
        retries: 2,
        override,
        ...(image ? { images: [image] } : {}),
      });
      await addEvent(project.id, "ai", `선택 부분 AI 수정 제안 (${res.provider}/${res.model})`);
      // HTML 은 코드블록 표시(```html)가 붙어 오면 벗김
      const text = asHtml ? shrunk.restore(res.text.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim()) : res.text.trim();
      return ok({ text, html: asHtml, provider: res.provider, model: res.model });
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
