import "server-only";
import { q, newId } from "../db";
import { getSettings } from "../settings";
import type { Blog, ProviderId, RoleAssignment, RoleKey } from "../types";
import { DEFAULT_ROLES } from "../seed";
import { AiError, callProvider, isConnected, PROVIDER_LABELS } from "./providers";

export interface RunOptions {
  purpose: string; // 예: plan, draft, review, edit, ideas
  role: RoleKey;
  blog: Blog | null; // 블로그와 무관한 작업(프롬프트 수정 등)은 null
  projectId?: string | null;
  jobId?: string | null;
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  template?: () => string;
  override?: RoleAssignment | null; // 다른 AI로 재실행/재검수
  retries?: number; // 동기 호출 시 즉시 재시도 횟수
}

export interface RunResult {
  text: string;
  provider: ProviderId;
  model: string;
  fallback: boolean; // 미연결로 템플릿을 사용했는지
}

export async function resolveAssignment(
  blog: Blog | null,
  role: RoleKey,
  override?: RoleAssignment | null,
): Promise<{ assignment: RoleAssignment; fallback: boolean; reason?: string }> {
  const wanted = override ?? blog?.ai_roles?.[role] ?? DEFAULT_ROLES[role]!;
  if (isConnected(wanted.provider)) return { assignment: wanted, fallback: false };
  const settings = await getSettings();
  if (settings.fallbackToTemplate) {
    return {
      assignment: { provider: "template", model: "offline-template" },
      fallback: true,
      reason: `${PROVIDER_LABELS[wanted.provider]} 미연결 → 템플릿(오프라인) 초안으로 대체`,
    };
  }
  throw new AiError(
    `${PROVIDER_LABELS[wanted.provider]} API 키가 설정되지 않았습니다. 설정 > AI 연결에서 키를 등록하거나 역할 배정을 변경하세요.`,
    false,
  );
}

async function costOf(provider: string, model: string, inTok: number, outTok: number) {
  const { pricing } = await getSettings();
  const p = pricing[`${provider}:${model}`];
  if (!p) return 0;
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}

export async function runAI(o: RunOptions): Promise<RunResult> {
  const { assignment, fallback } = await resolveAssignment(o.blog, o.role, o.override);
  const maxAttempts = 1 + (o.retries ?? 0);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const res = await callProvider(
        assignment.provider,
        { system: o.system, prompt: o.prompt, model: assignment.model, json: o.json, maxTokens: o.maxTokens },
        o.template,
      );
      if (!res.text.trim()) throw new AiError("AI 응답이 비어 있습니다.", true);
      const cost = await costOf(assignment.provider, assignment.model, res.inputTokens, res.outputTokens);
      await logRun(o, assignment, "succeeded", attempt, res.inputTokens, res.outputTokens, cost, Date.now() - started, null);
      return { text: res.text, provider: assignment.provider, model: assignment.model, fallback };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      await logRun(o, assignment, "failed", attempt, 0, 0, 0, Date.now() - started, msg);
      const retryable = assignment.provider !== "template" && (e instanceof AiError ? e.retryable : true);
      if (!retryable || attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

async function logRun(
  o: RunOptions,
  a: RoleAssignment,
  status: string,
  attempt: number,
  inTok: number,
  outTok: number,
  cost: number,
  ms: number,
  error: string | null,
) {
  await q(
    `INSERT INTO ai_runs (id, job_id, project_id, blog_id, purpose, provider, model, status, attempt,
       input_tokens, output_tokens, cost_usd, duration_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      newId("run_"),
      o.jobId ?? null,
      o.projectId ?? null,
      o.blog?.id ?? null,
      o.purpose,
      a.provider,
      a.model,
      status,
      attempt,
      inTok,
      outTok,
      cost,
      ms,
      error,
    ],
  );
}

/** AI 응답에서 JSON 객체 추출 */
export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new AiError("AI 응답에서 JSON을 찾지 못했습니다.", true);
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new AiError("AI 응답 JSON 파싱 실패", true);
  }
}

/** AI가 만든 HTML에서 위험 요소 제거 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/```(?:html)?/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|meta|link)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<\/?(html|head|body)[^>]*>/gi, "")
    .trim();
}
