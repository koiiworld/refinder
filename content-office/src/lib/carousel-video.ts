import "server-only";
import crypto from "node:crypto";
import { q, j } from "./db";
import { getCarousel, type Slide } from "./carousel";
import { createMediaJob, estimateMedia, refreshMediaJob } from "./media";
import { publicBase } from "./image-refs";
import { checkImageUrl } from "./official-images";
import { toEnglishPrompt } from "./image-prompt";
import { CARD_MOTIONS, type CardVideo } from "./carousel-video-types";

/**
 * 🎬 캐러셀 카드 사진 → AI 영상 (Higgsfield Wan 2.6, 5초 · 720p · 약 $0.5)
 * - 카드 사진을 공개 주소(/api/img)로 복사해 시작 이미지로 씀 → 보글보글·김·면 들어올리기 등 사진 속 음식이 실제로 움직임
 * - 버튼을 누르고 비용을 확인했을 때만 만듦. 결과는 slide.video 에 저장, 내보내기 때 그 영상 위에 글자를 얹음
 */

const NEG = "people, hands, fingers, faces, characters, text, subtitles, letters, watermark, logo, extra dishes, changing tableware, warping, melting";

function promptFor(motions: string[], custom: string) {
  const parts: string[] = CARD_MOTIONS.filter((m) => motions.includes(m.id)).map((m) => m.en);
  if (custom) parts.push(custom);
  if (!parts.length) parts.push("subtle natural motion, soft steam rising");
  return `${parts.join(". ")}. Realistic food footage from the same photo: keep exactly the same dish, bowl, tableware, ingredients, composition and lighting. Static camera unless asked. Smooth, gentle, natural motion. No people, no faces, no text.`;
}

/** 카드 사진을 Higgsfield가 읽을 수 있는 공개 주소로 */
async function publicImageUrl(carouselId: string, imageIndex: number) {
  const c = await getCarousel(carouselId);
  const img = c?.images?.[imageIndex];
  if (!c || !img) throw new Error("이 카드의 사진을 찾을 수 없어요. 카드에 사진을 먼저 골라 주세요.");
  const base = await publicBase();
  if (!base) throw new Error("영상 AI가 사진을 읽을 공개 주소가 없어요. Render 주소에서 한 번 열어 주세요.");
  if (img.url.startsWith("/api/img/")) return `${base}${img.url}`;
  const res = await fetch(await checkImageUrl(img.url), { headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)" }, signal: AbortSignal.timeout(20_000) });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !/^image\/(png|jpe?g|webp)/.test(type)) throw new Error("카드 사진을 가져오지 못했어요. 사진을 다시 골라 주세요.");
  const data = Buffer.from(await res.arrayBuffer());
  const imgId = `img_${crypto.createHash("sha256").update(data).digest("hex").slice(0, 24)}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,$2,'upload','carousel-video',$3,$4,'') ON CONFLICT (id) DO NOTHING", [imgId, c.project_id, type.split(";")[0], data]);
  return `${base}/api/img/${imgId}.jpg`;
}

function bodyFor(imageUrl: string, prompt: string) {
  return { model: "wan-2.6-i2v", prompt, image_url: imageUrl, duration: 5, resolution: "720p", negative_prompt: NEG };
}

const cleanMotions = (m: unknown) => (Array.isArray(m) ? m.map(String).filter((x) => CARD_MOTIONS.some((c) => c.id === x)).slice(0, 4) : []);

/** 예상 비용만 (만들지 않음) */
export async function estimateCardVideo(id: string, index: number, motions: unknown) {
  const c = await getCarousel(id);
  const s = c?.slides[index];
  if (!c || !s) throw new Error("카드를 찾을 수 없어요.");
  if (s.image == null) throw new Error("사진이 있는 카드만 움직이게 할 수 있어요.");
  const base = (await publicBase()) ?? "https://example.com";
  const est = await estimateMedia(bodyFor(`${base}/api/img/estimate.jpg`, promptFor(cleanMotions(motions), "")));
  return { usd: est.usd, seconds: 5, model: "Wan 2.6 (Higgsfield)" };
}

/** 카드 영상 만들기 시작 (돈 듦 — 확인 후) */
export async function startCardVideo(id: string, index: number, input: { motions?: unknown; custom?: string; slides?: Slide[] }) {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없어요.");
  const slides = (Array.isArray(input.slides) && input.slides.length === c.slides.length ? input.slides : c.slides).map((s, i) => ({ ...c.slides[i], ...s }));
  const s = slides[index];
  if (!s) throw new Error("카드를 찾을 수 없어요.");
  if (s.image == null) throw new Error("사진이 있는 카드만 움직이게 할 수 있어요.");
  const busy = c.slides[index].video;
  if (busy && !busy.url && !["failed", "nsfw", "canceled", "error"].includes(busy.status)) throw new Error("이 카드 영상을 이미 만드는 중이에요.");
  const motions = cleanMotions(input.motions);
  const customKo = String(input.custom ?? "").trim().slice(0, 300);
  const custom = customKo ? (await toEnglishPrompt(customKo, c.project_id)).prompt : "";
  const imageUrl = await publicImageUrl(id, s.image);
  const body = bodyFor(imageUrl, promptFor(motions, custom));
  const est = await estimateMedia(body).catch(() => ({ usd: null as number | null }));
  const job = await createMediaJob({ ...body, projectId: c.project_id });
  const video: CardVideo = { jobId: job.id, status: job.status, prompt: [motions.map((m) => CARD_MOTIONS.find((x) => x.id === m)?.label).join(", "), customKo].filter(Boolean).join(" · "), motions, usd: est.usd, image: c.images[s.image].url };
  slides[index] = { ...s, video };
  await q("UPDATE carousels SET slides=$2, updated_at=NOW() WHERE id=$1", [id, j(slides)]);
  return getCarousel(id);
}

/** 진행 중인 카드 영상 상태 갱신 */
export async function refreshCardVideos(id: string) {
  const c = await getCarousel(id);
  if (!c) return null;
  let changed = false;
  const slides = c.slides.slice();
  for (const [i, s] of slides.entries()) {
    const v = s.video;
    if (!v?.jobId || v.url || ["failed", "nsfw", "canceled", "error"].includes(v.status)) continue;
    const m = await refreshMediaJob(v.jobId);
    if (!m) continue;
    const url = (m.urls as string[] | null)?.[0];
    const next: CardVideo = { ...v, status: m.status, url: m.status === "completed" && url ? url : undefined, error: m.error ?? undefined };
    if (JSON.stringify(next) !== JSON.stringify(v)) { slides[i] = { ...s, video: next }; changed = true; }
  }
  if (changed) await q("UPDATE carousels SET slides=$2, updated_at=NOW() WHERE id=$1", [id, j(slides)]);
  return changed ? getCarousel(id) : c;
}

/** 카드 영상 빼기 (사진 카드로 돌아감) */
export async function removeCardVideo(id: string, index: number) {
  const c = await getCarousel(id);
  if (!c?.slides[index]) throw new Error("카드를 찾을 수 없어요.");
  const slides = c.slides.map((s, i) => { if (i !== index) return s; const { video: _v, ...rest } = s; return rest as Slide; });
  await q("UPDATE carousels SET slides=$2, updated_at=NOW() WHERE id=$1", [id, j(slides)]);
  return getCarousel(id);
}
