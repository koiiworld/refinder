// Higgsfield 모델 목록 (클라이언트·서버 공용)
/** 공식 문서에서 요청 형식(스키마)을 확인한 모델 */
export const HF_MODELS = {
  "soul-standard": {
    label: "SOUL",
    media: "image" as const,
    path: "higgsfield-ai/soul/standard",
    note: "Higgsfield 기본 사진 모델",
  },
  "soul-v2": {
    label: "SOUL V2",
    media: "image" as const,
    path: "higgsfield-ai/soul/v2/standard",
    note: "SOUL 새 버전 · 저렴",
  },
  "soul-cinema": {
    label: "SOUL Cinema",
    media: "image" as const,
    path: "higgsfield-ai/soul/cinema",
    note: "영화 같은 색감 · 저렴",
  },
  "qwen-image-3": {
    label: "Qwen Image 3",
    media: "image" as const,
    path: "alibaba/qwen-image-3/text-to-image",
    note: "알리바바 · 프롬프트를 잘 따름",
  },
  "ideogram-4": {
    label: "Ideogram 4.0",
    media: "image" as const,
    path: "ideogram/v4.0",
    note: "글자가 들어간 이미지에 강함",
  },
  "z-image-turbo": {
    label: "Z-Image Turbo",
    media: "image" as const,
    path: "z-image/turbo",
    note: "빠르고 저렴",
  },
  "recraft-4.1": { label: "Recraft V4.1", media: "image" as const, path: "recraft/v4.1/text-to-image", note: "디자인·일러스트에 강함 · 1K" },
  "recraft-4.1-pro": { label: "Recraft V4.1 Pro", media: "image" as const, path: "recraft/v4.1/pro/text-to-image", note: "Recraft 고해상도 · 2K" },
  "recraft-4.1-utility": { label: "Recraft V4.1 Utility", media: "image" as const, path: "recraft/v4.1/utility/text-to-image", note: "아이콘·도식·정보 이미지 · 1K" },
  "recraft-4.1-utility-pro": { label: "Recraft V4.1 Utility Pro", media: "image" as const, path: "recraft/v4.1/utility/pro/text-to-image", note: "Utility 고해상도 · 2K" },
  "grok-image-2": { label: "Grok Image 2.0", media: "image" as const, path: "xai/grok-imagine-image-2.0", note: "xAI · 2K" },
  "marketing-image-2": { label: "Marketing Studio 2.0", media: "image" as const, path: "marketing-studio/image", note: "제품·광고 사진 · 2K" },
  "marketing-image-flare": { label: "Marketing Studio 2.5 Flare", media: "image" as const, path: "marketing-studio/image/flare", note: "GPT Image 2.5 Flare 기반 · 2K" },
  "marketing-image-sunburst": { label: "Marketing Studio 2.5 Sunburst", media: "image" as const, path: "marketing-studio/image/sunburst", note: "GPT Image 2.5 Sunburst 기반 · 2K" },
  "ads-studio": { label: "Ads Studio", media: "image" as const, path: "higgsfield/ads-studio/v1.0", note: "광고 이미지 (글자 들어감) · 2K" },
  "wan-2.6-i2v": {
    label: "Wan 2.6 (이미지 → 영상)",
    media: "video" as const,
    path: "wan/v2.6/image-to-video",
    note: "시작 이미지 URL 필요. 5·10·15초, 제외 프롬프트 지원",
  },
} as const;
export type HfModelId = keyof typeof HF_MODELS;

export const HF_IMAGE_MODELS = (Object.keys(HF_MODELS) as HfModelId[]).filter((k) => HF_MODELS[k].media === "image").map((id) => ({ id, label: HF_MODELS[id].label, note: HF_MODELS[id].note }));
