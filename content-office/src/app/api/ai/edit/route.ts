import { resolveAssignment, runAI } from "@/lib/ai/run";
import { editPrompt } from "@/lib/ai/prompts";
import { addEvent, getBlog, getProject } from "@/lib/repo";
import type { ProviderId } from "@/lib/types";
import { body, fail, handle, ok } from "@/lib/api";

/** 선택한 문단만 AI 수정 — 결과는 제안으로만 반환하고, 적용은 사용자가 결정 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ projectId: string; selected: string; instruction: string; context?: string; provider?: ProviderId; model?: string }>(req);
    const project = await getProject(b.projectId);
    if (!project) return fail("프로젝트 없음", 404);
    const blog = (await getBlog(project.blog_id))!;
    if (!b.selected?.trim()) return fail("수정할 부분을 선택하세요.");
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
    const { system, prompt } = editPrompt(blog, b.selected, b.instruction, b.context ?? "");
    try {
      const res = await runAI({
        purpose: "edit",
        role: "editor",
        blog,
        projectId: project.id,
        system,
        prompt,
        maxTokens: 2000,
        retries: 2,
        override,
      });
      await addEvent(project.id, "ai", `선택 부분 AI 수정 제안 (${res.provider}/${res.model})`);
      return ok({ text: res.text.trim(), provider: res.provider, model: res.model });
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
