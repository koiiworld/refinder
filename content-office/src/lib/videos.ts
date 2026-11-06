import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { q, q1, newId, j } from "./db";
import { deleteFiles, getFile, MAX_VIDEO_BYTES, putFile } from "./video-store";
import { extractJson, runStep } from "./ai/run";

/**
 * 🎬 영상공장
 * - 링크 → yt-dlp로 받기 → 자막 트랙 빼기 → (선택) 화면에 박힌 자막을 AI가 찾아 지우기 → 저장소에 보관
 * - 편집: 자르기 · 9:16 맞추기 · 자막 영역 지우기/흐리게 → 새 영상으로 저장
 * - 무거운 작업은 작업 큐에서 (맥이 켜져 있으면 맥이 먼저 처리)
 */

export type Box = { x: number; y: number; w: number; h: number }; // 0~1 비율
export type Video = {
  id: string;
  source_url: string;
  title: string;
  kind: "download" | "edit" | "studio";
  parent_id: string | null;
  status: "queued" | "running" | "ready" | "error";
  message: string;
  path: string | null;
  thumb_path: string | null;
  original_path: string | null;
  size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  info: { uploader?: string; description?: string; extractor?: string; subBoxes?: Box[]; subsRemoved?: boolean; edit?: EditOptions; ai?: string };
  created_at: string;
  updated_at: string;
};
export type EditOptions = { start?: number; end?: number; aspect?: "keep" | "9:16"; mode?: "none" | "delogo" | "blur"; boxes?: Box[]; mute?: boolean; fromOriginal?: boolean };

/** 함께 설치한 ffmpeg(자막 글자·확대 효과 필터 포함)를 먼저, 없으면 시스템 ffmpeg */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string;
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* 아래로 */
  }
  if (fs.existsSync("/opt/homebrew/bin/ffmpeg")) return "/opt/homebrew/bin/ffmpeg";
  if (fs.existsSync("/usr/bin/ffmpeg")) return "/usr/bin/ffmpeg";
  return "ffmpeg";
}
function ytdlpPath(): string {
  return process.env.YTDLP_PATH?.trim() || path.join(process.cwd(), "bin", "yt-dlp");
}

function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, PATH: `${path.dirname(ffmpegPath())}:${process.env.PATH ?? ""}` } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-20_000)));
    const t = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 10 * 60 * 1000);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(new Error(`${path.basename(cmd)} 실행 실패: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

/** ffmpeg 출력에서 길이·해상도 읽기 */
export async function probe(file: string) {
  const r = await run(ffmpegPath(), ["-hide_banner", "-i", file], { timeoutMs: 30_000 });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.err);
  const v = /Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(r.err);
  const rot = /rotation of (-?\d+)/.exec(r.err) ?? /rotate\s*:\s*(-?\d+)/.exec(r.err);
  let w = v ? Number(v[1]) : null, h = v ? Number(v[2]) : null;
  if (rot && Math.abs(Number(rot[1])) % 180 === 90 && w && h) [w, h] = [h, w];
  return { duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null, width: w, height: h, hasAudio: /Audio: /.test(r.err) };
}

async function ffmpeg(args: string[], cwd: string, label: string) {
  const r = await run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, timeoutMs: 20 * 60 * 1000 });
  if (r.code !== 0) throw new Error(`${label} 실패: ${r.err.trim().split("\n").slice(-3).join(" ")}`);
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vf-"));
const clean = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

/** 받기 도구(yt-dlp) 최신으로: 일주일에 한 번, 또는 받기가 사이트 변경으로 실패했을 때 */
const gy = globalThis as unknown as { __ytdlpUpdated?: number };
export async function updateYtdlp(force = false): Promise<string> {
  if (!fs.existsSync(ytdlpPath())) return "받기 도구 없음";
  if (process.env.YTDLP_NO_UPDATE === "1") return "자동 업데이트 꺼짐";
  if (!force && gy.__ytdlpUpdated && Date.now() - gy.__ytdlpUpdated < 7 * 86400000) return "최근에 확인함";
  gy.__ytdlpUpdated = Date.now();
  const r = await run(ytdlpPath(), ["-U"], { timeoutMs: 120_000 });
  const line = (r.out + r.err).trim().split("\n").filter(Boolean).pop() ?? "";
  return r.code === 0 ? line.slice(0, 200) : `업데이트 실패: ${line.slice(0, 200)}`;
}

export async function listVideos() {
  return q<Video>("SELECT * FROM videos ORDER BY created_at DESC LIMIT 200");
}
export async function getVideo(id: string) {
  return q1<Video>("SELECT * FROM videos WHERE id=$1", [id]);
}
async function setVideo(id: string, patch: Partial<Video>) {
  const keys = Object.keys(patch) as (keyof Video)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`UPDATE videos SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (k === "info" ? j(patch[k]) : patch[k]))]);
}

