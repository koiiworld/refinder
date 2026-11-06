import "server-only";
import { q, q1 } from "./db";

/**
 * 영상 저장소
 * - SUPABASE_SERVICE_KEY 가 있으면 Supabase Storage(무료 1GB, 파일당 50MB)의 비공개 'videos' 버킷
 * - 없으면 임시로 DB(video_blobs)에 보관 (용량이 작으니 키를 넣는 걸 권장)
 * - 재생은 짧게 유효한 서명 주소 또는 앱 주소로
 */

const BUCKET = "videos";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function supabaseUrl(): string | null {
  const direct = process.env.SUPABASE_URL?.trim();
  if (direct) return direct.replace(/\/$/, "");
  // Session pooler 주소의 사용자 이름(postgres.<프로젝트ref>)에서 프로젝트 주소를 알아냄
  const m = /\/\/postgres\.([a-z0-9]{10,}):/i.exec(process.env.DATABASE_URL ?? "");
  return m ? `https://${m[1]}.supabase.co` : null;
}
const key = () => process.env.SUPABASE_SERVICE_KEY?.trim() || "";

export function storageKind(): "supabase" | "db" {
  return key() && supabaseUrl() ? "supabase" : "db";
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${supabaseUrl()}/storage/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, apikey: key(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  return res;
}

const g = globalThis as unknown as { __bucketReady?: boolean };
async function ensureBucket() {
  if (g.__bucketReady) return;
  const r = await sb(`/bucket/${BUCKET}`);
  if (r.status === 404 || r.status === 400) {
    const c = await sb("/bucket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_VIDEO_BYTES }) });
    if (!c.ok && c.status !== 409) throw new Error(`저장소 버킷을 만들지 못했어요 (HTTP ${c.status}) ${await c.text()}`);
  } else if (!r.ok) throw new Error(`저장소에 연결하지 못했어요 (HTTP ${r.status}). SUPABASE_SERVICE_KEY 를 확인해 주세요.`);
  g.__bucketReady = true;
}

export async function putFile(path: string, data: Buffer, mime: string) {
  if (data.length > MAX_VIDEO_BYTES) throw new Error(`파일이 너무 커요 (${Math.round(data.length / 1048576)}MB · 최대 50MB).`);
  if (storageKind() === "supabase") {
    await ensureBucket();
    const r = await sb(`/object/${BUCKET}/${path}`, { method: "POST", headers: { "content-type": mime, "x-upsert": "true" }, body: new Uint8Array(data) });
    if (!r.ok) throw new Error(`저장소에 올리지 못했어요 (HTTP ${r.status}) ${(await r.text()).slice(0, 200)}`);
    return;
  }
  await q("INSERT INTO video_blobs (path, mime, data) VALUES ($1,$2,$3) ON CONFLICT (path) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data", [path, mime, data]);
}

export async function getFile(path: string): Promise<Buffer> {
  if (storageKind() === "supabase") {
    const r = await sb(`/object/${BUCKET}/${path}`);
    if (!r.ok) throw new Error(`저장소에서 파일을 못 찾았어요 (HTTP ${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  const row = await q1<{ data: Buffer | Uint8Array }>("SELECT data FROM video_blobs WHERE path=$1", [path]);
  if (!row) throw new Error("파일을 찾지 못했어요.");
  return Buffer.from(row.data);
}

/** 재생·다운로드 주소: Supabase는 1시간짜리 서명 주소, DB 보관이면 null(앱 주소로 전달) */
export async function signedUrl(path: string, download?: string): Promise<string | null> {
  if (storageKind() !== "supabase") return null;
  const r = await sb(`/object/sign/${BUCKET}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) return null;
  const { signedURL } = (await r.json()) as { signedURL?: string };
  if (!signedURL) return null;
  return `${supabaseUrl()}/storage/v1${signedURL}${download ? `&download=${encodeURIComponent(download)}` : ""}`;
}

export async function deleteFiles(paths: string[]) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  if (storageKind() === "supabase") {
    await sb(`/object/${BUCKET}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: list }) }).catch(() => {});
    return;
  }
  await q("DELETE FROM video_blobs WHERE path = ANY($1)", [list]);
}

/** DB 임시 보관 파일 (Range 요청 지원용) */
export async function dbFile(path: string) {
  return q1<{ mime: string; data: Buffer | Uint8Array }>("SELECT mime, data FROM video_blobs WHERE path=$1", [path]);
}
