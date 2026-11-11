// 단계별 AI에서 고를 수 있는 모델 목록 (클라이언트·서버 공용)
// 가격: USD / 100만 토큰 (입력, 출력), 2026-11 공개 요금 기준 — 설정의 '단가'에서 바꿀 수 있음

export type CatalogModel = { id: string; name: string; note: string; input: number; output: number };

export const MODEL_CATALOG: Record<"openai" | "anthropic" | "google", CatalogModel[]> = {
  openai: [
    { id: "gpt-6-astra", name: "GPT-6 Astra", note: "최고 성능 · 매우 비쌈", input: 10, output: 50 },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", note: "최신 고품질 · 글 작성 추천", input: 2, output: 10 },
    { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", note: "최신 · Sol의 절반 가격", input: 1, output: 5 },
    { id: "gpt-6-luna", name: "GPT-6 Luna", note: "최신 · 가장 저렴 · 키워드·제목 추천", input: 0.1, output: 0.5 },
    { id: "gpt-5.4", name: "GPT-5.4", note: "이전 세대 고품질", input: 2.5, output: 15 },
    { id: "gpt-5.4-mini", name: "GPT-5.4 mini", note: "이전 세대 · 빠르고 저렴", input: 0.75, output: 4.5 },
    { id: "gpt-5.4-nano", name: "GPT-5.4 nano", note: "이전 세대 · 저렴", input: 0.2, output: 1.25 },
  ],
  anthropic: [
    { id: "claude-fable-5-2", name: "Claude Fable 5.2", note: "최고 성능 (최신) · 비쌈", input: 8, output: 40 },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1", note: "이전 최고 성능 · 매우 비쌈", input: 10, output: 50 },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "고품질 · 릴스 대본 추천", input: 4, output: 20 },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "균형 · 검수 추천", input: 2, output: 10 },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "가장 저렴 · 빠름", input: 0.1, output: 0.5 },
  ],
  google: [
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", note: "균형 · 무료 사용량 있음", input: 1.5, output: 9 },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", note: "가장 저렴 · 무료 사용량 있음", input: 0.3, output: 2.5 },
  ],
};

/** 이미지 모델 단가 (USD / 100만 토큰, 각 사 가격표 2026-11 확인) — 이미지 출력 토큰이 비용 대부분 */
export const IMAGE_PRICING: Record<string, { input: number; output: number }> = {
  "google:gemini-3.1-flash-image": { input: 0.5, output: 60 },
  "google:gemini-3-pro-image": { input: 2, output: 120 },
  "google:gemini-3.1-flash-lite-image": { input: 0.25, output: 30 },
  "google:gemini-2.5-flash-image": { input: 0.3, output: 30 },
  "openai:gpt-image-2.6-flare": { input: 5, output: 30 },
  "openai:gpt-image-2.6-sunburst": { input: 5, output: 30 },
  "openai:gpt-image-2.5-flare": { input: 5, output: 30 },
  "openai:gpt-image-2.5-sunburst": { input: 5, output: 30 },
  "openai:gpt-image-2": { input: 5, output: 30 },
  "openai:gpt-image-1.5": { input: 5, output: 32 },
  "openai:gpt-image-1-mini": { input: 2, output: 8 },
};

export function catalogPricing() {
  const out: Record<string, { input: number; output: number }> = { ...IMAGE_PRICING };
  for (const [provider, list] of Object.entries(MODEL_CATALOG)) for (const m of list) out[`${provider}:${m.id}`] = { input: m.input, output: m.output };
  return out;
}
