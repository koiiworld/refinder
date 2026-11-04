import "server-only";
import { q, q1, newId, j } from "./db";
import { HF_MODELS, HF_TERMINAL, hfCancel, hfEstimate, hfStatus, hfSubmit, type HfModelId } from "./higgsfield";
import { WorkflowError } from "./workflow";

export interface MediaJob {
  id: string;
  prompt_id: string | null;
  provider: string;
  model: string;
  media: "image" | "video";
  request_id: string | null;
  status: string;
  status_url: string | null;
  cancel_url: string | null;
  input: Record<string, unknown>;
  urls: string[];
  error: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const ASPECTS = ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"];

/** 모델별 요청 본문 (공식 문서 스키마 기준: docs.higgsfield.ai 모델별 generate 페이지) */
export function buildBody(model: HfModelId, i: Record<string, unknown>) {
  const prompt = String(i.prompt ?? "").trim();
  if (!prompt) throw new WorkflowError("프롬프트가 비어 있습니다.");
  const aspect = ASPECTS.includes(String(i.aspect_ratio)) ? String(i.aspect_ratio) : "1:1";
  if (model === "soul-standard" || model === "soul-v2" || model === "soul-cinema") {
    const resolution = i.resolution === "720p" ? "720p" : "1080p";
    return { prompt, aspect_ratio: aspect, resolution, batch_size: 1, enhance_prompt: false };
  }
  if (model === "qwen-image-3") return { prompt, aspect_ratio: aspect, resolution: "2k", prompt_extend: false };
  if (model === "z-image-turbo") return { prompt: prompt.slice(0, 800), aspect_ratio: aspect, resolution: "2k", prompt_extend: false };
  if (model === "ideogram-4") return { prompt: prompt.slice(0, 2048), aspect_ratio: aspect, rendering_speed: "DEFAULT" };
  // wan-2.6-i2v
  const image_url = String(i.image_url ?? "").trim();
  if (!/^https:\/\//.test(image_url)) throw new WorkflowError("영상의 시작 이미지 URL(https)이 필요합니다. 먼저 이미지를 생성하거나 이미지 주소를 넣으세요.");
  const duration = [5, 10, 15].includes(Number(i.duration)) ? Number(i.duration) : 5;
  const resolution = ["480p", "720p", "1080p"].includes(String(i.resolution)) ? String(i.resolution) : "720p";
  const body: Record<string, unknown> = { prompt, image_url, duration, resolution };
  if (String(i.negative_prompt ?? "").trim()) body.negative_prompt = String(i.negative_prompt).trim();
  return body;
}

/** 예상 비용 (생성하지 않음) */
export async function estimateMedia(input: { model: string } & Record<string, unknown>) {
  if (!(input.model in HF_MODELS)) throw new WorkflowError("지원하지 않는 모델입니다.");
  const model = input.model as HfModelId;
  return hfEstimate(HF_MODELS[model].path, buildBody(model, input));
}

export async function createMediaJob(input: { model: string; promptId?: string | null; projectId?: string | null } & Record<string, unknown>): Promise<MediaJob> {
  if (!(input.model in HF_MODELS)) throw new WorkflowError("지원하지 않는 모델입니다.");
  const model = input.model as HfModelId;
  const def = HF_MODELS[model];
  const body = buildBody(model, input);
  const id = newId("mj_");
  // 같은 작업을 두 번 청구하지 않도록 작업 ID를 Idempotency-Key 로 사용
  const r = await hfSubmit(def.path, body, id);
  await q(
    `INSERT INTO media_jobs (id, prompt_id, project_id, provider, model, media, request_id, status, status_url, cancel_url, input)
     VALUES ($1,NULL,$2,'higgsfield',$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.projectId || null, model, def.media, r.request_id, r.status, r.status_url, r.cancel_url, j(body)],
  );
  return (await getMediaJob(id))!;
}

export async function getMediaJob(id: string) {
  return q1<MediaJob>("SELECT * FROM media_jobs WHERE id=$1", [id]);
}

export async function listMediaJobs(projectId?: string | null) {
  return q<MediaJob>(
    `SELECT * FROM media_jobs ${projectId ? "WHERE project_id=$1" : ""} ORDER BY created_at DESC LIMIT 100`,
    projectId ? [projectId] : [],
  );
}

/** 진행 중이면 Higgsfield 에 상태를 물어 갱신 */
export async function refreshMediaJob(id: string): Promise<MediaJob | null> {
  const job = await getMediaJob(id);
  if (!job || HF_TERMINAL.includes(job.status) || job.status === "error" || !job.status_url) return job;
  try {
    const s = await hfStatus(job.status_url);
    await q("UPDATE media_jobs SET status=$2, urls=$3, error=$4, expires_at=$5, updated_at=NOW() WHERE id=$1", [
      id,
      s.status,
      j(s.urls),
      s.status === "nsfw" ? "부적절한 콘텐츠로 판정되어 생성되지 않았습니다 (요금 청구 없음)" : s.error,
      s.expires_at,
    ]);
  } catch (e) {
    // 일시적 조회 실패는 다음 조회에서 재시도
    await q("UPDATE media_jobs SET error=$2, updated_at=NOW() WHERE id=$1", [id, `상태 조회 실패(재시도 예정): ${(e as Error).message}`]);
  }
  return getMediaJob(id);
}

export async function cancelMediaJob(id: string) {
  const job = await getMediaJob(id);
  if (!job?.cancel_url) throw new WorkflowError("작업을 찾을 수 없습니다.");
  if (job.status !== "queued") throw new WorkflowError("대기 중인 작업만 취소할 수 있습니다.");
  await hfCancel(job.cancel_url);
  await q("UPDATE media_jobs SET status='canceled', updated_at=NOW() WHERE id=$1", [id]);
  return getMediaJob(id);
}
