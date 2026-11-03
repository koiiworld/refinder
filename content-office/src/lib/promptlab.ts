import "server-only";
import { q, q1, newId, j } from "./db";
import { getBlog } from "./repo";
import { extractJson, resolveAssignment, runAI } from "./ai/run";
import { promptRefinePrompt, promptRefineTemplate } from "./ai/prompts";
import { getGuide, supports, type PromptKind, type PromptMedia, type PromptTarget, type RefineResult } from "./prompt-guides";
import type { RoleAssignment } from "./types";
import { WorkflowError } from "./workflow";

export interface PromptVersion {
  n: number;
  result: RefineResult;
  source: "ai" | "template" | "user";
  provider: string | null;
  model: string | null;
  feedback: string;
  created_at: string;
}

export interface PromptRow {
  id: string;
  title: string;
  target: PromptTarget;
  kind: PromptKind;
  media: PromptMedia;
  blog_id: string | null;
  input: string;
  goal: string;
  versions: PromptVersion[];
  current: RefineResult | null;
  created_at: string;
  updated_at: string;
}

const TARGETS = ["gpt", "claude", "gemini", "higgsfield"];
const KINDS = ["visual", "writing", "info"];

export function validate(target: string, kind: string, media: string) {
  if (!TARGETS.includes(target) || !KINDS.includes(kind) || !["image", "video"].includes(media))
    throw new WorkflowError("대상 AI·용도 값이 올바르지 않습니다.");
  const s = supports(target as PromptTarget, kind as PromptKind);
  if (!s.ok) throw new WorkflowError(s.reason!);
}

async function refine(row: Pick<PromptRow, "target" | "kind" | "media" | "blog_id" | "input" | "goal">, previous: RefineResult | null, feedback: string, override: RoleAssignment | null) {
  const guide = getGuide(row.target, row.kind, row.media)!;
  const blog = row.blog_id ? await getBlog(row.blog_id) : null;
  const { system, prompt } = promptRefinePrompt({ ...row, original: row.input, guide, blog, previous, feedback });
  const { fallback, assignment } = await resolveAssignment(blog, "prompter", override);
  const res = await runAI({
    purpose: "prompt",
    role: "prompter",
    blog,
    system,
    prompt,
    json: true,
    maxTokens: 6000,
    retries: 2,
    override,
    template: () => JSON.stringify(promptRefineTemplate(guide, previous?.prompt ?? row.input)),
  });
  const raw = extractJson<Partial<RefineResult>>(res.text);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const result: RefineResult = {
    prompt: String(raw.prompt ?? "").trim(),
    promptKo: guide.language === "en" ? String(raw.promptKo ?? "") : "",
    negative: guide.negative ? String(raw.negative ?? "") : "",
    changes: arr(raw.changes),
    questions: arr(raw.questions),
    settings: arr(raw.settings),
  };
  if (!result.prompt) throw new WorkflowError("AI가 프롬프트를 돌려주지 않았습니다. 다시 시도하세요.");
  void assignment;
  return { result, source: (fallback || res.provider === "template" ? "template" : "ai") as PromptVersion["source"], provider: res.provider, model: res.model };
}

export async function createPrompt(input: {
  target: string;
  kind: string;
  media?: string;
  blogId?: string | null;
  text: string;
  goal?: string;
  title?: string;
  override?: RoleAssignment | null;
}): Promise<PromptRow> {
  const media = input.kind === "visual" ? input.media ?? "image" : "image";
  validate(input.target, input.kind, media);
  if (!input.text?.trim()) throw new WorkflowError("다듬을 프롬프트를 입력하세요.");
  const base = {
    target: input.target as PromptTarget,
    kind: input.kind as PromptKind,
    media: media as PromptMedia,
    blog_id: input.blogId || null,
    input: input.text.trim(),
    goal: input.goal?.trim() ?? "",
  };
  const r = await refine(base, null, "", input.override ?? null);
  const v: PromptVersion = { n: 1, result: r.result, source: r.source, provider: r.provider, model: r.model, feedback: "", created_at: new Date().toISOString() };
  const id = newId("pr_");
  const title = (input.title?.trim() || base.input.replace(/\s+/g, " ").slice(0, 40)) as string;
  await q(
    `INSERT INTO prompts (id, title, target, kind, media, blog_id, input, goal, versions, current)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, title, base.target, base.kind, base.media, base.blog_id, base.input, base.goal, j([v]), j(r.result)],
  );
  return (await getPrompt(id))!;
}

export async function getPrompt(id: string) {
  return q1<PromptRow>("SELECT * FROM prompts WHERE id=$1", [id]);
}

export async function listPrompts() {
  return q<PromptRow>("SELECT * FROM prompts ORDER BY updated_at DESC LIMIT 200");
}

/** 추가 수정 요청 → 새 버전 */
export async function refineAgain(id: string, feedback: string, override: RoleAssignment | null) {
  const row = await getPrompt(id);
  if (!row) throw new WorkflowError("프롬프트를 찾을 수 없습니다.");
  if (!feedback.trim()) throw new WorkflowError("어떻게 고칠지 적어주세요.");
  const r = await refine(row, row.current, feedback.trim(), override);
  return pushVersion(row, { result: r.result, source: r.source, provider: r.provider, model: r.model, feedback: feedback.trim() });
}

/** 사용자가 직접 고친 최종본 저장 → 새 버전 */
export async function saveManual(id: string, result: RefineResult) {
  const row = await getPrompt(id);
  if (!row) throw new WorkflowError("프롬프트를 찾을 수 없습니다.");
  if (!result.prompt?.trim()) throw new WorkflowError("프롬프트가 비어 있습니다.");
  const clean: RefineResult = {
    prompt: result.prompt,
    promptKo: result.promptKo ?? "",
    negative: result.negative ?? "",
    changes: row.current?.changes ?? [],
    questions: row.current?.questions ?? [],
    settings: row.current?.settings ?? [],
  };
  return pushVersion(row, { result: clean, source: "user", provider: null, model: null, feedback: "직접 수정" });
}

export async function restorePromptVersion(id: string, n: number) {
  const row = await getPrompt(id);
  const v = row?.versions.find((x) => x.n === n);
  if (!row || !v) throw new WorkflowError("버전을 찾을 수 없습니다.");
  return pushVersion(row, { ...v, source: "user", feedback: `v${n} 복원` });
}

async function pushVersion(row: PromptRow, v: Omit<PromptVersion, "n" | "created_at">) {
  const next: PromptVersion = { ...v, n: Math.max(0, ...row.versions.map((x) => x.n)) + 1, created_at: new Date().toISOString() };
  await q("UPDATE prompts SET versions = versions || $2::jsonb, current=$3, updated_at=NOW() WHERE id=$1", [row.id, j([next]), j(next.result)]);
  return (await getPrompt(row.id))!;
}
