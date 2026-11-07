import "server-only";
import type { ProviderId } from "../types";
import { hfConnected, HF_ENV } from "../higgsfield";

/**
 * 공식 HTTP API 직접 호출 (SDK 미사용, 서버에서만 실행)
 * - OpenAI: Chat Completions API
 * - Anthropic: Messages API
 * - Google: Gemini generateContent API
 * - template: 외부 호출 없이 입력값으로 구조만 채우는 오프라인 초안 (AI 아님)
 */

export interface AiRequest {
  system: string;
  prompt: string;
  model: string;
  maxTokens?: number;
  json?: boolean;
  temperature?: number;
  images?: string[]; // https 이미지 URL 또는 data:image/...;base64 (비전 지원 모델에 함께 전달)
}

export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  template: "템플릿 (오프라인·AI 아님)",
};

const ENV_KEYS: Record<Exclude<ProviderId, "template">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  // 글쓰기용 Gemini 는 '결제를 켜지 않은 프로젝트'의 무료 키만 사용 (결제가 켜진 GOOGLE_AI_API_KEY 는 이미지 전용)
  google: "GOOGLE_AI_TEXT_API_KEY",
};

export function providerKey(p: ProviderId): string | undefined {
  if (p === "template") return undefined;
  const v = process.env[ENV_KEYS[p]]?.trim();
  return v ? v : undefined;
}

export function isConnected(p: ProviderId): boolean {
  return p === "template" || !!providerKey(p);
}

export function connectionStatus() {
  const text = (["openai", "anthropic", "google"] as const).map((p) => ({
    provider: p as string,
    label: PROVIDER_LABELS[p],
    envKey: ENV_KEYS[p],
    connected: !!providerKey(p),
    media: false,
  }));
  text[2].label = "Gemini (Google) 글쓰기 — 무료 키만";
  // Higgsfield·Gemini 이미지: 이미지 생성 전용 (글 작성 역할에는 배정되지 않음)
  return [
    ...text,
    { provider: "higgsfield", label: "Higgsfield (이미지·영상)", envKey: `${HF_ENV} (키ID:시크릿)`, connected: hfConnected(), media: true },
    { provider: "google-image", label: "Gemini 이미지 (결제된 키)", envKey: "GOOGLE_AI_API_KEY", connected: !!process.env.GOOGLE_AI_API_KEY?.trim(), media: true },
  ];
}

const TIMEOUT_MS = 180_000;

// 공식 API 기본 주소 (프록시·게이트웨이 사용 시 *_BASE_URL 환경 변수로 변경 가능)
const DEFAULT_BASE: Record<Exclude<ProviderId, "template">, [string, string]> = {
  openai: ["OPENAI_BASE_URL", "https://api.openai.com"],
  anthropic: ["ANTHROPIC_BASE_URL", "https://api.anthropic.com"],
  google: ["GOOGLE_AI_BASE_URL", "https://generativelanguage.googleapis.com"],
};
function base(p: Exclude<ProviderId, "template">) {
  const [env, def] = DEFAULT_BASE[p];
  return (process.env[env]?.trim() || def).replace(/\/$/, "");
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* 응답이 JSON이 아님 */
    }
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } })?.error?.message || text.slice(0, 300) || res.statusText;
      const retryable = res.status === 429 || res.status >= 500;
      throw new AiError(`HTTP ${res.status}: ${msg}`, retryable, res.status);
    }
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof AiError) throw e;
    const err = e as Error;
    throw new AiError(err.name === "AbortError" ? "요청 시간 초과" : `네트워크 오류: ${err.message}`, true);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(key: string, r: AiRequest): Promise<AiResponse> {
  const body: Record<string, unknown> = {
    model: r.model,
    messages: [
      { role: "system", content: r.system },
      {
        role: "user",
        content: r.images?.length
          ? [{ type: "text", text: r.prompt }, ...r.images.map((url) => ({ type: "image_url", image_url: { url } }))]
          : r.prompt,
      },
    ],
    // 생각하는 모델(gpt-5·o 시리즈)은 생각에 쓴 토큰도 이 한도에 들어가서, 한도가 작으면 답이 비어 버림 → 넉넉히
    max_completion_tokens: /^(gpt-5|o\d)/i.test(r.model) ? Math.max(16000, (r.maxTokens ?? 8000) * 3) : r.maxTokens ?? 8000,
  };
  if (r.json) body.response_format = { type: "json_object" };
  const data = (await postJson(`${base("openai")}/v1/chat/completions`, { authorization: `Bearer ${key}` }, body)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function callAnthropic(key: string, r: AiRequest): Promise<AiResponse> {
  const data = (await postJson(
    `${base("anthropic")}/v1/messages`,
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model: r.model,
      max_tokens: r.maxTokens ?? 8000,
      system: r.system,
      messages: [
        {
          role: "user",
          content: r.images?.length
            ? [
                ...r.images.map((url) => {
                  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
                  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "image", source: { type: "url", url } };
                }),
                { type: "text", text: r.prompt },
              ]
            : r.prompt,
        },
      ],
    },
  )) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join(""),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

/** Gemini 는 이미지 URL을 직접 받지 않으므로 내려받아 base64 로 첨부 (실패한 이미지는 건너뜀) */
async function inlineImages(urls: string[] = []) {
  const parts: { inline_data: { mime_type: string; data: string } }[] = [];
  for (const url of urls.slice(0, 6)) {
    const dm = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (dm) {
      parts.push({ inline_data: { mime_type: dm[1], data: dm[2] } });
      continue;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) continue;
      parts.push({ inline_data: { mime_type: res.headers.get("content-type")?.split(";")[0] || "image/png", data: buf.toString("base64") } });
    } catch {
      /* 건너뜀 */
    }
  }
  return parts;
}

