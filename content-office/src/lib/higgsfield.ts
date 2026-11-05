import "server-only";

/**
 * Higgsfield 공식 API (이미지·영상 생성 전용) — https://docs.higgsfield.ai
 * - 인증: Authorization: Key {KEY_ID}:{KEY_SECRET}  (서버에서만 사용)
 * - 비동기: 생성 요청 → request_id·status_url 수신 → 상태 조회 (queued → in_progress → completed/failed/nsfw/canceled)
 * - 결과: 이미지 images[].url, 영상 video.url  (Higgsfield 서버에 약 7일 보관)
 */

export const HF_ENV = "HIGGSFIELD_API_KEY"; // 형식: 키ID:시크릿 (또는 HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET)

function credentials(): string | null {
  const combined = process.env.HIGGSFIELD_API_KEY?.trim();
  if (combined && combined.includes(":")) return combined;
  const id = process.env.HIGGSFIELD_KEY_ID?.trim();
  const secret = process.env.HIGGSFIELD_KEY_SECRET?.trim();
  return id && secret ? `${id}:${secret}` : null;
}

export function hfConnected() {
  return !!credentials();
}

function base() {
  return (process.env.HIGGSFIELD_BASE_URL?.trim() || "https://api.higgsfield.ai").replace(/\/$/, "");
}

export class HiggsfieldError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

export { HF_MODELS, type HfModelId } from "./hf-models";
import { HF_MODELS } from "./hf-models";

const ERROR_TEXT: Record<number, string> = {
  400: "요청 값이 올바르지 않습니다",
  401: "Higgsfield 키가 없거나 올바르지 않습니다",
  403: "Higgsfield 잔액이 부족합니다 (콘솔에서 충전 필요)",
  404: "모델 또는 요청을 찾을 수 없습니다",
  409: "아직 처리 중입니다",
  422: "입력값 검증에 실패했습니다",
  423: "모델이 일시적으로 차단되었습니다",
  429: "대기열이 가득 찼습니다. 잠시 후 다시 시도하세요",
  500: "Higgsfield 서버 오류",
  503: "모델을 일시적으로 사용할 수 없습니다",
};

async function call(method: string, url: string, body?: unknown, idempotencyKey?: string) {
  const cred = credentials();
  if (!cred) throw new HiggsfieldError(`Higgsfield API 키가 설정되지 않았습니다 (${HF_ENV}=키ID:시크릿)`, 0, false);
  const headers: Record<string, string> = { authorization: `Key ${cred}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new HiggsfieldError(`네트워크 오류: ${(e as Error).message}`, 0, true);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* JSON 아님 */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    const msg = typeof detail === "string" ? detail : (detail as { message?: string })?.message ?? JSON.stringify(detail ?? text).slice(0, 200);
    throw new HiggsfieldError(`${ERROR_TEXT[res.status] ?? `HTTP ${res.status}`}: ${msg}`, res.status, [429, 500, 503].includes(res.status));
  }
  return data as Record<string, unknown>;
}

/** 연결 확인 (비용 없음): SOUL 스타일 목록 조회 */
export async function hfTest() {
  const data = (await call("GET", `${base()}/v1/text2image/soul-styles`)) as unknown as { name: string }[];
  return { styles: Array.isArray(data) ? data.length : 0 };
}

export interface HfSubmitResult {
  request_id: string;
  status: string;
  status_url: string;
  cancel_url: string;
}

/** 생성 전 예상 비용 (Higgsfield 견적 API, 생성·차감 없음) */
export async function hfEstimate(path: string, body: Record<string, unknown>): Promise<{ usd: number | null; credits: number | null; note?: string }> {
  const d = await call("POST", `${base()}/estimate/${path.replace(/^\//, "")}`, body);
  // 토큰 단위로 과금되는 모델은 금액 대신 설명만 돌려줌
  if (d.usd == null) return { usd: null, credits: null, note: "쓴 토큰만큼 과금 (미리 금액이 나오지 않음)" };
  return { usd: Number(d.usd), credits: Number(d.credits ?? 0) };
}

export async function hfSubmit(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<HfSubmitResult> {
  const d = await call("POST", `${base()}/${path.replace(/^\//, "")}`, body, idempotencyKey);
  const id = String(d.request_id ?? "");
  if (!id) throw new HiggsfieldError("Higgsfield 응답에 request_id가 없습니다", 0, false);
  return {
    request_id: id,
    status: String(d.status ?? "queued"),
    status_url: String(d.status_url ?? `${base()}/requests/${id}/status`),
    cancel_url: String(d.cancel_url ?? `${base()}/requests/${id}/cancel`),
  };
}

export interface HfStatus {
  status: string;
  urls: string[];
  error: string | null;
  expires_at: string | null;
}

export async function hfStatus(statusUrl: string): Promise<HfStatus> {
  const d = await call("GET", statusUrl);
  const images = Array.isArray(d.images) ? (d.images as { url?: string }[]).map((i) => i.url).filter(Boolean) : [];
  const video = (d.video as { url?: string } | undefined)?.url;
  return {
    status: String(d.status ?? "unknown"),
    urls: [...(images as string[]), ...(video ? [video] : [])],
    error: d.error ? String(d.error) : null,
    expires_at: d.expires_at ? String(d.expires_at) : null,
  };
}

export async function hfCancel(cancelUrl: string) {
  await call("POST", cancelUrl);
}

export const HF_TERMINAL = ["completed", "failed", "nsfw", "canceled"];
