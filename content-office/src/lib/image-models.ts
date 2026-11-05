// 이미지 생성 모델 목록 (클라이언트·서버 공용) — Higgsfield · ChatGPT(OpenAI) · Gemini(Google)
import { HF_IMAGE_MODELS } from "./hf-models";

export type ImageModel = { id: string; provider: "higgsfield" | "openai" | "google"; label: string; note: string };

export const IMAGE_MODELS: ImageModel[] = [
  ...HF_IMAGE_MODELS.map((m) => ({ id: m.id, provider: "higgsfield" as const, label: m.label, note: m.note })),
  { id: "openai:gpt-image-2.6-flare", provider: "openai", label: "GPT Image 2.6 Flare", note: "최신 · 사진 품질 높음" },
  { id: "openai:gpt-image-2.6-sunburst", provider: "openai", label: "GPT Image 2.6 Sunburst", note: "최신 · 선명한 색감" },
  { id: "openai:gpt-image-2.5-flare", provider: "openai", label: "GPT Image 2.5 Flare", note: "사진 품질 높음" },
  { id: "openai:gpt-image-2.5-sunburst", provider: "openai", label: "GPT Image 2.5 Sunburst", note: "선명한 색감" },
  { id: "openai:gpt-image-2", provider: "openai", label: "GPT Image 2", note: "글자·배치 정확" },
  { id: "openai:gpt-image-1.5", provider: "openai", label: "GPT Image 1.5", note: "이전 세대" },
  { id: "openai:gpt-image-1-mini", provider: "openai", label: "GPT Image 1 mini", note: "가장 저렴" },
  { id: "google:gemini-3-pro-image", provider: "google", label: "Gemini 3 Pro Image", note: "고품질 · 구글 결제 필요" },
  { id: "google:gemini-3.1-flash-image", provider: "google", label: "Gemini 3.1 Flash Image", note: "빠름 · 구글 결제 필요" },
  { id: "google:gemini-3.1-flash-lite-image", provider: "google", label: "Gemini 3.1 Flash-Lite Image", note: "저렴 · 구글 결제 필요" },
  { id: "google:gemini-2.5-flash-image", provider: "google", label: "Gemini 2.5 Flash Image (Nano Banana)", note: "구글 결제 필요" },
];

export const IMAGE_PROVIDER_NAMES: Record<ImageModel["provider"], string> = { higgsfield: "Higgsfield", openai: "ChatGPT (OpenAI)", google: "Gemini (Google)" };
export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id);
