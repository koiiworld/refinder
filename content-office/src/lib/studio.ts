import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, q1, newId, j } from "./db";
import { extractJson, runStep } from "./ai/run";
import { generateDirect, getGeneratedImage } from "./image-gen";
import { createMediaJob, estimateMedia, refreshMediaJob } from "./media";
import { addVideoFile, ffmpegPath, probe } from "./videos";
import { spawn } from "node:child_process";

/**
 * 🎬 영상 제작 스튜디오 (쇼츠·릴스)
 * ① 프롬프트 → AI 기획(콘셉트·캐릭터·장면별 화면/움직임/자막)
 * ② 캐릭터 이미지 (Gemini·ChatGPT) — 버튼을 눌러야 생성
 * ③ 장면 이미지 (캐릭터 이미지를 참고로 넣어 같은 인물 유지)
 * ④ 장면 영상 (Higgsfield Wan 2.6 이미지→영상, 예상 비용 먼저 보여 줌)
 * ⑤ 합치기 (ffmpeg: 9:16 · 자막 얹기) → 영상공장에 저장 → 편집기
 */

export type StudioImage = { id?: string; url?: string; model?: string; status?: "running" | "done" | "error"; error?: string };
export type StudioClip = { jobId?: string; url?: string; status?: string; error?: string; usd?: number | null };
export type StudioScene = { n: number; seconds: number; visual: string; motion: string; caption: string; narration: string; image: StudioImage; video: StudioClip };
export type StudioPlan = { title: string; concept: string; hook: string; caption: string; hashtags: string[]; style: string; ai?: string };
export type StudioCharacter = { name: string; description: string; prompt: string; image: StudioImage };
export type StudioOptions = { subjectMode?: "food"|"character"; seconds: number; style: string; aspect: "9:16"; imageModel: string; clipSeconds: 5 | 10; resolution: "480p" | "720p" | "1080p"; captions: boolean; lockCharacter?: string; seriesId?: string; episode?: number };
export type StudioProject = { id: string; title: string; prompt: string; options: StudioOptions; plan: StudioPlan; character: StudioCharacter; scenes: StudioScene[]; video_id: string | null; status: string; message: string; created_at: string; updated_at: string };

export const STUDIO_STYLES = [
  { id: "real", label: "실사 사진", prompt: "photorealistic, natural lighting, shot on a modern smartphone camera, vertical framing" },
  { id: "3d", label: "3D 캐릭터", prompt: "cute 3D animated character style, soft studio lighting, Pixar-like rendering, vertical framing" },
  { id: "anime", label: "애니메이션", prompt: "clean Japanese anime illustration style, vibrant colors, vertical framing" },
  { id: "illust", label: "일러스트", prompt: "flat modern illustration, pastel colors, simple shapes, vertical framing" },
] as const;

const DEFAULT_OPTIONS: StudioOptions = { seconds: 20, style: "3d", aspect: "9:16", imageModel: "google:gemini-3.1-flash-image", clipSeconds: 5, resolution: "720p", captions: true };

