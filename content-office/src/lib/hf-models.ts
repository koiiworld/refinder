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
  "wan-2.6-i2v": {
    label: "Wan 2.6 (이미지 → 영상)",
    media: "video" as const,
    path: "wan/v2.6/image-to-video",
    note: "시작 이미지 URL 필요. 5·10·15초, 제외 프롬프트 지원",
  },
} as const;
export type HfModelId = keyof typeof HF_MODELS;

export const HF_IMAGE_MODELS = (Object.keys(HF_MODELS) as HfModelId[]).filter((k) => HF_MODELS[k].media === "image").map((id) => ({ id, label: HF_MODELS[id].label, note: HF_MODELS[id].note }));
