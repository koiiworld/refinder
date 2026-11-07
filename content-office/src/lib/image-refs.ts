import "server-only";
import crypto from "node:crypto";
import { q, q1, j } from "./db";
import { getGeneratedImage } from "./image-gen";
import { checkImageUrl } from "./official-images";
import { hfCreateReference, hfGetReference } from "./higgsfield";

/**
 * 🎨 이미지 레퍼런스
 * - 레퍼런스 사진은 generated_images(공개 /api/img/<id>)에 저장 → Higgsfield에는 https 주소로, Gemini·ChatGPT에는 파일로 보냄
 * - 컨셉 키트: 블로그마다 레퍼런스(최대 5장) + 스타일 문구 + Soul ID → 이미지 만들 때마다 자동으로 붙임
 * - Soul ID: Higgsfield '내 캐릭터' (settings 'soul_ids'에 목록 보관)
 */
export type ImageKit = { refs: string[]; style: string; soulId: string | null; on: boolean };
export type Soul = { id: string; name: string; version: "v1" | "v2" | "cinema"; status: string; created_at: string; error?: string | null };

export const MAX_REFS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const OK_MIME = ["image/jpeg", "image/png", "image/webp"];

const newImgId = () => `img_${crypto.randomBytes(12).toString("hex")}`;

/** 레퍼런스 사진 저장 → 이미지 아이디 */
export async function saveRefImage(data: Buffer, mime: string, label = "") {
  const m = mime.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!OK_MIME.includes(m)) throw new Error("JPG·PNG·WEBP 사진만 레퍼런스로 쓸 수 있어요.");
  if (!data.length || data.length > MAX_BYTES) throw new Error("레퍼런스 사진은 10MB 이하로 올려 주세요.");
  const id = newImgId();
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'reference','upload',$2,$3,$4)", [id, m, data, label.slice(0, 200)]);
  return id;
}

