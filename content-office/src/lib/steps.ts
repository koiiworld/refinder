// 7단계 제작 흐름 (클라이언트·서버 공용)
//  1 키워드 추천(AI) → 2 블로그별 키워드 선택(나) → 3 SEO 제목 추천·선택(AI) → 4 글 작성+해시태그(AI)
//  → 5 이미지(프롬프트는 AI, 생성은 버튼으로 Higgsfield) → 6 글·이미지 검수(AI) → 7 발행(나)

export type StepKey = "keywords" | "titles" | "writing" | "hashtags" | "review" | "carousel" | "studio" | "imageprompt" | "reelstudy" | "factcheck" | "reelscript";

export const STEP_AI_LABEL: Record<StepKey, string> = {
  keywords: "① 키워드 추천",
  titles: "③ SEO 제목 추천·선택",
  writing: "④ 글 작성",
  hashtags: "④ 해시태그 (무료 Gemini 추천)",
  review: "⑥ 글·이미지 검수",
  carousel: "📱 인스타 캐러셀 문구 (후킹)",
  studio: "🎬 영상 스튜디오 기획",
  imageprompt: "🖼 이미지 프롬프트 (영어 변환·수정·모델 추천, 무료 Gemini)",
  reelstudy: "🔍 릴스 분석 (무료 Gemini)",
  factcheck: "③-2 기획안 사실 확인 (네이버 검색 + 무료 Gemini)",
  reelscript: "🎬 릴스 AI 대본 (트렌드 반영 · Claude 최상위)",
};

// 기본 배정: 사용자 표 기준 (ChatGPT/Gemini/Claude). 쓸 수 없으면 연결된 다른 AI로 자동 대체
export const DEFAULT_STEP_AI: Record<StepKey, { provider: "openai" | "anthropic" | "google"; model: string }> = {
  keywords: { provider: "google", model: "gemini-3.5-flash" }, // 무료 Gemini 키
  titles: { provider: "openai", model: "gpt-5.4-mini" },
  writing: { provider: "openai", model: "gpt-5.4" },
  hashtags: { provider: "google", model: "gemini-3.5-flash" }, // 무료 Gemini 키
  review: { provider: "anthropic", model: "claude-sonnet-5-5" },
  carousel: { provider: "openai", model: "gpt-5.4-mini" },
  studio: { provider: "openai", model: "gpt-5.4-mini" },
  imageprompt: { provider: "google", model: "gemini-3.5-flash" }, // 무료 Gemini 키
  reelstudy: { provider: "google", model: "gemini-3.5-flash" }, // 무료 Gemini 키 (사진 함께)
  factcheck: { provider: "google", model: "gemini-3.5-flash" }, // 무료 Gemini 키 + 네이버 검색 결과
  reelscript: { provider: "anthropic", model: "claude-fable-5-2" }, // Claude 최상위 모델
};

export const FALLBACK_MODELS = {
  google: "gemini-3.5-flash",
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-5-5",
} as const;

/** 글(프로젝트) 진행 단계 */
export const POST_STAGES = [
  { key: "titles", step: 3, label: "제목 추천·선택" },
  { key: "writing", step: 4, label: "글 작성" },
  { key: "reviewing", step: 6, label: "검수" },
  { key: "ready", step: 7, label: "발행 대기" },
  { key: "published", step: 7, label: "발행 완료" },
] as const;

export const STEP_NAMES = ["키워드 추천", "키워드 선택", "SEO 제목", "글 작성", "이미지", "검수", "발행"];

export function stageLabel(stage: string, status?: string) {
  if (status === "error") return "오류";
  if (stage === "titles" && status === "waiting") return "제목·기획안 승인 대기";
  if (stage === "reviewing" && status === "waiting") return "확인·수정 후 검수 시작 대기";
  return POST_STAGES.find((s) => s.key === stage)?.label ?? "이전 방식 글";
}

/** 진행 표시용: 현재 몇 단계까지 왔는지 (3~7) */
export function stageStep(stage: string) {
  return POST_STAGES.find((s) => s.key === stage)?.step ?? 3;
}