async function callGoogle(key: string, r: AiRequest): Promise<AiResponse> {
  // 최신 Gemini 는 답하기 전 '생각'에도 출력 한도를 쓰므로 넉넉히 잡음 (부족하면 답이 잘림)
  const generationConfig: Record<string, unknown> = { maxOutputTokens: Math.max(16384, (r.maxTokens ?? 8000) * 2) };
  if (r.json) generationConfig.responseMimeType = "application/json";
  const data = (await postJson(
    `${base("google")}/v1beta/models/${encodeURIComponent(r.model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: "user", parts: [...(await inlineImages(r.images)), { text: r.prompt }] }],
      generationConfig,
    },
  )) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS" && r.json) {
    throw new AiError("Gemini 답이 출력 한도에 걸려 잘렸습니다. 다시 시도합니다.", true);
  }
  return {
    text: (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join(""),
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function callProvider(
  provider: ProviderId,
  r: AiRequest,
  templateFn?: () => string,
): Promise<AiResponse> {
  if (provider === "template") {
    if (!templateFn) throw new AiError("이 작업은 템플릿 모드를 지원하지 않습니다.", false);
    return { text: templateFn(), inputTokens: 0, outputTokens: 0 };
  }
  const key = providerKey(provider);
  if (!key) throw new AiError(`${PROVIDER_LABELS[provider]} API 키가 설정되지 않았습니다.`, false);
  if (provider === "openai") return callOpenAI(key, r);
  if (provider === "anthropic") return callAnthropic(key, r);
  return callGoogle(key, r);
}

/** 공식 모델 목록 API로 실제 사용 가능한 모델 조회 */
export async function listModels(provider: Exclude<ProviderId, "template">): Promise<string[]> {
  const key = providerKey(provider);
  if (!key) throw new AiError("API 키가 설정되지 않았습니다.", false);
  let url = "";
  let headers: Record<string, string> = {};
  if (provider === "openai") {
    url = `${base("openai")}/v1/models`;
    headers = { authorization: `Bearer ${key}` };
  } else if (provider === "anthropic") {
    url = `${base("anthropic")}/v1/models?limit=100`;
    headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
  } else {
    url = `${base("google")}/v1beta/models?pageSize=200`;
    headers = { "x-goog-api-key": key };
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new AiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, false, res.status);
  const data = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] };
  if (provider === "google") return (data.models ?? []).map((m) => m.name.replace(/^models\//, ""));
  return (data.data ?? []).map((m) => m.id);
}
