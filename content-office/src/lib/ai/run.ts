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
  images?: string[]; // 함께 보여줄 이미지 URL (검수 등)
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
  // 담당 AI 키가 없으면(예: 글쓰기용 무료 Gemini 키 없음) 연결된 다른 AI로
  const { FALLBACK_MODELS } = await import("../steps");
  for (const p of ["openai", "anthropic", "google"] as const) {
    if (p !== wanted.provider && isConnected(p)) return { assignment: { provider: p, model: FALLBACK_MODELS[p] }, fallback: true, reason: `${PROVIDER_LABELS[wanted.provider]} 미연결 → ${PROVIDER_LABELS[p]} 사용` };
  }
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
        { system: o.system, prompt: o.prompt, model: assignment.model, json: o.json, maxTokens: o.maxTokens, images: o.images },
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
    const repaired = repairJson(cleaned.slice(start));
    if (repaired !== null) return repaired as T;
    throw new AiError("AI 응답이 중간에 끊겨 읽을 수 없습니다. 다시 시도합니다.", true);
  }
}

/** 중간에 잘린 JSON: 마지막으로 완성된 값까지 남기고 열린 괄호를 닫아 복구 */
function repairJson(text: string): unknown {
  for (let cut = text.length; cut > 1; cut--) {
    const ch = text[cut - 1];
    if (ch !== "}" && ch !== "]" && ch !== '"' && !/[0-9el]/.test(ch)) continue;
    const head = text.slice(0, cut);
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const c of head) {
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" || c === "]") stack.pop();
    }
    if (inStr) continue;
    const closing = stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      return JSON.parse(head.replace(/,\s*$/, "") + closing);
    } catch {
      /* 더 앞에서 잘라 봄 */
    }
    if (text.length - cut > 4000) break;
  }
  return null;
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

// ───────────────────────── 단계별 AI + 자동 대체 ─────────────────────────

const unhealthy = new Map<string, number>(); // provider → 이 시각까지 건너뜀 (크레딧 부족 등)

/** 크레딧·키·권한 문제처럼 기다려도 해결되지 않는 오류 → 다른 AI로 대체 */
function unusable(e: unknown) {
  if (!(e instanceof AiError)) return false;
  return [401, 402, 403].includes(e.status ?? 0) || /credit|balance|quota|billing|insufficient|payment|permission|api key/i.test(e.message);
}
/** 혼잡·한도: 다른 AI가 있으면 그쪽으로, 없으면 작업 큐가 나중에 재시도 */
function busy(e: unknown) {
  return e instanceof AiError && (e.status === 503 || e.status === 429 || e.status === 529);
}

export interface StepRunResult extends RunResult {
  substitutedFor?: string; // 대체됐다면 원래 담당 AI
}

/**
 * 단계 담당 AI로 실행. 쓸 수 없으면(미연결·크레딧 부족·혼잡) 연결된 다른 AI로 자동 대체.
 * 아무 AI도 못 쓰면 template 이 있으면 템플릿(AI 아님), 없으면 오류.
 */
export async function runStep(o: Omit<RunOptions, "role" | "override"> & { step: import("../steps").StepKey; role?: RoleKey }): Promise<StepRunResult> {
  const { stepAi } = await getSettings();
  const { FALLBACK_MODELS } = await import("../steps");
  const primary = stepAi[o.step];
  const order: RoleAssignment[] = [primary];
  for (const p of ["google", "openai", "anthropic"] as const) {
    if (p !== primary.provider || primary.model !== FALLBACK_MODELS[p]) order.push({ provider: p, model: FALLBACK_MODELS[p] });
    // Gemini 가 붐빌 때를 대비한 같은 키의 가벼운 모델
    if (p === "google") order.push({ provider: "google", model: "gemini-3.5-flash-lite" });
  }
  const now = Date.now();
  const seen = new Set<string>();
  const candidates = order.filter((c) => {
    const k = `${c.provider}:${c.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return isConnected(c.provider) && (unhealthy.get(c.provider) ?? 0) < now;
  });
  const problems: string[] = [];
  let anyBusy = false;
  for (const c of candidates) {
    try {
      const r = await runAI({ ...o, role: o.role ?? "writer", override: c, retries: o.retries ?? 1 });
      return c.provider === primary.provider && c.model === primary.model ? r : { ...r, substitutedFor: `${PROVIDER_LABELS[primary.provider]} (${primary.model})` };
    } catch (e) {
      const name = `${PROVIDER_LABELS[c.provider]}`;
      if (unusable(e)) {
        unhealthy.set(c.provider, Date.now() + 10 * 60_000); // 10분간 건너뜀
        problems.push(`${name}: 크레딧·키 문제`);
        continue;
      }
      if (busy(e) || (e instanceof AiError && e.retryable)) {
        anyBusy = true;
        problems.push(`${name}(${c.model}): ${busy(e) ? "서버 혼잡" : "응답 오류"}`);
        continue;
      }
      throw e;
    }
  }
  for (const [p, until] of unhealthy) if (until >= now && !problems.some((x) => x.startsWith(PROVIDER_LABELS[p as ProviderId]))) problems.push(`${PROVIDER_LABELS[p as ProviderId]}: 크레딧·키 문제(최근)`);
  if (problems.length) {
    // 혼잡이 섞여 있으면 재시도 가능한 오류로 → 작업 큐가 잠시 뒤 다시 시도
    throw new AiError(`지금 쓸 수 있는 AI가 없습니다 — ${problems.join(" / ")}. ${anyBusy ? "잠시 뒤 다시 시도하면 됩니다." : "설정에서 AI 연결·크레딧을 확인하세요."}`, anyBusy, anyBusy ? 503 : undefined);
  }
  if (o.template) {
    const { fallbackToTemplate } = await getSettings();
    if (fallbackToTemplate) return runAI({ ...o, role: o.role ?? "writer", override: { provider: "template", model: "offline-template" } });
  }
  throw new AiError("연결된 AI가 없습니다. 설정에서 AI API 키를 넣어 주세요.", false);
}
