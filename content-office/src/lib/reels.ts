import "server-only";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { q, q1, newId, j } from "./db";
import { enqueue } from "./jobs";
import { addVideoFile, ffmpegPath, fitSize, getVideo, probe } from "./videos";
import { getFile } from "./video-store";
import { DEFAULT_TEXT_STYLE, type ReelDoc, type ReelScene, type ReelText } from "@/remotion/types";

/**
 * ✂️ 릴스 편집기 (맥 전용 처리)
 * ① 초안: 바탕 영상 → 받아쓰기(faster-whisper, 무료) + 화면 전환 지점 → 문장별 장면·자막
 * ②③ 편집: 화면에서 장면·자막·배경을 고쳐 doc 저장 (AI 호출 없음)
 * ④ 내보내기: 맥에서 Remotion으로 mp4 → 영상공장에 저장
 */
export type ReelProject = {
  id: string; title: string; base_video_id: string | null; doc: ReelDoc; guide: { segments?: { start: number; end: number; text: string }[]; cuts?: number[]; duration?: number; language?: string; peaks?: number[] };
  status: "analyzing" | "ready" | "rendering" | "error"; message: string; output_video_id: string | null; posted_at: string | null; created_at: string; updated_at: string;
};

const HOME = os.homedir();
const RUNTIME = () => process.env.REMOTION_RUNTIME || path.join(HOME, ".ai-content-office", "remotion-runtime");
const WHISPER_PY = () => process.env.WHISPER_PYTHON || path.join(HOME, ".ai-content-office", "whisper-venv", "bin", "python");
const WHISPER_SCRIPT = () => process.env.WHISPER_SCRIPT || path.join(process.cwd(), "scripts", "transcribe.py");
const CHROME = process.env.REMOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const FONT_FILE = () => path.join(process.cwd(), "bin", "NotoSansKR.ttf");

const r2 = (n: number) => Math.round(n * 100) / 100;
const sid = () => Math.random().toString(36).slice(2, 9);

