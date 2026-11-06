import "server-only";
import { extractJson, runStep } from "./ai/run";
import { IMAGE_MODELS, type ImageModel } from "./image-models";

/**
 * 🖼 이미지 프롬프트 도우미 (무료 Gemini, 이미지는 만들지 않음)
 * - 한국어 프롬프트 → 영어로 바꿔서 생성 (이미지 모델은 영어를 더 잘 따름)
 * - '프롬프트 수정': 한국어로 "배경을 밤으로" 같이 적으면 영어 프롬프트를 고쳐 줌
 * - '모델 추천': 프롬프트·레퍼런스 유무를 보고 연결된 모델 중 3개 추천
 */
export const hasHangul = (s: string) => /[ㄱ-힝]/.test(s);

const SYS = "You are an expert prompt writer for AI image generators (Gemini Image, GPT Image, Higgsfield SOUL, Ideogram, Recraft, Qwen, Grok). Answer only with JSON.";

/** 한국어가 섞여 있으면 영어 이미지 프롬프트로 (화면에 넣을 한글 문구는 따옴표 안 그대로) */
export async function toEnglishPrompt(prompt: string, projectId?: string | null) {
  const p = prompt.trim();
  if (!hasHangul(p)) return { prompt: p, translated: false };
  const r = await runStep({
    step: "imageprompt", role: "ideas", purpose: "image_prompt_translate", blog: null, projectId: projectId ?? null, system: SYS, json: true, maxTokens: 1200, retries: 0,
    prompt: `Rewrite this image prompt in natural, detailed English for an image generator. Keep every visual detail and meaning. If the user wants Korean text to appear inside the image, keep that text in Korean inside double quotes. Do not add new subjects.\n\nPrompt:\n${p}\n\nReturn {"prompt": "..."}`,
    template: () => JSON.stringify({ prompt: p }),
  });
  const out = String(extractJson<{ prompt?: string }>(r.text).prompt ?? "").trim();
  return out && !hasHangul(out.replace(/"[^"]*"/g, "")) ? { prompt: out.slice(0, 4000), translated: true } : { prompt: p, translated: false };
}

/** 프롬프트 수정: 지금 영어 프롬프트 + 한국어 요청 → 고친 영어 프롬프트 */
export async function editPrompt(prompt: string, request: string, projectId?: string | null) {
  const req = request.trim();
  if (!req) throw new Error("어떻게 바꿀지 적어 주세요.");
  const r = await runStep({
    step: "imageprompt", role: "ideas", purpose: "image_prompt_edit", blog: null, projectId: projectId ?? null, system: SYS, json: true, maxTokens: 1500, retries: 0,
    prompt: `Current image prompt:\n${prompt.trim() || "(empty)"}\n\nUser's change request (may be Korean):\n${req}\n\nApply the request and return the full revised prompt in detailed English. Keep everything the user did not ask to change. Korean text meant to appear inside the image stays in Korean inside double quotes. Also give a one-line Korean summary of what changed.\nReturn {"prompt": "...", "changed": "..."}`,
    template: () => JSON.stringify({ prompt, changed: "" }),
  });
  const j = extractJson<{ prompt?: string; changed?: string }>(r.text);
  const out = String(j.prompt ?? "").trim();
  if (!out) throw new Error("프롬프트를 고치지 못했어요. 다시 눌러 주세요.");
  return { prompt: out.slice(0, 4000), changed: String(j.changed ?? "").slice(0, 200) };
}

/** 규칙으로 고르는 기본 추천 (AI가 안 될 때) */
function ruleRecommend(prompt: string, models: ImageModel[], refs: number) {
  const p = prompt.toLowerCase();
  const score = (m: ImageModel) => {
    let s = 0;
    if (/text|typography|poster|sign|logo|"[^"]+"/.test(p) && /ideogram|ads-studio|gpt-image|recraft/.test(m.id)) s += 3;
    if (/character|mascot|person|portrait|woman|man|girl|boy/.test(p) && /soul|gemini|gpt-image/.test(m.id)) s += 2;
    if (/icon|diagram|infographic|flat|illustration|vector/.test(p) && /recraft/.test(m.id)) s += 3;
    if (/product|advert|marketing|package/.test(p) && /marketing|ads-studio/.test(m.id)) s += 3;
    if (refs > 0 && m.refs > 0) s += 2;
    if (/mini|lite|turbo|v2|cinema/.test(m.id)) s += 0.5;
    return s;
  };
  return models.slice().sort((a, b) => score(b) - score(a)).slice(0, 3).map((m) => ({ id: m.id, reason: m.note }));
}

/** 모델 추천: 연결된 모델 중 3개 + 이유(한국어) */
export async function recommendModels(input: { prompt: string; refs: number; providers: Record<string, boolean>; projectId?: string | null }) {
  const models = IMAGE_MODELS.filter((m) => input.providers[m.provider]);
  if (!models.length) throw new Error("연결된 이미지 AI가 없어요.");
  const list = models.map((m) => `- ${m.id}: ${m.label} — ${m.note}${m.refs ? ` · reference images up to ${m.refs}` : " · no reference images"}`).join("\n");
  try {
    const r = await runStep({
      step: "imageprompt", role: "ideas", purpose: "image_model_recommend", blog: null, projectId: input.projectId ?? null, system: SYS, json: true, maxTokens: 800, retries: 0,
      prompt: `Pick the 3 best models for this image request. Consider quality for the subject, text rendering, character consistency${input.refs ? `, and that the user attached ${input.refs} reference image(s) (prefer models that accept references)` : ""}, and price (cheaper when quality is similar).\n\nPrompt:\n${input.prompt}\n\nAvailable models:\n${list}\n\nReturn {"picks": [{"id": "<model id from the list>", "reason": "<one short Korean sentence>"}]}`,
      template: () => JSON.stringify({ picks: ruleRecommend(input.prompt, models, input.refs) }),
    });
    const picks = (extractJson<{ picks?: { id?: string; reason?: string }[] }>(r.text).picks ?? [])
      .filter((x) => x.id && models.some((m) => m.id === x.id))
      .slice(0, 3)
      .map((x) => ({ id: String(x.id), reason: String(x.reason ?? "").slice(0, 120) }));
    return picks.length ? picks : ruleRecommend(input.prompt, models, input.refs);
  } catch {
    return ruleRecommend(input.prompt, models, input.refs);
  }
}
