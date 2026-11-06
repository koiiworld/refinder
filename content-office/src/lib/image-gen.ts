import "server-only";
import crypto from "node:crypto";
import { q, q1, newId } from "./db";

/**
 * ChatGPT(OpenAI Images API)·Gemini(이미지 출력) 로 바로 생성 → DB에 저장 → /api/img/<아이디> 로 공개
 * - Higgsfield 와 달리 응답에 이미지 파일이 바로 옴 (기다림 10~60초)
 */

export class ImageGenError extends Error {}

const openaiBase = () => (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com").replace(/\/$/, "");
const googleBase = () => (process.env.GOOGLE_AI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com").replace(/\/$/, "");

/** OpenAI 는 정해진 크기만 받음: 세로·가로·정사각 */
function openaiSize(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h || w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}
const GEMINI_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

async function viaOpenAI(model: string, prompt: string, aspect: string, refs: { mime: string; data: Buffer }[] = []) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ImageGenError("ChatGPT(OpenAI) 키가 없습니다.");
  let res: Response;
  if (refs.length) {
    // 레퍼런스가 있으면 편집(edits) 주소로 사진과 함께 보냄
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", prompt);
    fd.append("size", openaiSize(aspect));
    fd.append("quality", "medium");
    fd.append("output_format", "jpeg");
    fd.append("n", "1");
    refs.forEach((r, i) => fd.append("image[]", new Blob([new Uint8Array(r.data)], { type: r.mime }), `ref${i + 1}.${r.mime.split("/")[1] || "png"}`));
    res = await fetch(`${openaiBase()}/v1/images/edits`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(180_000) });
  } else {
    res = await fetch(`${openaiBase()}/v1/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, size: openaiSize(aspect), quality: "medium", output_format: "jpeg", output_compression: 88, n: 1 }),
      signal: AbortSignal.timeout(180_000),
    });
  }
  const d = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!res.ok || d.error) throw new ImageGenError(`ChatGPT 이미지 오류: ${d.error?.message ?? res.status}`);
  const b64 = d.data?.[0]?.b64_json;
  if (!b64) throw new ImageGenError("ChatGPT가 이미지를 돌려주지 않았습니다.");
  return { mime: "image/jpeg", data: Buffer.from(b64, "base64"), inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0 };
}

async function viaGoogle(model: string, prompt: string, aspect: string, refs: { mime: string; data: Buffer }[] = []) {
  const key = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!key) throw new ImageGenError("Gemini(Google) 키가 없습니다.");
  const res = await fetch(`${googleBase()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      // 참고 이미지(캐릭터 등)를 먼저 넣고 지시문 → 같은 인물·스타일 유지
      contents: [{ parts: [...refs.map((r) => ({ inlineData: { mimeType: r.mime, data: r.data.toString("base64") } })), { text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: GEMINI_ASPECTS.includes(aspect) ? aspect : "1:1" } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; error?: { message?: string } };
  if (!res.ok || d.error) {
    const msg = d.error?.message ?? String(res.status);
    if (/free_tier|limit: 0|quota/i.test(msg)) throw new ImageGenError("Gemini 이미지 모델은 무료 등급에서 쓸 수 없습니다. Google AI Studio에서 결제(Billing)를 켜면 사용할 수 있어요.");
    throw new ImageGenError(`Gemini 이미지 오류: ${msg.slice(0, 200)}`);
  }
  const part = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new ImageGenError("Gemini가 이미지를 돌려주지 않았습니다 (안전 필터에 걸렸을 수 있어요).");
  return { mime: part.inlineData.mimeType || "image/png", data: Buffer.from(part.inlineData.data, "base64"), inputTokens: d.usageMetadata?.promptTokenCount ?? 0, outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0 };
}

/** 생성 → 저장 → 이미지 아이디 */
export async function generateDirect(input: { modelId: string; prompt: string; aspect: string; projectId: string; blogId?: string | null; refs?: { mime: string; data: Buffer }[] }) {
  const [provider, model] = input.modelId.split(":");
  if (!input.prompt.trim()) throw new ImageGenError("프롬프트가 비어 있습니다.");
  const started = Date.now();
  let out;
  try {
    out = provider === "openai" ? await viaOpenAI(model, input.prompt, input.aspect, input.refs ?? []) : provider === "google" ? await viaGoogle(model, input.prompt, input.aspect, input.refs ?? []) : null;
  } catch (e) {
    await logRun(input, provider, model, "failed", 0, 0, Date.now() - started, (e as Error).message);
    throw e;
  }
  if (!out) throw new ImageGenError("지원하지 않는 이미지 모델입니다.");
  // 추측하기 어려운 아이디 (주소를 아는 사람만 볼 수 있게)
  const id = `img_${crypto.randomBytes(12).toString("hex")}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, input.projectId, provider, model, out.mime, out.data, input.prompt.slice(0, 4000)]);
  await logRun(input, provider, model, "succeeded", out.inputTokens, out.outputTokens, Date.now() - started, null);
  return id;
}

async function logRun(input: { projectId: string; blogId?: string | null }, provider: string, model: string, status: string, inT: number, outT: number, ms: number, error: string | null) {
  try {
    // 비용 = 토큰 × 단가 (설정의 단가표, 이미지 모델 기본값 포함) — 예전엔 0으로 기록돼 사용량에 안 잡혔음
    const { getSettings } = await import("./settings");
    const pr = (await getSettings()).pricing[`${provider}:${model}`];
    const cost = pr && status === "succeeded" ? (inT * pr.input + outT * pr.output) / 1_000_000 : 0;
    await q(
      `INSERT INTO ai_runs (id, project_id, blog_id, purpose, provider, model, status, attempt, input_tokens, output_tokens, cost_usd, duration_ms, error)
       VALUES ($1,$2,$3,'image',$4,$5,$6,1,$7,$8,$9,$10,$11)`,
      [newId("run_"), input.projectId, input.blogId ?? null, provider, model, status, inT, outT, cost, ms, error],
    );
  } catch {
    /* 기록 실패는 무시 */
  }
}

export async function getGeneratedImage(id: string) {
  return q1<{ mime: string; data: Buffer | Uint8Array; provider: string }>("SELECT mime, data, provider FROM generated_images WHERE id=$1", [id]);
}