export async function listStudio() {
  return q<StudioProject>("SELECT * FROM studio_projects ORDER BY updated_at DESC LIMIT 100");
}
export async function getStudio(id: string) {
  return q1<StudioProject>("SELECT * FROM studio_projects WHERE id=$1", [id]);
}
async function save(id: string, patch: Partial<StudioProject>) {
  const keys = Object.keys(patch) as (keyof StudioProject)[];
  if (!keys.length) return;
  const json = new Set(["options", "plan", "character", "scenes"]);
  await q(`UPDATE studio_projects SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (json.has(k) ? j(patch[k]) : patch[k]))]);
}

/** 이 서버 밖(Higgsfield)에서 이미지를 읽을 수 있는 공개 주소 */
async function publicBase(fallback?: string) {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const r = await q1<{ value: { url?: string } }>("SELECT value FROM settings WHERE key='worker_render'");
  return (r?.value?.url ?? fallback ?? "").replace(/\/$/, "");
}

/** 원래 입력은 보존하고 새 문구·장면 구성 안만 제안. 프로젝트/이미지/영상 생성 없음. */
export async function rewriteStudioIdea(input:{prompt:string;feedback?:string;seconds?:number;style?:string;subjectMode?:string}){
  const original=String(input.prompt??'').trim().slice(0,2000);if(!original)throw new Error('다시 만들 영상 아이디어를 먼저 넣어 주세요.');
  const system='당신은 영상 아이디어 재구성 편집자입니다. 과장 없이 구체적인 후킹·자막·내레이션과 장면 순서를 새로 제안합니다. 반드시 JSON 객체 하나만 출력합니다.';
  const prompt=`[기존 문구·구성]\n${original}\n[수정 요청] ${String(input.feedback??'문구와 장면 순서를 새로 구성해 주세요.').slice(0,1000)}\n[길이] ${Number(input.seconds)||20}초\n[그림체] ${String(input.style??'realistic').slice(0,100)}\n${input.subjectMode==='food'?'음식 클로즈업 모드: 음식과 조리 과정만. 사람·손·얼굴·캐릭터·마스코트는 넣지 마세요.':''}\n주제·사실·재료·제품 정보는 유지하면서 표현과 전개를 바꾸세요. 기존 자막·대사를 조금만 바꾸거나 그대로 반복하지 마세요. 첫 장면 후킹→핵심 정보→마무리의 흐름을 구체적으로 새로 만들고 각 장면에 화면·대사·자막을 적으세요. 과장·근거 없는 효과·추가 사실은 금지. 요청 길이에 맞는 3~6장면을 제안하세요. 한국어로 쓰고 prompt 전체는 1,800자 이내로 간결하게. 형식: {"prompt":"장면별 새 화면·대사·자막","changes":["달라진 점"]}`;
  const res=await runStep({step:'studio',purpose:'studio-idea-rewrite',blog:null,system,prompt,json:true,maxTokens:2200,retries:0,noFallback:true});
  const raw=extractJson<{prompt?:string;changes?:string[]}>(res.text);
  if(typeof raw.prompt!=='string'||!raw.prompt.trim())throw new Error('새 문구·구성을 받지 못했어요. 원래 입력은 유지돼요.');
  return {prompt:raw.prompt.trim().slice(0,2000),changes:Array.isArray(raw.changes)?raw.changes.map(String).slice(0,6):[],ai:{provider:res.provider,model:res.model}};
}

/** ① 기획 */
export async function createStudio(input: { prompt: string; subjectMode?:string; seconds?: number; style?: string; imageModel?: string; clipSeconds?: number; resolution?: string; lockCharacter?: string; seriesId?: string; episode?: number }) {
  const prompt = input.prompt.trim().slice(0, 2000);
  if (!prompt) throw new Error("어떤 영상을 만들지 적어 주세요.");
  const options: StudioOptions = {
    ...DEFAULT_OPTIONS,
    subjectMode:input.subjectMode==="food"?"food":"character",
    seconds: [15, 20, 30, 45, 60].includes(Number(input.seconds)) ? Number(input.seconds) : DEFAULT_OPTIONS.seconds,
    style: input.subjectMode==="food"?"real":STUDIO_STYLES.some((s) => s.id === input.style) ? String(input.style) : DEFAULT_OPTIONS.style,
    imageModel: /^(google|openai):/.test(String(input.imageModel ?? "")) ? String(input.imageModel) : DEFAULT_OPTIONS.imageModel,
    clipSeconds: Number(input.clipSeconds) === 10 ? 10 : 5,
    resolution: ["480p", "720p", "1080p"].includes(String(input.resolution)) ? (input.resolution as StudioOptions["resolution"]) : "720p",
    ...(input.lockCharacter&&input.subjectMode!=="food" ? { lockCharacter: String(input.lockCharacter).slice(0, 1200) } : {}),
    ...(input.seriesId ? { seriesId: input.seriesId, episode: Number(input.episode) || undefined } : {}),
  };
  const id = newId("std_");
  await q("INSERT INTO studio_projects (id, title, prompt, options, status, message) VALUES ($1,$2,$3,$4,'planning','AI가 기획 중…')", [id, prompt.slice(0, 40), prompt, j(options)]);
  await plan(id);
  return id;
}

export async function plan(id: string, feedback = "") {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  const o = s.options;
  const food=o.subjectMode==="food";
  const n = Math.max(2, Math.min(12, Math.round(o.seconds / o.clipSeconds)));
  const style = STUDIO_STYLES.find((x) => x.id === o.style) ?? STUDIO_STYLES[1];
  const system = `당신은 인스타 릴스·유튜브 쇼츠 기획 PD입니다. 첫 1초에 시선을 잡고 끝까지 보게 만드는 짧은 세로 영상을 기획합니다. 반드시 JSON 객체 하나만 출력합니다. 화면 설명·움직임 프롬프트는 영어, 자막·내레이션은 한국어로 씁니다.`;
  const userPrompt = `${food?"[음식 클로즈업 모드] 음식과 조리 과정만 촬영하는 실사 레시피 릴스. 사람·손·얼굴·캐릭터·마스코트·의인화는 금지. 음식·재료·냄비·도구만 매크로 또는 탑뷰로 보여 주세요. 원문에 없는 재료·수치·조리법을 새로 만들지 마세요. 화면마다 조리 과정 한 단계만 보여 주고, 김·끓음·재료 변화 등 음식 움직임을 중심으로 구성하세요.":"[인물·캐릭터 모드]"}\n[만들 영상] ${s.prompt}
[길이] 약 ${o.seconds}초 · 장면 ${n}개 (장면당 ${o.clipSeconds}초)
[그림체] ${style.label} — ${style.prompt}
${!food&&o.lockCharacter ? `[캐릭터 고정 문장 — character.prompt 에도 그대로]\n${o.lockCharacter}\n` : ""}${s.plan?.title ? `[이전 기획 제목] ${s.plan.title}\n` : ""}${feedback ? `[수정 요청 - 반드시 반영]\n${feedback}\n` : ""}
기획하세요.
- title: 영상 제목 (한국어, 짧게)
- concept: 한두 문장 콘셉트
- hook: 첫 장면 자막(3초 안에 멈추게 하는 한 줄, 15자 이내)
${food?'- character: 빈 객체 {}. 캐릭터를 만들지 마세요.':'- character: 영상 전체의 주인공 1명. name(한국어), description(한국어 한 줄), prompt(영어: 외모·옷·색·체형·그림체를 구체적으로, 배경 없이 전신).'}
- scenes: ${n}개. 각 장면:
  - visual: 영어 이미지 프롬프트 (${food?"음식·재료·조리 상태 + 탑뷰 또는 매크로 구도":"주인공 동작 + 배경 + 구도"}. 세로 9:16, 글자 넣지 말 것). 한 장면에 동작은 딱 하나만 (동작이 여러 개면 AI가 엉뚱한 장면을 만듦)${!food&&o.lockCharacter ? `
  - 모든 visual 맨 앞에 아래 [캐릭터 고정 문장]을 한 글자도 바꾸지 말고 그대로 넣기` : ""}
  - motion: 영어 움직임 프롬프트 (카메라·인물 움직임 한 문장, ${o.clipSeconds}초 분량)
  - caption: 화면 자막 (한국어, 18자 이내, 첫 장면은 hook)
  - narration: 말로 할 내용 (한국어 한 문장, 선택)
- caption: 게시물 캡션 (첫 줄 후킹 + 2~3줄)
- hashtags: 3~5개 (# 없이)
형식: {"title": "", "concept": "", "hook": "", "character": {"name": "", "description": "", "prompt": ""}, "scenes": [{"visual": "", "motion": "", "caption": "", "narration": ""}], "caption": "", "hashtags": [""]}`;
  try {
    const res = await runStep({ step: "studio", purpose: "studio-plan", blog: null, system, prompt: userPrompt, json: true, maxTokens: 4000 });
    const raw = extractJson<{ title?: string; concept?: string; hook?: string; character?: { name?: string; description?: string; prompt?: string }; scenes?: Partial<StudioScene>[]; caption?: string; hashtags?: string[] }>(res.text);
    const lock = food?undefined:o.lockCharacter?.trim();
    const scenes: StudioScene[] = (raw.scenes ?? []).slice(0, 12).map((x, i) => ({
      n: i + 1,
      seconds: o.clipSeconds,
      // 시리즈: 캐릭터 문장을 모든 장면에 똑같이 (AI가 빼먹어도 앞에 붙임) → 화가 바뀌어도 같은 캐릭터
      visual: (lock && !String(x.visual ?? "").includes(lock) ? `${lock} ${String(x.visual ?? "")}` : String(x.visual ?? "")).slice(0, 1500),
      motion: String(x.motion ?? "").slice(0, 600),
      caption: String(x.caption ?? "").slice(0, 60),
      narration: String(x.narration ?? "").slice(0, 300),
      image: {},
      video: {},
    }));
    if (!scenes.length) throw new Error("AI가 장면을 만들지 못했어요. 다시 시도해 주세요.");
    const keepChar = !food&&s.character?.image?.id && feedback && !/캐릭터|인물|주인공/.test(feedback);
    await save(id, {
      title: String(raw.title ?? s.prompt).slice(0, 80),
      plan: { title: String(raw.title ?? ""), concept: String(raw.concept ?? ""), hook: String(raw.hook ?? ""), caption: String(raw.caption ?? ""), hashtags: (raw.hashtags ?? []).map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 5), style: style.id, ai: `${res.provider}/${res.model}` },
      character: food?{name:"음식 클로즈업",description:"음식과 조리 과정만",prompt:"",image:{}}:keepChar ? s.character : { name: String(raw.character?.name ?? "주인공"), description: String(raw.character?.description ?? ""), prompt: lock || String(raw.character?.prompt ?? ""), image: {} },
      scenes,
      status: "planned",
      message: "",
    });
  } catch (e) {
    await save(id, { status: "error", message: (e as Error).message.slice(0, 300) });
    throw e;
  }
}

/** 기획 직접 고치기 */
export async function updateStudio(id: string, patch: { character?: Partial<StudioCharacter>; scenes?: Partial<StudioScene>[]; plan?: Partial<StudioPlan>; options?: Partial<StudioOptions> }) {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  const out: Partial<StudioProject> = {};
  if (patch.character) out.character = { ...s.character, name: String(patch.character.name ?? s.character.name).slice(0, 40), description: String(patch.character.description ?? s.character.description).slice(0, 300), prompt: String(patch.character.prompt ?? s.character.prompt).slice(0, 1500) };
  if (patch.scenes)
    out.scenes = patch.scenes.slice(0, 12).map((x, i) => {
      const prev = s.scenes[i] ?? { image: {}, video: {} };
      return { ...prev, n: i + 1, seconds: s.options.clipSeconds, visual: String(x.visual ?? prev.visual ?? "").slice(0, 1500), motion: String(x.motion ?? prev.motion ?? "").slice(0, 600), caption: String(x.caption ?? prev.caption ?? "").slice(0, 60), narration: String(x.narration ?? prev.narration ?? "").slice(0, 300), image: x.image ?? prev.image ?? {}, video: x.video ?? prev.video ?? {} } as StudioScene;
    });
  if (patch.plan) out.plan = { ...s.plan, caption: String(patch.plan.caption ?? s.plan.caption), hashtags: patch.plan.hashtags ?? s.plan.hashtags };
  if (patch.options) {
    const o = { ...s.options, ...patch.options };
    if (!/^(google|openai):/.test(o.imageModel)) o.imageModel = DEFAULT_OPTIONS.imageModel;
    if (![5, 10].includes(Number(o.clipSeconds))) o.clipSeconds = 5;
    if (!["480p", "720p", "1080p"].includes(o.resolution)) o.resolution = "720p";
    o.captions = o.captions !== false;
    out.options = o;
  }
  await save(id, out);
  return getStudio(id);
}

/** ② 캐릭터 이미지 (버튼) */
export async function makeCharacter(id: string) {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  if(s.options.subjectMode==="food")throw new Error("음식 클로즈업은 캐릭터를 만들지 않아요. 장면 이미지부터 시작해 주세요.");
  const style = STUDIO_STYLES.find((x) => x.id === s.options.style) ?? STUDIO_STYLES[1];
  // 한국어로 고쳤으면 영어로 바꿔 저장한 뒤 그리기
  const { toEnglishPrompt } = await import("./image-prompt");
  const en = await toEnglishPrompt(s.character.prompt, id);
  if (en.translated) s.character = { ...s.character, prompt: en.prompt };
  const prompt = `${s.character.prompt}. Full body character reference sheet, single character standing, plain light background, ${style.prompt}. No text.`;
  const imgId = await generateDirect({ modelId: s.options.imageModel, prompt, aspect: "9:16", projectId: id });
  await save(id, { character: { ...s.character, image: { id: imgId, url: `/api/img/${imgId}.jpg`, model: s.options.imageModel, status: "done" } } });
  return getStudio(id);
}

/** ✏️ 프롬프트 수정: 캐릭터(target='character') 또는 장면 n번의 그림 설명을 한국어 요청대로 고침 */
export async function editStudioPrompt(id: string, target: "character" | number, request: string) {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  const { editPrompt } = await import("./image-prompt");
  if (target === "character") {
    const r = await editPrompt(s.character.prompt, request, id);
    await save(id, { character: { ...s.character, prompt: r.prompt } });
    return { studio: await getStudio(id), changed: r.changed };
  }
  const sc = s.scenes[target];
  if (!sc) throw new Error("장면을 찾을 수 없습니다.");
  const r = await editPrompt(sc.visual, request, id);
  const scenes = s.scenes.slice();
  scenes[target] = { ...sc, visual: r.prompt };
  await save(id, { scenes });
  return { studio: await getStudio(id), changed: r.changed };
}

/** ③ 장면 이미지 (버튼) — 캐릭터 이미지를 참고로 */
export async function makeSceneImage(id: string, index: number) {
  const s = await getStudio(id);
  const sc = s?.scenes[index];
  if (!s || !sc) throw new Error("장면을 찾을 수 없습니다.");
  const style = STUDIO_STYLES.find((x) => x.id === s.options.style) ?? STUDIO_STYLES[1];
  const { toEnglishPrompt } = await import("./image-prompt");
  const en = await toEnglishPrompt(sc.visual, id);
  if (en.translated) sc.visual = en.prompt;
  const food=s.options.subjectMode==="food";
  const referenceId=food?(index>0?s.scenes[0]?.image?.id:undefined):s.character.image?.id;
  const ref = referenceId ? await getGeneratedImage(referenceId) : null;
  const refs = ref ? [{ mime: ref.mime, data: Buffer.from(ref.data) }] : [];
  const prompt = food?`Food-only photorealistic recipe close-up, macro or overhead framing. No people, no hands, no faces, no characters, no mascots, no anthropomorphism. ${refs.length?"Use the food reference for consistent dish, tableware and lighting. ":""}Scene: ${sc.visual}. Natural food photography lighting. Vertical 9:16. No text, captions or watermark.`:`${refs.length ? "Use the attached image as the exact reference for the main character (same face, hair, outfit, colors, proportions). " : `Main character: ${s.character.prompt}. `}Scene: ${sc.visual}. ${style.prompt}. Vertical 9:16 composition. No text, no captions, no watermark.`;
  const imgId = await generateDirect({ modelId: s.options.imageModel, prompt, aspect: "9:16", projectId: id, refs });
  const scenes = s.scenes.slice();
  scenes[index] = { ...sc, image: { id: imgId, url: `/api/img/${imgId}.jpg`, model: s.options.imageModel, status: "done" }, video: {} };
  await save(id, { scenes });
  return getStudio(id);
}

function clipBody(s: StudioProject, sc: StudioScene, base: string) {
  return { model: "wan-2.6-i2v", prompt: s.options.subjectMode==="food"?`${sc.motion}. Food-only macro recipe footage, keep the dish and ingredients consistent. No people, hands, faces, characters or mascots. No text.`:`${sc.motion}. Keep the main character consistent. No text.`, image_url: `${base}${sc.image.url}`, duration: s.options.clipSeconds, resolution: s.options.resolution, negative_prompt: s.options.subjectMode==="food"?"people, hands, faces, characters, mascots, anthropomorphism, text, subtitles, watermark":"text, subtitles, watermark, distorted face, extra limbs" };
}

/** ④ 장면 영상 예상 비용 (생성 안 함) */
export async function estimateClips(id: string, origin?: string) {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  const base = await publicBase(origin);
  const withImage = s.scenes.filter((x) => x.image?.url);
  if (!withImage.length) return { perClip: null, total: null, count: 0 };
  const est = await estimateMedia({ ...clipBody(s, withImage[0], base), projectId: id }).catch(() => ({ usd: null }));
  const left = s.scenes.filter((x) => !x.video?.url).length;
  return { perClip: est.usd, total: est.usd != null ? est.usd * left : null, count: left };
}

/** ④ 장면 영상 만들기 (Higgsfield, 버튼) */
export async function makeSceneClip(id: string, index: number, origin?: string) {
  const s = await getStudio(id);
  const sc = s?.scenes[index];
  if (!s || !sc) throw new Error("장면을 찾을 수 없습니다.");
  if (!sc.image?.url) throw new Error("먼저 이 장면의 이미지를 만들어 주세요.");
  const base = await publicBase(origin);
  if (!/^https:\/\//.test(base)) throw new Error("영상 서비스가 이미지를 읽을 공개 주소가 없어요. 고정 주소(Render)에서 한 번 열어 주세요.");
  const body = clipBody(s, sc, base);
  const est = await estimateMedia({ ...body, projectId: id }).catch(() => ({ usd: null as number | null }));
  const job = await createMediaJob({ ...body, projectId: null });
  const scenes = s.scenes.slice();
  scenes[index] = { ...sc, video: { jobId: job.id, status: job.status, usd: est.usd } };
  await save(id, { scenes });
  return getStudio(id);
}

/** 진행 중인 영상 작업 상태 갱신 */
export async function refreshStudio(id: string) {
  const s = await getStudio(id);
  if (!s) return null;
  let changed = false;
  const scenes = s.scenes.slice();
  for (const [i, sc] of scenes.entries()) {
    if (!sc.video?.jobId || sc.video.url || ["failed", "nsfw", "canceled", "error"].includes(String(sc.video.status))) continue;
    const m = await refreshMediaJob(sc.video.jobId);
    if (!m) continue;
    const url = (m.urls as string[])?.[0];
    const next = { ...sc.video, status: m.status, url: m.status === "completed" && url ? url : undefined, error: m.error ?? undefined };
    if (JSON.stringify(next) !== JSON.stringify(sc.video)) {
      scenes[i] = { ...sc, video: next };
      changed = true;
    }
  }
  if (changed) await save(id, { scenes });
  return changed ? getStudio(id) : s;
}

/** ⑤ 합치기 → 작업 큐 */
export async function startRender(id: string) {
  const s = await getStudio(id);
  if (!s) throw new Error("프로젝트를 찾을 수 없습니다.");
  const ready = s.scenes.filter((x) => x.video?.url || x.image?.url);
  if (!ready.length) throw new Error("합칠 장면이 없어요. 장면 이미지나 영상을 먼저 만들어 주세요.");
  await save(id, { status: "rendering", message: "합치는 중…" });
  const { enqueue } = await import("./jobs");
  await enqueue("studio_render", { payload: { studioId: id }, maxAttempts: 1 });
}

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; err: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-8000)));
    p.on("close", (code) => resolve({ code: code ?? 1, err }));
    p.on("error", (e) => resolve({ code: 1, err: e.message }));
  });
}

function fontFile(): string | null {
  const list = [process.env.STUDIO_FONT, path.join(process.cwd(), "bin", "NotoSansKR.ttf"), "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"].filter(Boolean) as string[];
  return list.find((f) => fs.existsSync(f)) ?? null;
}

/** 자막을 한 줄 14자 안팎으로 나눔 */
function wrapCaption(t: string, n = 14) {
  const out: string[] = [];
  let line = "";
  for (const w of t.split(/\s+/)) {
    if ((line + " " + w).trim().length > n && line) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3).join("\n");
}

/** 작업: 장면들을 9:16으로 맞춰 이어 붙이고 자막 얹기 → 영상공장에 저장 */
export async function runStudioRender(id: string) {
  const s = await getStudio(id);
  if (!s) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-"));
  try {
    const ff = ffmpegPath();
    const font = s.options.captions ? fontFile() : null;
    const parts: string[] = [];
    for (const [i, sc] of s.scenes.entries()) {
      const out = `p${i}.mp4`;
      let input: string[];
      if (sc.video?.url) {
        const r = await fetch(sc.video.url, { signal: AbortSignal.timeout(120_000) });
        if (!r.ok) throw new Error(`${i + 1}번 장면 영상을 받지 못했어요 (HTTP ${r.status}). 영상 주소가 만료됐으면 다시 만들어 주세요.`);
        fs.writeFileSync(path.join(dir, `c${i}.mp4`), Buffer.from(await r.arrayBuffer()));
        input = ["-i", `c${i}.mp4`];
      } else if (sc.image?.id) {
        const img = await getGeneratedImage(sc.image.id);
        if (!img) continue;
        fs.writeFileSync(path.join(dir, `i${i}.jpg`), Buffer.from(img.data));
        // 영상이 없는 장면은 사진에 천천히 확대 효과
        input = ["-loop", "1", "-t", String(sc.seconds), "-i", `i${i}.jpg`];
      } else continue;
      let vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1";
      if (!sc.video?.url) vf = `scale=1188:2112,zoompan=z='min(zoom+0.0008,1.1)':d=${sc.seconds * 30}:s=1080x1920:fps=30,setsar=1`;
      if (font && sc.caption.trim()) {
        fs.writeFileSync(path.join(dir, `t${i}.txt`), wrapCaption(sc.caption));
        vf += `,drawtext=fontfile='${font.replace(/'/g, "")}':textfile=t${i}.txt:fontsize=64:fontcolor=white:borderw=6:bordercolor=black@0.85:line_spacing=12:x=(w-text_w)/2:y=h*0.72`;
      }
      const r = await run(ff, ["-hide_banner", "-loglevel", "error", "-y", ...input, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(sc.seconds), "-vf", vf, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out], dir);
      if (r.code !== 0) throw new Error(`${i + 1}번 장면 처리 실패: ${r.err.trim().split("\n").pop()}`);
      parts.push(out);
      await save(id, { message: `합치는 중… (${parts.length}/${s.scenes.length})` });
    }
    if (!parts.length) throw new Error("합칠 장면이 없어요.");
    fs.writeFileSync(path.join(dir, "list.txt"), parts.map((p) => `file '${p}'`).join("\n"));
    const r = await run(ff, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "final.mp4"], dir);
    if (r.code !== 0) throw new Error(`이어 붙이기 실패: ${r.err.trim().split("\n").pop()}`);
    await probe(path.join(dir, "final.mp4"));
    const videoId = await addVideoFile({ title: s.title || s.plan.title || "스튜디오 영상", file: path.join(dir, "final.mp4"), kind: "studio", info: { description: s.plan.caption } });
    await save(id, { video_id: videoId, status: "done", message: "" });
  } catch (e) {
    await save(id, { status: "error", message: (e as Error).message.slice(0, 400) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function deleteStudio(id: string) {
  // 바로 지우지 않고 휴지통으로 (30일 뒤 자동 완전 삭제)
  await (await import("./trash-snap")).snapToTrash("studio", id);
}
