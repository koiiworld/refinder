// 프롬프트 수정실: 대상 AI × 용도별 작성 지침 (클라이언트·서버 공용)

export type PromptTarget = "gpt" | "claude" | "gemini" | "higgsfield";
export type PromptKind = "visual" | "writing" | "info";
export type PromptMedia = "image" | "video";

export const TARGETS: { id: PromptTarget; label: string; desc: string }[] = [
  { id: "gpt", label: "ChatGPT", desc: "OpenAI · 글, 이미지(GPT Image), 영상(Sora)" },
  { id: "claude", label: "Claude", desc: "Anthropic · 글, 분석 (이미지 생성 불가)" },
  { id: "gemini", label: "Gemini", desc: "Google · 글, 이미지(Nano Banana/Imagen), 영상(Veo)" },
  { id: "higgsfield", label: "Higgsfield", desc: "이미지·영상 생성 전용" },
];

export const KINDS: { id: PromptKind; label: string; desc: string }[] = [
  { id: "visual", label: "이미지·영상", desc: "그림·사진·영상 생성" },
  { id: "writing", label: "글 원고", desc: "블로그 글, 캡션, 긴 원고" },
  { id: "info", label: "정보 전달", desc: "질문, 요약, 조사, 설명" },
];

/** 대상 AI가 해당 용도를 지원하는지 */
export function supports(target: PromptTarget, kind: PromptKind): { ok: boolean; reason?: string } {
  if (target === "claude" && kind === "visual")
    return { ok: false, reason: "Claude는 이미지·영상을 생성하지 않습니다. 이미지 프롬프트는 ChatGPT·Gemini·Higgsfield를 선택하세요." };
  if (target === "higgsfield" && kind !== "visual")
    return { ok: false, reason: "Higgsfield는 이미지·영상 생성 전용입니다." };
  return { ok: true };
}

export interface Guide {
  title: string;
  structure: string; // 권장 구조
  tips: string[]; // 화면에 보여줄 요령
  avoid: string[]; // 피할 것
  language: "en" | "ko"; // 최종 프롬프트 권장 언어
  negative: boolean; // 제외 프롬프트(negative) 사용 여부
}

const VISUAL_COMMON_AVOID = [
  "'예쁘게', '고화질' 같은 막연한 형용사만 나열하기",
  "한 장면(클립)에 여러 동작·장면 전환 넣기",
  "화면 속 긴 글자, 손으로 하는 복잡한 동작, 많은 인물",
];

