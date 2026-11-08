import "server-only";
import crypto from "node:crypto";
import { q } from "./db";

/**
 * 편집기에서 직접 올린·붙여넣은 사진(data:image/...;base64,…)을 따로 저장하고 본문에는 주소만 남김
 * - 앱에서 만든 이미지처럼 /api/img/<id>.jpg 주소 → 글이 가벼워지고, 검수 AI 가 사진 내용도 봄
 * - 같은 사진은 같은 아이디(내용 해시) → 자동 저장을 여러 번 해도 중복 저장 안 됨
 */
const INLINE = /data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)/gi;
const MAX = 15 * 1024 * 1024;

export async function externalizeImages(html: string, projectId: string | null) {
  const found = [...String(html ?? "").matchAll(INLINE)];
  if (!found.length) return { html, count: 0 };
  let out = html;
  let count = 0;
  // 블로그에 복사해 넣어도 보이게 앱 공개 주소로 (없으면 상대 주소)
  const { publicBase } = await import("./image-refs");
  const base = (await publicBase().catch(() => null)) ?? "";
  for (const m of found) {
    const mime = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
    const data = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
    if (!data.length || data.length > MAX) continue;
    const id = `img_${crypto.createHash("sha256").update(data).digest("hex").slice(0, 24)}`;
    await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,$2,'upload','editor',$3,$4,'편집기에서 올린 사진') ON CONFLICT (id) DO NOTHING", [id, projectId, mime, data]);
    out = out.split(m[0]).join(`${base}/api/img/${id}.jpg`);
    count++;
  }
  return { html: out, count };
}

/** 본문 속 이 앱 이미지(/api/img/…) 아이디들 */
export function bodyImageIds(html: string) {
  return Array.from(new Set([...String(html ?? "").matchAll(/\/api\/img\/(img_[0-9a-f]{24})/g)].map((m) => m[1])));
}