/** 링크 등록 → 작업 큐에 받기 작업 */
export async function addVideoLink(url: string, removeSubs = true) {
  let u: URL;
  try {
    u = new URL(url.trim());
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    throw new Error("영상 링크를 확인해 주세요 (https:// 로 시작).");
  }
  if (process.env.VIDEO_ALLOW_LOCAL !== "1" && /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error("이 주소는 받을 수 없어요.");
  const id = newId("vid_");
  await q("INSERT INTO videos (id, source_url, title, kind, status, message, info) VALUES ($1,$2,$3,'download','queued','대기 중',$4)", [id, u.href, u.hostname, j({ removeSubs })]);
  const { enqueue } = await import("./jobs");
  await enqueue("video_fetch", { payload: { videoId: id, removeSubs }, maxAttempts: 2 });
  return id;
}

/** 편집본 만들기 → 작업 큐 */
export async function addEdit(parentId: string, opts: EditOptions) {
  const p = await getVideo(parentId);
  if (!p?.path) throw new Error("원본 영상이 아직 준비되지 않았어요.");
  const id = newId("vid_");
  await q("INSERT INTO videos (id, source_url, title, kind, parent_id, status, message, info) VALUES ($1,$2,$3,'edit',$4,'queued','대기 중',$5)", [id, p.source_url, `${p.title} (편집)`, parentId, j({ edit: opts })]);
  const { enqueue } = await import("./jobs");
  await enqueue("video_edit", { payload: { videoId: id, parentId, opts }, maxAttempts: 2 });
  return id;
}

export async function deleteVideo(id: string) {
  const v = await getVideo(id);
  if (!v) return;
  await deleteFiles([v.path, v.thumb_path, v.original_path].filter((x): x is string => !!x));
  await q("DELETE FROM videos WHERE id=$1", [id]);
}

/** 화면에 박힌 자막 위치를 AI가 찾음 (프레임 4장 → Gemini 무료 키 기본) */
async function detectSubtitles(file: string, duration: number | null, dir: string): Promise<{ boxes: Box[]; ai: string }> {
  const d = duration && duration > 2 ? duration : 4;
  const images: string[] = [];
  for (const [i, f] of [0.15, 0.4, 0.65, 0.88].entries()) {
    const out = `frame${i}.jpg`;
    try {
      await ffmpeg(["-ss", (d * f).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", out], dir, "프레임 추출");
      images.push(`data:image/jpeg;base64,${fs.readFileSync(path.join(dir, out)).toString("base64")}`);
    } catch {
      /* 짧은 영상이면 일부만 */
    }
  }
  if (!images.length) return { boxes: [], ai: "" };
  const system = `당신은 영상 프레임에서 '화면에 입혀진 자막 글자(번역 자막·말자막·설명 문구)'의 위치를 찾는 도우미입니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `첨부한 이미지는 같은 영상의 서로 다른 시점 프레임 ${images.length}장입니다.
영상 위에 덧입혀진 자막·글자 영역(사람이 말하는 내용, 설명 문구, 큰 제목 글자)을 찾으세요.
- 여러 프레임에서 자막이 나오는 영역을 모두 덮도록, 영역마다 하나의 상자로 합치세요 (최대 3개).
- 제품 자체에 인쇄된 글자, 간판, 화면 속 실제 물체의 글자는 자막이 아니므로 제외.
- 좌표는 0~1000 비율의 [ymin, xmin, ymax, xmax] (box_2d). 자막이 위아래로 조금씩 움직이면 여유 있게.
- 자막이 없으면 found: false
형식: {"found": true, "boxes": [{"box_2d": [800, 50, 900, 950], "what": "아래쪽 말자막"}]}`;
  try {
    const res = await runStep({ step: "keywords", purpose: "video-subtitle", blog: null, system, prompt, images, json: true, maxTokens: 800 });
    const raw = extractJson<{ found?: boolean; boxes?: { box_2d?: number[] }[] }>(res.text);
    if (raw.found === false) return { boxes: [], ai: `${res.provider}/${res.model}` };
    const boxes = (raw.boxes ?? [])
      .map((b) => b.box_2d ?? [])
      .filter((b) => b.length === 4 && b.every((n) => Number.isFinite(Number(n))))
      .map(([y1, x1, y2, x2]) => {
        // 조금 여유를 둠
        const pad = 12;
        const x = Math.max(0, Math.min(x1, x2) - pad) / 1000, y = Math.max(0, Math.min(y1, y2) - pad) / 1000;
        const X = Math.min(1000, Math.max(x1, x2) + pad) / 1000, Y = Math.min(1000, Math.max(y1, y2) + pad) / 1000;
        return { x, y, w: X - x, h: Y - y };
      })
      .filter((b) => b.w > 0.02 && b.h > 0.01 && b.w * b.h < 0.6)
      .slice(0, 3);
    return { boxes, ai: `${res.provider}/${res.model}` };
  } catch {
    return { boxes: [], ai: "" };
  }
}

/** 상자 영역 지우기(delogo)/흐리게(blur) 필터 */
function boxFilter(boxes: Box[], W: number, H: number, mode: "delogo" | "blur", input = "0:v") {
  const px = (b: Box) => {
    const x = Math.max(1, Math.round(b.x * W)), y = Math.max(1, Math.round(b.y * H));
    const w = Math.max(4, Math.min(W - x - 1, Math.round(b.w * W))), h = Math.max(4, Math.min(H - y - 1, Math.round(b.h * H)));
    return { x, y, w: w - (w % 2), h: h - (h % 2) };
  };
  if (mode === "delogo") return `[${input}]${boxes.map((b) => { const p = px(b); return `delogo=x=${p.x}:y=${p.y}:w=${p.w}:h=${p.h}`; }).join(",")}[v]`;
  let chain = `[${input}]null[s0]`;
  boxes.forEach((b, i) => {
    const p = px(b);
    chain += `;[s${i}]split[m${i}][c${i}];[c${i}]crop=${p.w}:${p.h}:${p.x}:${p.y},gblur=sigma=30:steps=3[b${i}];[m${i}][b${i}]overlay=${p.x}:${p.y}[s${i + 1}]`;
  });
  return `${chain};[s${boxes.length}]null[v]`;
}

/** 50MB 넘으면 화질을 낮춰 다시 인코딩 */
async function fitSize(dir: string, file: string) {
  if (fs.statSync(path.join(dir, file)).size <= MAX_VIDEO_BYTES) return file;
  const out = "small.mp4";
  await ffmpeg(["-i", file, "-vf", "scale='min(720,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], dir, "용량 줄이기");
  if (fs.statSync(path.join(dir, out)).size > MAX_VIDEO_BYTES) throw new Error("영상이 너무 길어 50MB 안에 담을 수 없어요. 더 짧은 영상으로 해 주세요.");
  return out;
}

async function storeResult(id: string, dir: string, file: string, extra: Partial<Video> = {}) {
  const meta = await probe(path.join(dir, file));
  await ffmpeg(["-ss", String(Math.min(1, (meta.duration ?? 2) / 3)), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", "thumb.jpg"], dir, "썸네일");
  const data = fs.readFileSync(path.join(dir, file));
  await putFile(`${id}/video.mp4`, data, "video/mp4");
  await putFile(`${id}/thumb.jpg`, fs.readFileSync(path.join(dir, "thumb.jpg")), "image/jpeg");
  await setVideo(id, { status: "ready", message: "", path: `${id}/video.mp4`, thumb_path: `${id}/thumb.jpg`, size: data.length, duration: meta.duration, width: meta.width, height: meta.height, ...extra });
}

/** 작업: 링크에서 영상 받기 */
export async function runVideoFetch(videoId: string, removeSubs: boolean) {
  const v = await getVideo(videoId);
  if (!v) return;
  const dir = tmp();
  try {
    await setVideo(videoId, { status: "running", message: "영상 받는 중…" });
    if (!fs.existsSync(ytdlpPath())) throw new Error("영상 받기 도구(yt-dlp)가 설치되지 않았어요.");
    const args = [
      "--no-playlist", "--no-warnings", "--no-progress", "-j", "--no-simulate", "--retries", "2", "--extractor-retries", "1", "--socket-timeout", "20",
      "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
      "--merge-output-format", "mp4", "--ffmpeg-location", ffmpegPath(), "--max-filesize", "300M",
      "-o", "src.%(ext)s", v.source_url,
    ];
    let r = await run(ytdlpPath(), args, { cwd: dir, timeoutMs: 10 * 60 * 1000 });
    let src = fs.readdirSync(dir).find((f) => /^src\.(mp4|mkv|webm|mov)$/.test(f));
    // 사이트가 바뀌어 실패한 것 같으면: 받기 도구를 최신으로 바꾸고 한 번 더
    if ((r.code !== 0 || !src) && /Unable to extract|Unsupported|HTTP Error 4\d\d|Failed to parse|Requested format|nsig|Sign in to confirm/i.test(r.err)) {
      await setVideo(videoId, { message: "받기 도구를 최신으로 바꾸는 중…" });
      const up = await updateYtdlp(true).catch(() => "");
      // 실제로 새 버전으로 바뀌었을 때만 다시 시도
      if (/Updated yt-dlp|Updating to/i.test(up)) {
        await setVideo(videoId, { message: "새 버전으로 다시 받는 중…" });
        r = await run(ytdlpPath(), args, { cwd: dir, timeoutMs: 10 * 60 * 1000 });
        src = fs.readdirSync(dir).find((f) => /^src\.(mp4|mkv|webm|mov)$/.test(f));
      }
    }
    const { markFail, markOk } = await import("./health");
    if (r.code !== 0 || !src) {
      const why = r.err.split("\n").filter((l) => /ERROR/.test(l)).pop() ?? r.err.trim().split("\n").pop() ?? "";
      const privateVideo = /login|private|비공개|cookies|not available|removed/i.test(why);
      if (!privateVideo && /^https?:\/\/(www\.)?(instagram|youtube|youtu\.be|tiktok)/i.test(v.source_url)) await markFail("video_download", why.slice(0, 200));
      throw new Error(`영상을 받지 못했어요. ${privateVideo ? "비공개이거나 로그인이 필요한 영상이에요." : why.replace(/^ERROR:\s*/, "").slice(0, 200)}`);
    }
    await markOk("video_download");
    let info: { title?: string; uploader?: string; description?: string; extractor_key?: string } = {};
    try {
      info = JSON.parse(r.out.trim().split("\n").pop() ?? "{}");
    } catch {
      /* 제목 없이 진행 */
    }
    // 자막 트랙은 빼고, 웹에서 바로 재생되게 정리
    await setVideo(videoId, { message: "영상 정리 중…" });
    const meta0 = await probe(path.join(dir, src));
    await ffmpeg(["-i", src, "-map", "0:v:0", ...(meta0.hasAudio ? ["-map", "0:a:0"] : []), "-sn", "-c", "copy", "-movflags", "+faststart", "base.mp4"], dir, "영상 정리").catch(async () => {
      await ffmpeg(["-i", src, "-sn", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", "base.mp4"], dir, "영상 변환");
    });
    let final = "base.mp4";
    let boxes: Box[] = [];
    let ai = "";
    let original: string | null = null;
    if (removeSubs) {
      await setVideo(videoId, { message: "AI가 화면 자막 위치 찾는 중…" });
      const det = await detectSubtitles(path.join(dir, "base.mp4"), meta0.duration, dir);
      boxes = det.boxes;
      ai = det.ai;
      if (boxes.length && meta0.width && meta0.height) {
        await setVideo(videoId, { message: "자막 지우는 중…" });
        await ffmpeg(["-i", "base.mp4", "-filter_complex", boxFilter(boxes, meta0.width, meta0.height, "delogo"), "-map", "[v]", ...(meta0.hasAudio ? ["-map", "0:a:0", "-c:a", "copy"] : []), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart", "clean.mp4"], dir, "자막 지우기");
        original = await fitSize(dir, "base.mp4");
        final = "clean.mp4";
      }
    }
    final = await fitSize(dir, final);
    if (original && original !== final) await putFile(`${videoId}/original.mp4`, fs.readFileSync(path.join(dir, original)), "video/mp4");
    await storeResult(videoId, dir, final, {
      title: (info.title && !/^Video by /.test(info.title) ? info.title : info.description?.split("\n")[0] || info.title || v.title).slice(0, 200),
      original_path: original ? `${videoId}/original.mp4` : null,
      info: { uploader: info.uploader, description: info.description?.slice(0, 2000), extractor: info.extractor_key, subBoxes: boxes, subsRemoved: !!original, ai },
    });
  } catch (e) {
    await setVideo(videoId, { status: "error", message: (e as Error).message.slice(0, 500) });
  } finally {
    clean(dir);
  }
}

/** 작업: 편집본 만들기 (자르기 · 9:16 · 자막 영역 지우기/흐리게 · 소리 끄기) */
export async function runVideoEdit(videoId: string, parentId: string, opts: EditOptions) {
  const p = await getVideo(parentId);
  const dir = tmp();
  try {
    if (!p?.path) throw new Error("원본 영상을 찾지 못했어요.");
    await setVideo(videoId, { status: "running", message: "편집 중…" });
    fs.writeFileSync(path.join(dir, "in.mp4"), await getFile(opts.fromOriginal && p.original_path ? p.original_path : p.path));
    const meta = await probe(path.join(dir, "in.mp4"));
    const W = meta.width ?? 1080, H = meta.height ?? 1920;
    const start = Math.max(0, Number(opts.start) || 0);
    const end = opts.end && opts.end > start ? Math.min(opts.end, meta.duration ?? opts.end) : null;
    const filters: string[] = [];
    let last = "0:v";
    const boxes = (opts.boxes ?? []).filter((b) => b.w > 0.01 && b.h > 0.01).slice(0, 5);
    if (opts.mode && opts.mode !== "none" && boxes.length) {
      filters.push(boxFilter(boxes, W, H, opts.mode, last).replace(/\[v\]$/, "[bx]"));
      last = "bx";
    }
    if (opts.aspect === "9:16") {
      // 세로 화면: 흐린 배경 + 가운데 원본
      filters.push(`[${last}]split[bga][fga];[bga]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2[bg];[fga]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[a916]`);
      last = "a916";
    }
    const vmap = filters.length ? ["-filter_complex", `${filters.join(";")};[${last}]format=yuv420p[vout]`, "-map", "[vout]"] : ["-map", "0:v:0"];
    const amap = opts.mute || !meta.hasAudio ? ["-an"] : ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k"];
    await ffmpeg(["-ss", String(start), ...(end ? ["-to", String(end)] : []), "-i", "in.mp4", ...vmap, ...amap, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart", "out.mp4"], dir, "편집");
    const final = await fitSize(dir, "out.mp4");
    await storeResult(videoId, dir, final, { info: { edit: opts, subBoxes: boxes } });
  } catch (e) {
    await setVideo(videoId, { status: "error", message: (e as Error).message.slice(0, 500) });
  } finally {
    clean(dir);
  }
}

/** 스튜디오 등에서 만든 파일을 영상공장에 바로 등록 */
export async function addVideoFile(input: { title: string; file: string; kind?: Video["kind"]; info?: Video["info"]; sourceUrl?: string }) {
  const id = newId("vid_");
  await q("INSERT INTO videos (id, source_url, title, kind, status, message, info) VALUES ($1,$2,$3,$4,'running','저장 중',$5)", [id, input.sourceUrl ?? "", input.title.slice(0, 200), input.kind ?? "studio", j(input.info ?? {})]);
  const dir = path.dirname(input.file);
  await storeResult(id, dir, path.basename(input.file), { info: input.info ?? {} });
  return id;
}