/** 이미 만든 이미지(이 앱 주소 또는 Higgsfield 등 외부 주소) → 레퍼런스로 */
export async function refFromUrl(url: string) {
  const own = /\/api\/img\/(img_[0-9a-f]{24})/.exec(url);
  if (own && (await getGeneratedImage(own[1]))) return own[1];
  const safe = await checkImageUrl(url);
  const res = await fetch(safe, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
  if (!res.ok) throw new Error(`이미지를 받지 못했어요 (${res.status})`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim() || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return saveRefImage(buf, mime, safe);
}

export async function loadRefs(ids: string[]) {
  const out: { mime: string; data: Buffer }[] = [];
  for (const id of ids) {
    const img = await getGeneratedImage(id);
    if (img) out.push({ mime: img.mime, data: Buffer.from(img.data) });
  }
  return out;
}

/** Higgsfield가 사진을 가져갈 수 있는 공개 https 주소 (Render 주소) */
export async function publicBase(): Promise<string | null> {
  const env = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/$/, "");
  if (/^https:\/\//.test(env)) return env;
  const r = await q1<{ value: { url?: string | null } }>("SELECT value FROM settings WHERE key='worker_render'").catch(() => null);
  const u = String(r?.value?.url ?? "").replace(/\/$/, "");
  return /^https:\/\//.test(u) ? u : null;
}
export const refUrl = (base: string, id: string) => `${base}/api/img/${id}.jpg`;

// ── 컨셉 키트 ──
const EMPTY_KIT: ImageKit = { refs: [], style: "", soulId: null, on: true };
export async function getKit(blogId: string | null | undefined): Promise<ImageKit> {
  if (!blogId) return { ...EMPTY_KIT };
  const r = await q1<{ image_kit: Partial<ImageKit> | null }>("SELECT image_kit FROM blogs WHERE id=$1", [blogId]).catch(() => null);
  const k = r?.image_kit ?? {};
  return { refs: Array.isArray(k.refs) ? k.refs.filter((x) => /^img_[0-9a-f]{24}$/.test(x)).slice(0, MAX_REFS) : [], style: String(k.style ?? ""), soulId: k.soulId ? String(k.soulId) : null, on: k.on !== false };
}
export async function saveKit(blogId: string, input: Partial<ImageKit>) {
  const cur = await getKit(blogId);
  const kit: ImageKit = {
    refs: input.refs !== undefined ? input.refs.filter((x) => /^img_[0-9a-f]{24}$/.test(x)).slice(0, MAX_REFS) : cur.refs,
    style: input.style !== undefined ? String(input.style).slice(0, 500) : cur.style,
    soulId: input.soulId !== undefined ? (input.soulId ? String(input.soulId) : null) : cur.soulId,
    on: input.on !== undefined ? !!input.on : cur.on,
  };
  await q("UPDATE blogs SET image_kit=$2 WHERE id=$1", [blogId, j(kit)]);
  return kit;
}

/** 이번 생성에 쓸 레퍼런스: (키트 켜져 있으면 키트) + 이번만 레퍼런스, 최대 5장 */
export async function resolveRefs(input: { blogId?: string | null; refIds?: string[]; useKit?: boolean; soulId?: string | null }) {
  const kit = await getKit(input.blogId);
  const useKit = input.useKit !== false && kit.on;
  const ids = Array.from(new Set([...(input.refIds ?? []), ...(useKit ? kit.refs : [])])).filter((x) => /^img_[0-9a-f]{24}$/.test(x)).slice(0, MAX_REFS);
  const soulId = input.soulId === "" ? null : input.soulId ?? (useKit ? kit.soulId : null);
  return { refIds: ids, style: useKit ? kit.style.trim() : "", soulId };
}

/** 프롬프트에 스타일 문구·레퍼런스 안내 붙이기 */
export function withStyle(prompt: string, style: string, refCount: number) {
  const parts = [prompt.trim()];
  if (refCount) parts.unshift(`Use the attached reference image${refCount > 1 ? "s" : ""} to keep the same concept: art style, color palette, mood${refCount ? " and the same character if one appears" : ""}.`);
  if (style) parts.push(`Style: ${style}`);
  return parts.join("\n\n");
}

// ── Higgsfield Soul ID ──
export async function listSouls(): Promise<Soul[]> {
  const r = await q1<{ value: Soul[] }>("SELECT value FROM settings WHERE key='soul_ids'").catch(() => null);
  return Array.isArray(r?.value) ? r!.value : [];
}
async function putSouls(list: Soul[]) {
  await q(`INSERT INTO settings (key, value) VALUES ('soul_ids', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(list)]);
}
export async function createSoul(name: string, version: string, refIds: string[]) {
  const n = name.trim();
  if (!n) throw new Error("캐릭터 이름을 적어 주세요.");
  const ids = refIds.filter((x) => /^img_[0-9a-f]{24}$/.test(x)).slice(0, 100);
  if (!ids.length) throw new Error("캐릭터 사진을 1장 이상 올려 주세요.");
  const base = await publicBase();
  if (!base) throw new Error("사진을 Higgsfield에 보낼 공개 주소(Render)가 아직 없어요. Render 앱을 한 번 연 뒤 다시 해 주세요.");
  const v = (["v1", "v2", "cinema"].includes(version) ? version : "v1") as Soul["version"];
  const r = await hfCreateReference(n, v, ids.map((id) => refUrl(base, id)));
  if (!r.id) throw new Error("Higgsfield가 캐릭터 번호를 돌려주지 않았어요.");
  const list = await listSouls();
  list.unshift({ id: r.id, name: n.slice(0, 100), version: v, status: r.status, created_at: new Date().toISOString() });
  await putSouls(list);
  return list;
}
/** 학습 중인 캐릭터 상태 새로고침 */
export async function refreshSouls() {
  const list = await listSouls();
  let changed = false;
  for (const s of list) {
    if (["completed", "failed"].includes(s.status)) continue;
    try {
      const r = await hfGetReference(s.id);
      if (r.status && r.status !== s.status) {
        s.status = r.status;
        s.error = r.error;
        changed = true;
      }
    } catch {
      /* 다음에 다시 */
    }
  }
  if (changed) await putSouls(list);
  return list;
}
export async function removeSoul(id: string) {
  await putSouls((await listSouls()).filter((s) => s.id !== id));
}

/** 이미지 만들기 전 준비: 한국어 → 영어, 키트·레퍼런스·Soul ID 정리, 스타일 문구 붙이기 */
export async function prepareImage(input: { modelId: string; prompt: string; blogId?: string | null; refIds?: string[]; useKit?: boolean; soulId?: string | null; projectId?: string | null }) {
  const { imageModel } = await import("./image-models");
  const { toEnglishPrompt } = await import("./image-prompt");
  const info = imageModel(input.modelId);
  const en = await toEnglishPrompt(input.prompt, input.projectId);
  const r = await resolveRefs(input);
  const maxRefs = info?.refs ?? 0;
  const refIds = r.refIds.slice(0, maxRefs);
  const soulId = info?.soul ? r.soulId : null;
  let refUrls: string[] = [];
  let note = "";
  if (info?.provider === "higgsfield" && refIds.length) {
    const base = await publicBase();
    if (base) refUrls = refIds.map((id) => refUrl(base, id));
    else note = "레퍼런스를 보낼 공개 주소가 없어 스타일 문구만 반영했어요.";
  }
  if (r.refIds.length && !maxRefs) note = "이 모델은 레퍼런스 사진을 못 받아서 스타일 문구만 반영했어요.";
  const sent = info?.provider === "higgsfield" ? refUrls.length : refIds.length;
  // 스타일 문구도 한국어면 영어로 (키트에는 적은 그대로 둠)
  const style = r.style ? (await toEnglishPrompt(r.style, input.projectId)).prompt : "";
  const { learningContext } = await import("./learning-context");
  const learned = await learningContext("image");
  return { basePrompt: en.prompt, translated: en.translated, prompt: withStyle(en.prompt, style, sent) + learned, refIds, refUrls, soulId, note };
}