export async function listReels() {
  return q<ReelProject & { thumb: string | null }>(
    `SELECT r.*, v.thumb_path AS thumb FROM reel_projects r LEFT JOIN videos v ON v.id=r.base_video_id WHERE r.deleted_at IS NULL ORDER BY r.updated_at DESC LIMIT 100`,
  );
}
export async function getReel(id: string) {
  return q1<ReelProject>("SELECT * FROM reel_projects WHERE id=$1", [id]);
}
async function setReel(id: string, patch: Partial<Pick<ReelProject, "status" | "message" | "doc" | "guide" | "output_video_id" | "title">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`UPDATE reel_projects SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (k === "doc" || k === "guide" ? j(patch[k]) : patch[k]))]);
}

/** 영상공장 영상 하나로 릴스 편집 시작 → 맥이 초안을 만듦 */
export async function createReel(videoId: string) {
  const v = await getVideo(videoId);
  if (!v) throw new Error("영상을 찾을 수 없어요.");
  if (v.status !== "ready" || !v.path) throw new Error("영상 받기가 끝난 뒤에 시작할 수 있어요.");
  const id = newId("reel_");
  const doc: ReelDoc = { width: 1080, height: 1920, fps: 30, baseVideoId: v.id, audio: "base", scenes: [], texts: [] };
  await q("INSERT INTO reel_projects (id, title, base_video_id, doc, status, message) VALUES ($1,$2,$3,$4,'analyzing','초안 만드는 중 (맥에서 받아쓰기)')", [id, v.title.slice(0, 120), v.id, j(doc)]);
  await enqueue("reel_analyze", { payload: { reelId: id }, maxAttempts: 1 });
  return id;
}

export async function deleteReel(id: string) {
  await q("UPDATE reel_projects SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL", [id]); // 휴지통으로
}

/** 화면에서 고친 편집 문서 저장 (모양만 확인) */
export async function saveDoc(id: string, doc: ReelDoc, title?: string) {
  const cur = await getReel(id);
  if (!cur) throw new Error("릴스를 찾을 수 없어요.");
  if (!doc || !Array.isArray(doc.scenes) || !Array.isArray(doc.texts)) throw new Error("편집 내용 형식이 맞지 않아요.");
  if (doc.scenes.length > 300 || doc.texts.length > 500) throw new Error("장면·자막이 너무 많아요.");
  const clean: ReelDoc = {
    width: 1080, height: 1920, fps: 30, baseVideoId: cur.base_video_id, audio: doc.audio === "none" ? "none" : "base",
    scenes: doc.scenes.map((s) => ({ ...s, dur: Math.max(0.2, Math.min(600, Number(s.dur) || 1)), audioFrom: Math.max(0, Number(s.audioFrom) || 0), video: { videoId: s.video?.videoId || null, from: Math.max(0, Number(s.video?.from) || 0) } })),
    texts: doc.texts.map((t) => ({ ...t, text: String(t.text ?? "").slice(0, 300), start: Math.max(0, Number(t.start) || 0), end: Math.max(Number(t.start) + 0.1, Number(t.end) || 0), style: { ...DEFAULT_TEXT_STYLE, ...t.style } })),
  };
  await setReel(id, { doc: clean, ...(title !== undefined ? { title: String(title).slice(0, 120) } : {}) });
  return clean;
}

export function run(cmd: string, args: string[], opts: { env?: Record<string, string>; onLine?: (l: string) => void; timeoutMs?: number } = {}) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...opts.env } });
    let out = "", err = "", buf = "";
    p.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      buf += s;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach((l) => opts.onLine?.(l));
    });
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-8000)));
    const t = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 20 * 60 * 1000);
    p.on("error", (e) => { clearTimeout(t); resolve({ code: 1, out, err: e.message }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, out, err }); });
  });
}

export async function videoToTemp(videoId: string, dir: string) {
  const v = await getVideo(videoId);
  if (!v?.path) throw new Error("영상 파일을 찾을 수 없어요.");
  const f = path.join(dir, `${videoId}.mp4`);
  if (!fs.existsSync(f)) fs.writeFileSync(f, await getFile(v.path));
  return f;
}

/** 타임라인 소리 모양: 0.05초마다 크기 (0~100) */
async function audioPeaks(file: string) {
  return new Promise<number[]>((resolve) => {
    const p = spawn(ffmpegPath(), ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("close", () => {
      const buf = Buffer.concat(chunks);
      const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      const step = 400; // 8000Hz × 0.05초
      const out: number[] = [];
      for (let i = 0; i < f.length; i += step) {
        let m = 0;
        for (let k = i; k < Math.min(f.length, i + step); k++) m = Math.max(m, Math.abs(f[k]));
        out.push(Math.min(100, Math.round(m * 100)));
      }
      resolve(out);
    });
    p.on("error", () => resolve([]));
  });
}

/** 화면이 크게 바뀌는 지점 (ffmpeg scene 값) */
async function sceneCuts(file: string) {
  const r = await run(ffmpegPath(), ["-hide_banner", "-i", file, "-vf", "select='gt(scene,0.35)',showinfo", "-an", "-f", "null", "-"], { timeoutMs: 5 * 60 * 1000 });
  return Array.from(r.err.matchAll(/pts_time:([\d.]+)/g)).map((m) => r2(Number(m[1])));
}

/** 받아쓰기 문장 → 장면·자막 초안 (문장이 없으면 화면 전환 지점, 그것도 없으면 통째로 한 장면) */
export function draftDoc(baseVideoId: string, duration: number, segments: { start: number; end: number; text: string }[], cuts: number[]): ReelDoc {
  const dur = Math.max(0.5, duration);
  let bounds: number[];
  if (segments.length) bounds = segments.slice(1).map((s) => s.start);
  else bounds = cuts.filter((c, i, a) => c > 0.8 && c < dur - 0.8 && (i === 0 || c - a[i - 1] >= 1));
  bounds = [0, ...bounds.filter((b) => b > 0.2 && b < dur - 0.2), dur];
  const scenes: ReelScene[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    if (b - a < 0.2) continue;
    const seg = segments[i];
    scenes.push({ id: sid(), label: seg?.text.slice(0, 30) || `장면 ${i + 1}`, dur: r2(b - a), audioFrom: r2(a), video: { videoId: null, from: 0 }, fit: "cover", bg: { type: "none" } });
  }
  const texts: ReelText[] = segments.map((s) => ({ id: sid(), start: r2(s.start), end: r2(Math.min(dur, Math.max(s.end, s.start + 0.5))), text: s.text, style: { ...DEFAULT_TEXT_STYLE } }));
  return { width: 1080, height: 1920, fps: 30, baseVideoId, audio: "base", scenes, texts };
}

/** 작업 ①: 초안 만들기 (맥) */
export async function runReelAnalyze(reelId: string) {
  const reel = await getReel(reelId);
  if (!reel?.base_video_id) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  try {
    const file = await videoToTemp(reel.base_video_id, dir);
    const meta = await probe(file);
    const duration = meta.duration ?? 0;
    await setReel(reelId, { message: "화면 전환 지점 찾는 중" });
    const cuts = await sceneCuts(file);
    const peaks = await audioPeaks(file);
    await setReel(reelId, { message: "말 받아쓰는 중 (처음 한 번은 모델을 내려받아 몇 분 걸려요)" });
    let segments: { start: number; end: number; text: string }[] = [];
    let language = "";
    if (fs.existsSync(WHISPER_PY()) || process.env.WHISPER_PYTHON) {
      const r = await run(WHISPER_PY(), [WHISPER_SCRIPT(), file, process.env.WHISPER_MODEL || "small"], { env: { FFMPEG: ffmpegPath() } });
      if (r.code !== 0) throw new Error(`받아쓰기 실패: ${r.err.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`);
      const parsed = JSON.parse(r.out.trim().split("\n").pop() || "{}") as { language?: string; segments?: typeof segments };
      segments = (parsed.segments ?? []).filter((s) => s.text && s.end > s.start);
      language = parsed.language ?? "";
    }
    const doc = draftDoc(reel.base_video_id, duration, segments, cuts);
    await setReel(reelId, {
      doc, guide: { segments, cuts, duration, language, peaks }, status: "ready",
      message: segments.length ? `문장 ${segments.length}개로 장면·자막 초안을 만들었어요` : "말소리가 없어 화면 전환 기준으로 나눴어요",
    });
  } catch (e) {
    await setReel(reelId, { status: "error", message: (e as Error).message.slice(0, 400) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 내보내기 요청 */
export async function startReelRender(id: string) {
  const r = await getReel(id);
  if (!r) throw new Error("릴스를 찾을 수 없어요.");
  if (r.status === "rendering") throw new Error("이미 내보내는 중이에요.");
  if (!r.doc.scenes.length) throw new Error("장면이 없어요.");
  await setReel(id, { status: "rendering", message: "내보내기 대기 중 (맥에서 만들어요)" });
  await enqueue("reel_render", { payload: { reelId: id }, maxAttempts: 1 });
}

/** 내보낼 때만 잠깐 여는 파일 서버 (영상·글꼴을 Remotion에 넘김) */
export function fileServer(files: Record<string, string>) {
  const srv = http.createServer((req, res) => {
    const f = files[decodeURIComponent((req.url ?? "/").slice(1).split("?")[0])];
    if (!f || !fs.existsSync(f)) {
      res.writeHead(404);
      return res.end();
    }
    const size = fs.statSync(f).size;
    const type = f.endsWith(".ttf") ? "font/ttf" : /\.(jpe?g)$/.test(f) ? "image/jpeg" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "video/mp4";
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    const common = { "accept-ranges": "bytes", "content-type": type, "access-control-allow-origin": "*" };
    if (m) {
      const s = m[1] ? Number(m[1]) : 0;
      const e = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      res.writeHead(206, { ...common, "content-range": `bytes ${s}-${e}/${size}`, "content-length": e - s + 1 });
      return fs.createReadStream(f, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { ...common, "content-length": size });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise<{ base: string; close: () => void }>((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, close: () => srv.close() })));
}

/** 작업 ④: 내보내기 (맥) */
export async function runReelRender(reelId: string) {
  const reel = await getReel(reelId);
  if (!reel) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-render-"));
  let server: { base: string; close: () => void } | null = null;
  try {
    const doc = reel.doc;
    const ids = Array.from(new Set([doc.baseVideoId, ...doc.scenes.map((s) => s.video.videoId)].filter(Boolean) as string[]));
    await setReel(reelId, { message: "영상 파일 준비 중" });
    const files: Record<string, string> = {};
    for (const vid of ids) files[`${vid}.mp4`] = await videoToTemp(vid, dir);
    if (fs.existsSync(FONT_FILE())) files["font.ttf"] = FONT_FILE();
    server = await fileServer(files);
    const srcs = Object.fromEntries(ids.map((vid) => [vid, `${server!.base}/${vid}.mp4`]));
    const out = path.join(dir, "reel.mp4");
    const job = {
      entry: path.join(process.cwd(), "src", "remotion", "index.tsx"),
      props: { doc, srcs, fontUrl: files["font.ttf"] ? `${server.base}/font.ttf` : "" },
      out,
      cacheDir: path.join(HOME, ".ai-content-office", "remotion-cache"),
      ...(fs.existsSync(CHROME) ? { browser: CHROME } : {}),
    };
    const jobFile = path.join(dir, "job.json");
    fs.writeFileSync(jobFile, JSON.stringify(job));
    await setReel(reelId, { message: "만드는 중 0%" });
    let lastPct = -1;
    const r = await run(process.execPath, [path.join(process.cwd(), "scripts", "render-reel.mjs"), jobFile], {
      env: { REMOTION_RUNTIME: RUNTIME() },
      onLine: (l) => {
        const m = /^progress ([\d.]+)/.exec(l);
        if (!m) return;
        const pct = Math.round(Number(m[1]) * 100);
        if (pct - lastPct >= 10 || pct === 100) {
          lastPct = pct;
          void setReel(reelId, { message: pct <= 1 ? "화면 코드 묶는 중 (처음 한 번 30초쯤)" : `만드는 중 ${pct}%` });
        }
      },
    });
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error(`내보내기 실패: ${r.err.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`);
    await setReel(reelId, { message: "영상공장에 저장 중" });
    const final = await fitSize(dir, "reel.mp4"); // 50MB 넘으면 줄임
    const vid = await addVideoFile({ title: `${reel.title || "릴스"} (편집본)`, file: path.join(dir, final), kind: "reel", info: { description: `릴스 편집기 ${reelId}` } });
    await setReel(reelId, { status: "ready", message: "내보내기 완료", output_video_id: vid });
  } catch (e) {
    await setReel(reelId, { status: "error", message: (e as Error).message.slice(0, 400) });
  } finally {
    server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