const GUIDES: Record<string, Guide> = {
  // ───────── 이미지 ─────────
  "gpt:visual:image": {
    title: "ChatGPT 이미지 (GPT Image)",
    structure: "장면을 설명하는 자연스러운 문장: 주체 → 배경 → 구도·화각 → 조명 → 스타일 → 비율",
    tips: [
      "키워드 나열보다 '무엇이 어디에 어떻게 있는지' 문장으로 설명하면 정확도가 올라갑니다",
      "이미지 안에 들어갈 글자는 큰따옴표로 정확히 적고, 글꼴·위치를 지정하세요",
      "비율(정사각형 1:1, 세로 2:3, 가로 3:2)을 명시하세요",
      "수정할 때는 새로 쓰지 말고 '배경만 바꿔줘'처럼 바꿀 부분만 지시하세요",
    ],
    avoid: VISUAL_COMMON_AVOID,
    language: "en",
    negative: false,
  },
  "gemini:visual:image": {
    title: "Gemini 이미지 (Nano Banana / Imagen)",
    structure: "서술형 문단: 주체·행동 → 장소 → 카메라(렌즈·앵글) → 조명 → 분위기·스타일",
    tips: [
      "키워드 목록보다 장면을 이야기하듯 묘사하는 문단이 잘 통합니다",
      "사진 용어(85mm portrait lens, low angle, golden hour, shallow depth of field)를 쓰면 사진처럼 나옵니다",
      "기존 이미지 편집 시 '유지할 것'과 '바꿀 것'을 나눠 적으세요",
      "인물·제품을 여러 장에서 일관되게 하려면 참조 이미지를 함께 넣으세요",
    ],
    avoid: VISUAL_COMMON_AVOID,
    language: "en",
    negative: false,
  },
  "higgsfield:visual:image": {
    title: "Higgsfield 이미지",
    structure: "[주체] + [배경] + [구도·카메라] + [조명] + [스타일·품질] (영어)",
    tips: [
      "영어로 작성하세요. 모델 대부분이 영어 프롬프트를 가장 정확히 이해합니다",
      "영상으로 만들 계획이라면 이 이미지를 시작 장면으로 쓰도록 구도를 미리 잡으세요",
      "제외할 요소(negative)를 함께 적으면 손가락·변형 문제가 줄어듭니다",
      "같은 인물을 반복하려면 캐릭터 참조 기능을 쓰세요",
    ],
    avoid: VISUAL_COMMON_AVOID,
    language: "en",
    negative: true,
  },
  // ───────── 영상 ─────────
  "gpt:visual:video": {
    title: "ChatGPT 영상 (Sora)",
    structure: "샷 단위: 주체·동작 1개 → 배경 → 카메라 움직임 → 조명 → 스타일 → 길이",
    tips: [
      "한 샷에 동작 하나만 넣고, 여러 장면은 샷을 나눠 따로 만드세요",
      "카메라 움직임을 명시하세요 (static shot, slow dolly in, pan left)",
      "움직임 속도(slowly, gently)를 적으면 형태가 무너지는 현상이 줄어듭니다",
    ],
    avoid: VISUAL_COMMON_AVOID,
    language: "en",
    negative: false,
  },
  "gemini:visual:video": {
    title: "Gemini 영상 (Veo)",
    structure: "주체 → 동작 → 배경 → 카메라 움직임 → 분위기·조명 → (소리)",
    tips: [
      "카메라 움직임과 앵글을 영화 용어로 지정하세요 (tracking shot, aerial view, close-up)",
      "소리가 함께 생성되는 모델이면 효과음·대사를 따옴표로 지정할 수 있습니다",
      "시작 이미지를 넣으면 구도·색감이 안정됩니다",
    ],
    avoid: VISUAL_COMMON_AVOID,
    language: "en",
    negative: true,
  },
  "higgsfield:visual:video": {
    title: "Higgsfield 영상",
    structure: "[주체] + [동작 1개] + [배경] + [카메라 움직임] + [조명·분위기] + [스타일] (영어)",
    tips: [
      "가장 효과가 큰 방법: 마음에 드는 이미지를 먼저 만들고 → 이미지를 영상으로 움직이기(Image-to-Video)",
      "한 클립(5~10초)에 동작 하나만. 여러 장면은 클립을 나눠 만들고 편집으로 이어 붙이세요",
      "카메라 움직임은 글보다 Higgsfield의 카메라 프리셋을 고르는 쪽이 정확합니다",
      "slowly, gently, subtle movement로 속도를 낮추면 녹아내림·변형이 줄어듭니다",
      "음식은 김(steam), 붓기(pouring), 치즈 늘어남(cheese pull)이 잘 나오고, 손으로 조리하는 과정은 잘 안 나옵니다",
    ],
    avoid: [...VISUAL_COMMON_AVOID, "빠르고 큰 움직임, 카메라와 피사체가 동시에 크게 움직이는 장면"],
    language: "en",
    negative: true,
  },
  // ───────── 글 원고 ─────────
  "gpt:writing": {
    title: "ChatGPT 글 원고",
    structure: "역할 → 목표·독자 → 자료 → 지시사항 → 형식·분량 → 문체 예시",
    tips: [
      "누가(역할), 누구에게(독자), 무엇을 위해(목표) 쓰는지 먼저 밝히세요",
      "분량(예: 2,000자), 소제목 수, 표·목록 사용 여부 같은 출력 형식을 숫자로 정하세요",
      "원하는 문체의 예시 문단을 1~2개 붙이면 말투가 정확해집니다",
      "확인되지 않은 정보는 [확인 필요]로 표시하라고 지시하세요",
    ],
    avoid: ["'잘 써줘'처럼 기준 없는 요청", "자료 없이 수치·최신 정보를 요구하기"],
    language: "ko",
    negative: false,
  },
  "claude:writing": {
    title: "Claude 글 원고",
    structure: "<context>배경·자료</context> → <instructions>지시</instructions> → <format>형식</format> → <example>예시</example>",
    tips: [
      "자료·지시·예시를 XML 태그로 구분하면 Claude가 정확히 구분해 따릅니다",
      "긴 참고 자료는 앞에, 지시는 뒤에 두세요",
      "규칙에는 '왜' 그래야 하는지 이유를 함께 쓰면 더 잘 지킵니다",
      "하지 말아야 할 것보다 해야 할 것을 적극적으로 쓰세요 (예: '짧은 문단으로 쓴다')",
    ],
    avoid: ["태그 없이 자료와 지시를 섞어 쓰기", "모호한 분량·형식"],
    language: "ko",
    negative: false,
  },
  "gemini:writing": {
    title: "Gemini 글 원고",
    structure: "작업 → 맥락·자료 → 제약 조건 → 출력 형식 → 예시",
    tips: [
      "작업을 첫 문장에 한 줄로 명확히 쓰세요",
      "긴 자료를 줄 때는 자료를 먼저, 질문·지시는 맨 끝에 두세요",
      "좋은 예시(few-shot)를 1~3개 주면 형식과 말투가 안정됩니다",
      "출력 형식(소제목, 표, 글자 수)을 구체적으로 지정하세요",
    ],
    avoid: ["여러 작업을 한 문장에 섞기", "형식 지정 없이 '알아서' 맡기기"],
    language: "ko",
    negative: false,
  },
  // ───────── 정보 전달 ─────────
  "gpt:info": {
    title: "ChatGPT 정보 질문",
    structure: "질문 → 배경(내 상황) → 범위·기준 시점 → 답변 형식 → 근거 요청",
    tips: [
      "내 상황을 한두 줄 설명하면 일반론이 아닌 맞춤 답이 나옵니다",
      "최신 정보가 필요하면 '웹 검색해서 출처와 날짜를 함께'라고 요청하세요",
      "답변 형식(3줄 요약, 표 비교, 단계별)을 지정하세요",
      "'확실하지 않으면 모른다고 답해'를 넣으면 지어내기가 줄어듭니다",
    ],
    avoid: ["범위가 너무 넓은 질문", "출처 없는 수치를 그대로 믿기"],
    language: "ko",
    negative: false,
  },
  "claude:info": {
    title: "Claude 정보 질문",
    structure: "<question>질문</question> → <context>내 상황·자료</context> → 원하는 답변 형식",
    tips: [
      "문서·자료를 함께 줄 때는 태그로 감싸고 '자료에 근거해서만 답해'라고 지시하세요",
      "답변 전에 관련 내용을 인용하게 하면 정확도가 올라갑니다",
      "모르면 모른다고 말해도 된다고 명시하세요",
    ],
    avoid: ["자료와 질문을 구분 없이 섞기"],
    language: "ko",
    negative: false,
  },
  "gemini:info": {
    title: "Gemini 정보 질문",
    structure: "질문 → 맥락 → 범위·기준 시점 → 답변 형식",
    tips: [
      "최신 정보가 필요하면 Google 검색 연동(Grounding)을 켜거나 '검색해서 출처와 함께'라고 요청하세요",
      "비교 질문은 비교 기준(가격, 크기, 장단점)을 미리 정해 주세요",
      "답변 길이·형식을 지정하세요",
    ],
    avoid: ["기준 시점 없이 '요즘', '최신'만 쓰기"],
    language: "ko",
    negative: false,
  },
};

export function guideKey(target: PromptTarget, kind: PromptKind, media: PromptMedia = "image") {
  return kind === "visual" ? `${target}:visual:${media}` : `${target}:${kind}`;
}

export function getGuide(target: PromptTarget, kind: PromptKind, media: PromptMedia = "image"): Guide | null {
  return GUIDES[guideKey(target, kind, media)] ?? null;
}

export const TARGET_LABEL: Record<PromptTarget, string> = Object.fromEntries(TARGETS.map((t) => [t.id, t.label])) as Record<PromptTarget, string>;
export const KIND_LABEL: Record<PromptKind, string> = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<PromptKind, string>;

export interface RefineResult {
  prompt: string; // 대상 AI에 그대로 붙여 넣을 최종 프롬프트
  promptKo: string; // 영어 프롬프트일 때 한국어 해석
  negative: string; // 제외 프롬프트 (해당 시)
  changes: string[]; // 무엇을 왜 바꿨는지
  questions: string[]; // 더 정확해지려면 사용자가 정해야 할 것
  settings: string[]; // 생성 화면에서 고를 설정 (비율, 길이, 카메라 프리셋 등)
}
