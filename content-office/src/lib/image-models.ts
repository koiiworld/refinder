// 이미지 생성 모델 목록 (클라이언트·서버 공용) — Higgsfield · ChatGPT(OpenAI) · Gemini(Google)
import { HF_IMAGE_MODELS } from "./hf-models";

/** refs: 레퍼런스 이미지를 몇 장까지 받는지 (0 = 못 받음, 스타일 문구만 반영) · soul: Higgsfield Soul ID(내 캐릭터) 사용 가능 */
export type ImageModel = { id: string; provider: "higgsfield" | "openai" | "google"; label: string; note: string; refs: number; soul: boolean };

/** Higgsfield 공식 문서 기준 (2026-11 확인): SOUL 1장+Soul ID, SOUL V2·Cinema는 Soul ID만, Qwen 편집 3장, Grok 10장(앱에선 5장), Ideogram 1장 */
const HF_REFS: Record<string, number> = { "soul-standard": 1, "qwen-image-3": 3, "grok-image-2": 5, "ideogram-4": 1 };
const HF_SOUL = ["soul-standard", "soul-v2", "soul-cinema"];

export const IMAGE_MODELS: ImageModel[] = [
  ...HF_IMAGE_MODELS.map((m) => ({ id: m.id, provider: "higgsfield" as const, label: m.label, note: m.note, refs: HF_REFS[m.id] ?? 0, soul: HF_SOUL.includes(m.id) })),
  { id: "openai:gpt-image-2.6-flare", provider: "openai", label: "GPT Image 2.6 Flare", note: "최신 · 사진 품질 높음", refs: 5, soul: false },
  { id: "openai:gpt-image-2.6-sunburst", provider: "openai", label: "GPT Image 2.6 Sunburst", note: "최신 · 선명한 색감", refs: 5, soul: false },
  { id: "openai:gpt-image-2.5-flare", provider: "openai", label: "GPT Image 2.5 Flare", note: "사진 품질 높음", refs: 5, soul: false },
  { id: "openai:gpt-image-2.5-sunburst", provider: "openai", label: "GPT Image 2.5 Sunburst", note: "선명한 색감", refs: 5, soul: false },
  { id: "openai:gpt-image-2", provider: "openai", label: "GPT Image 2", note: "글자·배치 정확", refs: 5, soul: false },
  { id: "openai:gpt-image-1.5", provider: "openai", label: "GPT Image 1.5", note: "이전 세대", refs: 5, soul: false },
  { id: "openai:gpt-image-1-mini", provider: "openai", label: "GPT Image 1 mini", note: "가장 저렴", refs: 5, soul: false },
  { id: "google:gemini-3-pro-image", provider: "google", label: "Gemini 3 Pro Image", note: "고품질 · 구글 결제 필요", refs: 5, soul: false },
  { id: "google:gemini-3.1-flash-image", provider: "google", label: "Gemini 3.1 Flash Image", note: "빠름 · 구글 결제 필요", refs: 5, soul: false },
  { id: "google:gemini-3.1-flash-lite-image", provider: "google", label: "Gemini 3.1 Flash-Lite Image", note: "저렴 · 구글 결제 필요", refs: 5, soul: false },
  { id: "google:gemini-2.5-flash-image", provider: "google", label: "Gemini 2.5 Flash Image (Nano Banana)", note: "구글 결제 필요", refs: 5, soul: false },
];

export const IMAGE_PROVIDER_NAMES: Record<ImageModel["provider"], string> = { higgsfield: "Higgsfield", openai: "ChatGPT (OpenAI)", google: "Gemini (Google)" };
export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id);
