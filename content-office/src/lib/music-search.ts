import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { addVideoFile, ffmpegPath, fitSize } from "./videos";

/**
 * 🔍 무료 음원 찾기 (Openverse — 키 없이 쓰는 공개 검색. 음악은 Jamendo, 효과음은 Freesound)
 * - 릴스에 써도 되는 것만: CC0(조건 없음) · CC BY(출처만 적으면 상업 사용 가능)
 *   변경 금지(ND)·같은 조건 공유(SA)·비상업(NC)은 검색에서도, 가져올 때도 막음
 * - 가져오기: Openverse 에서 다시 정보를 받아 그 주소로만 내려받음 → 영상공장 저장소에 '🎵 음악'으로 (올린 음악과 같은 방식)
 */
const BASE = () => (process.env.OPENVERSE_BASE?.trim() || "https://api.openverse.org").replace(/\/$/, "");
export const OK_LICENSES = ["cc0", "by"] as const;
export type MusicLicense = (typeof OK_LICENSES)[number];
export const LICENSE_LABEL: Record<MusicLicense, string> = { cc0: "CC0 (조건 없이 사용)", by: "CC BY (출처만 적으면 상업 사용 가능)" };

export type MusicHit = {
  id: string; title: string; creator: string; license: MusicLicense; licenseVersion: string; licenseUrl: string;
  source: string; preview: string; duration: number | null; page: string; credit: string;
};

type Raw = { id: string; title?: string; creator?: string; license?: string; license_version?: string; license_url?: string; source?: string; url?: string; duration?: number | null; foreign_landing_url?: string; attribution?: string };

function credit(r: Raw) {
  const lic = r.license === "cc0" ? "CC0" : `CC BY ${r.license_version ?? ""}`.trim();
  return `🎵 Music: "${r.title ?? "제목 없음"}" by ${r.creator ?? "알 수 없음"} (${lic}) ${r.foreign_landing_url ?? ""}`.trim();
}
function toHit(r: Raw): MusicHit | null {
  if (!r?.id || !OK_LICENSES.includes(r.license as MusicLicense) || !r.url) return null;
  return {
    id: String(r.id), title: String(r.title ?? "제목 없음").slice(0, 200), creator: String(r.creator ?? "").slice(0, 120),
    license: r.license as MusicLicense, licenseVersion: String(r.license_version ?? ""), licenseUrl: String(r.license_url ?? ""),
    source: String(r.source ?? ""), preview: r.url, duration: typeof r.duration === "number" ? Math.round(r.duration / 100) / 10 : null,
    page: String(r.foreign_landing_url ?? ""), credit: credit(r),
  };
}

export async function searchMusic(input: { q: string; kind?: "music" | "sfx"; license?: "all" | MusicLicense; page?: number }) {
  const q = String(input.q ?? "").trim().slice(0, 100);
  if (!q) throw new Error("찾을 말을 넣어 주세요 (예: piano, lofi, 빗소리).");
  const lic = input.license && input.license !== "all" ? input.license : OK_LICENSES.join(",");
  const u = new URL(`${BASE()}/v1/audio/`);
  u.searchParams.set("q", q);
  u.searchParams.set("license", lic);
  // 효과음(Freesound)은 Openverse 에 분류(category)가 비어 있어서 출처로 거름. 음악은 분류로
  if (input.kind === "sfx") u.searchParams.set("source", "freesound");
  else u.searchParams.set("category", "music");
  u.searchParams.set("page_size", "20");
  u.searchParams.set("page", String(Math.max(1, Math.min(20, Number(input.page) || 1))));
  const r = await fetch(u, { headers: { "user-agent": "ContentOffice/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`음원 검색이 잠시 안 돼요 (HTTP ${r.status}). 조금 뒤 다시 해 주세요.`);
  const d = (await r.json()) as { result_count?: number; page_count?: number; results?: Raw[] };
  const hits = (d.results ?? []).map(toHit).filter((x): x is MusicHit => !!x);
  return { hits, total: d.result_count ?? hits.length, pages: d.page_count ?? 1 };
}

/** 내려받아도 되는 주소인지 (음원 사이트 파일 주소만) */
function allowedUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (process.env.VIDEO_ALLOW_LOCAL === "1" && u.hostname === "localhost") return true;
    return u.protocol === "https:" && /(^|\.)(freesound\.org|jamendo\.com|ccmixter\.org|wikimedia\.org|openverse\.org)$/.test(u.hostname);
  } catch { return false; }
}

/** 가져오기: Openverse 에서 정보를 다시 받아 확인 → 내려받아 저장 → { videoId, credit } */
export async function importMusic(id: string) {
  if (!/^[0-9a-f-]{8,64}$/i.test(String(id ?? ""))) throw new Error("음원 번호가 이상해요.");
  const r = await fetch(`${BASE()}/v1/audio/${id}/`, { headers: { "user-agent": "ContentOffice/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`음원 정보를 못 받았어요 (HTTP ${r.status}).`);
  const hit = toHit((await r.json()) as Raw);
  if (!hit) throw new Error("릴스에 쓰기 어려운 라이선스라 가져오지 않았어요 (CC0·CC BY만 가능).");
  if (!allowedUrl(hit.preview)) throw new Error("음원 파일 주소를 확인할 수 없어요.");
  const a = await fetch(hit.preview, { signal: AbortSignal.timeout(60_000) });
  if (!a.ok) throw new Error(a.status === 403 ? `음원 사이트(${hit.source})가 이 서버에서 받는 걸 막았어요 (HTTP 403). 다른 음원을 고르거나, 맥 앱에서 다시 해 보세요.` : `음원 파일을 못 받았어요 (HTTP ${a.status}).`);
  const buf = Buffer.from(await a.arrayBuffer());
  if (buf.length < 1000 || buf.length > 40 * 1024 * 1024) throw new Error("음원 파일 크기가 이상해요.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "music-"));
  try {
    fs.writeFileSync(path.join(dir, "in.audio"), buf);
    // 올린 음악과 같은 방식: 검은 화면을 붙인 mp4 (영상공장·편집기에서 똑같이 다룸)
    const out = spawnSync(ffmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x320:r=5", "-i", "in.audio", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", "audio.mp4"], { cwd: dir, timeout: 5 * 60 * 1000 });
    if (out.status !== 0) throw new Error("음원 파일을 읽지 못했어요.");
    const name = await fitSize(dir, "audio.mp4");
    const videoId = await addVideoFile({ title: `🎵 ${hit.title} — ${hit.creator}`.slice(0, 120), file: path.join(dir, name), kind: "upload", sourceUrl: hit.page || hit.preview });
    return { videoId, credit: hit.license === "cc0" ? "" : hit.credit, license: hit.license, title: hit.title, duration: hit.duration };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
