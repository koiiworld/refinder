import type { AiRoles } from "./types";

type QueryFn = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const DEFAULT_MODELS = {
  openai: "gpt-5",
  anthropic: "claude-sonnet-5-5",
  google: "gemini-2.5-pro",
  template: "offline-template",
} as const;

// 기본 역할 배정: 기획=Gemini, 원고=Claude, 검수=ChatGPT, 부분수정=Claude, 글감추천=Gemini
// (설정 화면에서 블로그별로 변경 가능)
export const DEFAULT_ROLES: AiRoles = {
  planner: { provider: "google", model: DEFAULT_MODELS.google },
  writer: { provider: "anthropic", model: DEFAULT_MODELS.anthropic },
  reviewer: { provider: "openai", model: DEFAULT_MODELS.openai },
  editor: { provider: "anthropic", model: DEFAULT_MODELS.anthropic },
  ideas: { provider: "google", model: DEFAULT_MODELS.google },
};

const COMMON_RULES = [
  "확인되지 않은 수치·통계를 단정적으로 쓰지 않는다",
  "출처가 필요한 주장에는 출처를 표기하거나 '확인 필요'로 남긴다",
  "광고·협찬이 있으면 본문 상단에 명시한다",
];

const BLOGS = [
  {
    id: "blog_tistory",
    name: "티스토리 IT·생활 블로그",
    platform: "tistory",
    category: "IT·전자제품·생활정보",
    description: "IT 기기, 전자제품 리뷰와 생활 정보",
    style_guide:
      "정보 전달 중심의 '~합니다'체. 핵심 요약을 도입부에 먼저 제시하고, 스펙·가격은 표로 정리. 과장 표현 지양, 장단점을 균형 있게 서술.",
    review_rules: [...COMMON_RULES, "제품 스펙·가격은 작성일 기준임을 명시한다", "비교표를 1개 이상 포함한다"],
    image_style: "깔끔한 제품 컷, 흰 배경, 정보형 인포그래픽, 16:9",
    color: "#ea580c",
  },
  {
    id: "blog_naver_life",
    name: "네이버 육아·일상 블로그",
    platform: "naver",
    category: "육아·일상·사용 후기",
    description: "육아 경험, 일상 기록, 실사용 후기",
    style_guide:
      "친근한 '~해요'체. 직접 경험한 내용을 1인칭으로, 짧은 문단과 적절한 줄바꿈. 이모티콘은 문단당 1개 이하.",
    review_rules: [
      ...COMMON_RULES,
      "아이 건강·안전 관련 내용은 전문가 확인 권장 문구를 넣는다",
      "실제 사용하지 않은 제품을 사용한 것처럼 쓰지 않는다",
    ],
    image_style: "따뜻한 자연광 일상 사진 느낌, 파스텔 톤, 정사각형",
    color: "#16a34a",
  },
  {
    id: "blog_algokitchen",
    name: "네이버 알고키친",
    platform: "naver",
    category: "요리·레시피",
    description: "집밥 레시피와 요리 팁",
    style_guide:
      "따라 하기 쉬운 단계별 설명, '~해주세요'체. 재료는 목록과 계량(g, 큰술)으로, 조리 순서는 번호 목록으로.",
    review_rules: [
      ...COMMON_RULES,
      "재료 목록과 조리 순서의 재료가 일치하는지 확인한다",
      "조리 시간·인분을 명시한다",
    ],
    image_style: "위에서 내려다본 음식 사진, 밝은 나무 테이블, 4:5",
    color: "#dc2626",
  },
];

export async function seedIfEmpty(query: QueryFn) {
  const rows = await query("SELECT COUNT(*)::int AS n FROM blogs");
  if (Number(rows[0]?.n ?? 0) > 0) return;
  for (const b of BLOGS) {
    await query(
      `INSERT INTO blogs (id, name, platform, category, description, style_guide, review_rules, image_style, ai_roles, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [
        b.id,
        b.name,
        b.platform,
        b.category,
        b.description,
        b.style_guide,
        JSON.stringify(b.review_rules),
        b.image_style,
        JSON.stringify(DEFAULT_ROLES),
        b.color,
      ],
    );
  }
  await query(
    `INSERT INTO settings (key, value) VALUES ('app', $1) ON CONFLICT (key) DO NOTHING`,
    [
      JSON.stringify({
        fallbackToTemplate: true,
        // 1M 토큰당 USD 단가. 공식 가격표를 확인해 직접 입력하세요. (0이면 비용 미계산)
        pricing: {} as Record<string, { input: number; output: number }>,
      }),
    ],
  );
}
