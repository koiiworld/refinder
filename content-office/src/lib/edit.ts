import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, q1, newId, j } from "./db";
import { enqueue } from "./jobs";
import { addVideoFile, ffmpegPath, fitSize, getVideo } from "./videos";
import { getGeneratedImage } from "./image-gen";
import { fileServer, FONT_FILE, run, videoToTemp } from "./reels";
import { DEFAULT_TEXT_STYLE, type ReelText } from "@/remotion/types";
import { clipLen, clipStarts, emptyEdit, RATIO_SIZE, type EditDoc } from "@/remotion/edit-types";

/**
 * 🎞 영상 편집 (캡컷형) — 편집은 화면에서(자동 저장), 무거운 일은 맥에서
 * - 내보내기: Remotion (720p·1080p·2K·4K) → 영상공장 저장
 * - 자동 자막: 클립 원본마다 faster-whisper 받아쓰기 → 배속·자른 구간에 맞춰 타임라인 자막으로
 * - 역재생: ffmpeg 로 그 구간을 거꾸로 만든 새 영상 → 클립 교체
 */
export type EditProject = { id: string; title: string; doc: EditDoc; status: "ready" | "rendering" | "working" | "error"; message: string; output_video_id: string | null; created_at: string; updated_at: string };
export const RESOLUTIONS = { "720p": 2 / 3, "1080p": 1, "2K": 4 / 3, "4K": 2 } as const;

const HOME = os.homedir();
const RUNTIME = () => process.env.REMOTION_RUNTIME || path.join(HOME, ".ai-content-office", "remotion-runtime");
const WHISPER_PY = () => process.env.WHISPER_PYTHON || path.join(HOME, ".ai-content-office", "whisper-venv", "bin", "python");
const WHISPER_SCRIPT = () => process.env.WHISPER_SCRIPT || path.join(process.cwd(), "scripts", "transcribe.py");
const CHROME = process.env.REMOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sid = () => Math.random().toString(36).slice(2, 9);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function listEdits() {
  return q<EditProject>("SELECT * FROM edit_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100");
}
export async function getEdit(id: string) {
  return q1<EditProject>("SELECT * FROM edit_projects WHERE id=$1", [id]);
}
async function setEdit(id: string, patch: Partial<Pick<EditProject, "status" | "message" | "doc" | "output_video_id" | "title">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  await q(`UPDATE edit_projects SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (k === "doc" ? j(patch[k]) : patch[k]))]);
}

/** 새 편집: 영상공장 영상(여러 개 가능)을 차례로 메인 트랙에 */
export async function createEdit(videoIds: string[], title?: string) {
  const doc = emptyEdit();
  for (const vid of videoIds.slice(0, 30)) {
    const v = await getVideo(vid);
    if (!v || v.status !== "ready") continue;
    doc.clips.push({ id: sid(), src: v.id, kind: "video", in: 0, out: r2(v.duration ?? 5), speed: 1, volume: 1, filter: "none", transition: "none", zoom: null, fit: "cover" });
  }
  if (doc.clips[0]) {
    const v = await getVideo(doc.clips[0].src);
    if (v?.width && v?.height) doc.ratio = v.width > v.height ? "16:9" : v.width === v.height ? "1:1" : "9:16";
  }
  const id = newId("edit_");
  await q("INSERT INTO edit_projects (id, title, doc, status) VALUES ($1,$2,$3,'ready')", [id, String(title ?? "").slice(0, 120) || "새 편집", j(doc)]);
  return id;
}

export async function deleteEdit(id: string) {
  await q("UPDATE edit_projects SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL", [id]); // 휴지통으로
}

const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

/** 화면에서 고친 문서 저장 (값 범위만 정리) */
export async function saveEdit(id: string, doc: EditDoc, title?: string) {
  if (!(await getEdit(id))) throw new Error("편집을 찾을 수 없어요.");
  if (!doc || !Array.isArray(doc.clips) || !Array.isArray(doc.texts)) throw new Error("편집 내용 형식이 맞지 않아요.");
  const clean: EditDoc = {
    ratio: doc.ratio in RATIO_SIZE ? doc.ratio : "9:16",
    fps: 30,
    bg: /^#[0-9a-fA-F]{6}$/.test(String(doc.bg)) ? doc.bg : "#000000",
    muteClips: !!doc.muteClips,
    clips: doc.clips.slice(0, 200).map((c) => ({
      ...c, in: num(c.in, 0, 36000, 0), out: Math.max(num(c.in, 0, 36000, 0) + 0.1, num(c.out, 0, 36000, 1)), speed: num(c.speed, 0.25, 4, 1), volume: num(c.volume, 0, 2, 1),
      zoom: c.zoom ? { from: num(c.zoom.from, 1, 3, 1), to: num(c.zoom.to, 1, 3, 1.2), x: num(c.zoom.x, 0, 100, 50), y: num(c.zoom.y, 0, 100, 50) } : null,
    })),
    overlays: (doc.overlays ?? []).slice(0, 50).map((o) => ({ ...o, start: num(o.start, 0, 36000, 0), dur: num(o.dur, 0.1, 36000, 3), in: num(o.in, 0, 36000, 0), x: num(o.x, 0, 100, 50), y: num(o.y, 0, 100, 50), w: num(o.w, 5, 100, 40), opacity: num(o.opacity, 0, 1, 1), volume: num(o.volume, 0, 2, 0), radius: num(o.radius, 0, 100, 0) })),
    audios: (doc.audios ?? []).slice(0, 50).map((a) => ({ ...a, start: num(a.start, 0, 36000, 0), in: num(a.in, 0, 36000, 0), dur: num(a.dur, 0.1, 36000, 5), volume: num(a.volume, 0, 2, 1), label: String(a.label ?? "").slice(0, 60) })),
    texts: doc.texts.slice(0, 500).map((t) => ({ ...t, text: String(t.text ?? "").slice(0, 300), start: num(t.start, 0, 36000, 0), end: Math.max(num(t.start, 0, 36000, 0) + 0.1, num(t.end, 0, 36000, 1)), style: { ...DEFAULT_TEXT_STYLE, ...t.style } })),
  };
  await setEdit(id, { doc: clean, ...(title !== undefined ? { title: String(title).slice(0, 120) || "새 편집" } : {}) });
  return clean;
}

// ── 내보내기 ──
export async function startEditRender(id: string, resolution: string) {
  const e = await getEdit(id);
  if (!e) throw new Error("편집을 찾을 수 없어요.");
  if (e.status === "rendering") throw new Error("이미 내보내는 중이에요.");
  if (!e.doc.clips.length && !e.doc.overlays.length) throw new Error("클립이 없어요.");
  const res = resolution in RESOLUTIONS ? resolution : "1080p";
  await setEdit(id, { status: "rendering", message: `내보내기 대기 중 (${res}, 맥에서 만들어요)` });
  await enqueue("edit_render", { payload: { editId: id, resolution: res }, maxAttempts: 1 });
}

async function imageToTemp(id: string, dir: string) {
  const img = await getGeneratedImage(id);
  if (!img) throw new Error("사진을 찾을 수 없어요.");
  const ext = img.mime.includes("png") ? "png" : img.mime.includes("webp") ? "webp" : "jpg";
  const f = path.join(dir, `${id}.${ext}`);
  fs.writeFileSync(f, Buffer.from(img.data));
  return f;
}

export async function runEditRender(id: string, resolution: string) {
  const e = await getEdit(id);
  if (!e) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-render-"));
  let server: { base: string; close: () => void } | null = null;
  try {
    const doc = e.doc;
    const ids = Array.from(new Set([...doc.clips.map((c) => c.src), ...doc.overlays.map((o) => o.src), ...doc.audios.map((a) => a.src)]));
    await setEdit(id, { message: "파일 준비 중" });
    const files: Record<string, string> = {};
    for (const s of ids) {
      const f = s.startsWith("img_") ? await imageToTemp(s, dir) : await videoToTemp(s, dir);
      files[path.basename(f)] = f;
    }
    if (fs.existsSync(FONT_FILE())) files["font.ttf"] = FONT_FILE();
    server = await fileServer(files);
    const srcs = Object.fromEntries(ids.map((s) => [s, `${server!.base}/${path.basename(Object.values(files).find((f) => path.basename(f).startsWith(s))!)}`]));
    const out = path.join(dir, "edit.mp4");
    const scale = RESOLUTIONS[resolution as keyof typeof RESOLUTIONS] ?? 1;
    const job = {
      entry: path.join(process.cwd(), "src", "remotion", "index.tsx"), compositionId: "Edit",
      props: { doc, srcs, fontUrl: files["font.ttf"] ? `${server.base}/font.ttf` : "", scale }, out,
      cacheDir: path.join(HOME, ".ai-content-office", "remotion-cache"), ...(fs.existsSync(CHROME) ? { browser: CHROME } : {}),
    };
    const jobFile = path.join(dir, "job.json");
    fs.writeFileSync(jobFile, JSON.stringify(job));
    let last = -1;
    const r = await run(process.execPath, [path.join(process.cwd(), "scripts", "render-reel.mjs"), jobFile], {
      env: { REMOTION_RUNTIME: RUNTIME() },
      onLine: (l) => {
        const m = /^progress ([\d.]+)/.exec(l);
        if (!m) return;
        const pct = Math.round(Number(m[1]) * 100);
        if (pct - last >= 10 || pct === 100) {
          last = pct;
          void setEdit(id, { message: pct <= 1 ? "화면 코드 묶는 중" : `만드는 중 ${pct}% (${resolution})` });
        }
      },
    });
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error(`내보내기 실패: ${r.err.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`);
    await setEdit(id, { message: "영상공장에 저장 중" });
    const final = await fitSize(dir, "edit.mp4");
    const vid = await addVideoFile({ title: `${e.title} (${resolution})`, file: path.join(dir, final), kind: "reel", info: { description: `영상 편집 ${id}` } });
    await setEdit(id, { status: "ready", message: final === "edit.mp4" ? "내보내기 완료" : "내보내기 완료 (50MB가 넘어 화질을 낮춰 저장했어요)", output_video_id: vid });
  } catch (err) {
    await setEdit(id, { status: "error", message: (err as Error).message.slice(0, 400) });
  } finally {
    server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── 자동 자막 ──
export async function startCaptions(id: string) {
  const e = await getEdit(id);
  if (!e?.doc.clips.some((c) => c.kind === "video")) throw new Error("말소리가 있는 영상 클립이 없어요.");
  await setEdit(id, { status: "working", message: "자동 자막 만드는 중 (맥에서 받아쓰기)" });
  await enqueue("edit_captions", { payload: { editId: id }, maxAttempts: 1 });
}

export async function runCaptions(id: string) {
  const e = await getEdit(id);
  if (!e) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-cap-"));
  try {
    const doc = e.doc;
    const starts = clipStarts(doc);
    const cache = new Map<string, { start: number; end: number; text: string }[]>();
    const texts: ReelText[] = [];
    const [W, H] = RATIO_SIZE[doc.ratio];
    for (const [i, c] of doc.clips.entries()) {
      if (c.kind !== "video") continue;
      if (!cache.has(c.src)) {
        const f = await videoToTemp(c.src, dir);
        const r = await run(WHISPER_PY(), [WHISPER_SCRIPT(), f, process.env.WHISPER_MODEL || "small"], { env: { FFMPEG: ffmpegPath() } });
        cache.set(c.src, r.code === 0 ? (JSON.parse(r.out.trim().split("\n").pop() || "{}").segments ?? []) : []);
      }
      for (const s of cache.get(c.src)!) {
        // 자른 구간 안의 말만, 배속에 맞춰 타임라인 시각으로
        const a = Math.max(s.start, c.in), b = Math.min(s.end, c.out);
        if (b - a < 0.2) continue;
        const t0 = starts[i] + (c.reversed ? c.out - b : a - c.in) / c.speed;
        const t1 = Math.min(starts[i] + clipLen(c), t0 + (b - a) / c.speed);
        texts.push({ id: sid(), start: r2(t0), end: r2(t1), text: s.text, style: { ...DEFAULT_TEXT_STYLE, x: W / 2, y: Math.round(H * 0.78), width: Math.round(W * 0.85), box: "#000000", color: "#ffffff", stroke: "", size: Math.round(W * 0.055), anim: "pop" } });
      }
    }
    const keep = doc.texts.filter((t) => !(t as ReelText & { auto?: boolean }).auto);
    await setEdit(id, { doc: { ...doc, texts: [...keep, ...texts.map((t) => ({ ...t, auto: true }) as ReelText)] }, status: "ready", message: texts.length ? `자막 ${texts.length}개를 넣었어요` : "말소리를 찾지 못했어요" });
  } catch (err) {
    await setEdit(id, { status: "error", message: (err as Error).message.slice(0, 300) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── 역재생 ──
export async function startReverse(id: string, clipId: string) {
  const e = await getEdit(id);
  const c = e?.doc.clips.find((x) => x.id === clipId);
  if (!e || !c || c.kind !== "video") throw new Error("영상 클립을 골라 주세요.");
  if (c.out - c.in > 120) throw new Error("역재생은 2분 이하 구간만 돼요. 먼저 잘라 주세요.");
  await setEdit(id, { status: "working", message: "역재생 만드는 중 (맥)" });
  await enqueue("edit_reverse", { payload: { editId: id, clipId }, maxAttempts: 1 });
}

export async function runReverse(id: string, clipId: string) {
  const e = await getEdit(id);
  const c = e?.doc.clips.find((x) => x.id === clipId);
  if (!e || !c) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-rev-"));
  try {
    const f = await videoToTemp(c.src, dir);
    const out = path.join(dir, "rev.mp4");
    const r = await run(ffmpegPath(), ["-v", "error", "-y", "-ss", String(c.in), "-to", String(c.out), "-i", f, "-vf", "reverse", "-af", "areverse", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", out], { timeoutMs: 10 * 60 * 1000 });
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error(`역재생 실패: ${r.err.slice(-200)}`);
    const v = await getVideo(c.src);
    const vid = await addVideoFile({ title: `${v?.title ?? "클립"} (역재생)`, file: out, kind: "edit", info: { description: `영상 편집 ${id} 역재생` } });
    const cur = (await getEdit(id))!;
    const clips = cur.doc.clips.map((x) => (x.id === clipId ? { ...x, src: vid, in: 0, out: r2(c.out - c.in), reversed: !x.reversed } : x));
    await setEdit(id, { doc: { ...cur.doc, clips }, status: "ready", message: "역재생으로 바꿨어요" });
  } catch (err) {
    await setEdit(id, { status: "error", message: (err as Error).message.slice(0, 300) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── 2단계: 맥 AI 도구 (모두 무료·맥에서) ──
// 배경 제거(rembg) · 화질 키우기(Real-ESRGAN) · 슬로모션(RIFE 프레임 보간) · AI 음성(edge-tts)
const TOOLS = path.join(HOME, ".ai-content-office");
const AI_PY = () => process.env.AI_TOOLS_PYTHON || path.join(TOOLS, "ai-tools-venv", "bin", "python");
const EDGE_TTS = () => process.env.EDGE_TTS_BIN || path.join(TOOLS, "ai-tools-venv", "bin", "edge-tts");
const ESRGAN = () => process.env.ESRGAN_BIN || path.join(TOOLS, "ncnn", "esrgan", "realesrgan-ncnn-vulkan");
const RIFE = () => process.env.RIFE_BIN || path.join(TOOLS, "ncnn", "rife", "rife-ncnn-vulkan");
export const FX = {
  bgremove: { label: "배경 제거", max: 20 },
  upscale2: { label: "화질 2배", max: 15 },
  upscale4: { label: "화질 4배", max: 10 },
  slow2: { label: "슬로모션 2배", max: 15 },
  slow4: { label: "슬로모션 4배", max: 8 },
} as const;
export type FxKind = keyof typeof FX;
export const VOICES = [
  { id: "ko-KR-SunHiNeural", label: "선희 (여성)" },
  { id: "ko-KR-InJoonNeural", label: "인준 (남성)" },
  { id: "ko-KR-HyunsuMultilingualNeural", label: "현수 (남성·다국어)" },
] as const;

function findTarget(doc: EditDoc, itemId: string) {
  const clip = doc.clips.find((c) => c.id === itemId);
  if (clip) return { type: "clip" as const, src: clip.src, kind: clip.kind, a: clip.in, b: clip.out };
  const ov = doc.overlays.find((o) => o.id === itemId);
  if (ov) return { type: "overlay" as const, src: ov.src, kind: ov.kind, a: ov.in, b: ov.in + ov.dur };
  return null;
}

export async function startClipFx(id: string, itemId: string, fx: string) {
  const e = await getEdit(id);
  if (!e) throw new Error("편집을 찾을 수 없어요.");
  if (!(fx in FX)) throw new Error("알 수 없는 효과예요.");
  if (e.status === "working" || e.status === "rendering") throw new Error("다른 작업이 끝난 뒤에 해 주세요.");
  const t = findTarget(e.doc, itemId);
  if (!t) throw new Error("클립이나 오버레이를 골라 주세요.");
  const f = FX[fx as FxKind];
  if (t.kind === "image" && fx.startsWith("slow")) throw new Error("사진에는 슬로모션을 쓸 수 없어요.");
  if (t.kind === "video" && t.b - t.a > f.max) throw new Error(`${f.label}은(는) ${f.max}초 이하 구간만 돼요. 먼저 잘라 주세요. (지금 ${Math.round(t.b - t.a)}초)`);
  await setEdit(id, { status: "working", message: `${f.label} 준비 중 (맥에서)` });
  await enqueue("edit_fx", { payload: { editId: id, itemId, fx }, maxAttempts: 1 });
}

async function saveImage(file: string, label: string) {
  const imgId = `img_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'edit',$2,'image/png',$3,$4)", [imgId, label, fs.readFileSync(file), label]);
  return imgId;
}

export async function runClipFx(id: string, itemId: string, fx: FxKind) {
  const e = await getEdit(id);
  const t = e ? findTarget(e.doc, itemId) : null;
  if (!e || !t) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-fx-"));
  const label = FX[fx].label;
  const say = (m: string) => setEdit(id, { message: `${label}: ${m}` });
  try {
    let newSrc = "";
    let newLen = t.b - t.a;
    let alpha = false;
    if (t.kind === "image") {
      // 사진: 한 장만
      const src = await imageToTemp(t.src, dir);
      const out = path.join(dir, "out.png");
      if (fx === "bgremove") {
        await say("사람만 남기는 중");
        const r = await run(AI_PY(), [path.join(process.cwd(), "scripts", "bgremove.py"), src, out], { timeoutMs: 5 * 60 * 1000 });
        if (r.code !== 0 || !fs.existsSync(out)) throw new Error(`배경 제거 실패: ${r.err.slice(-200)}`);
      } else {
        await say("화질 키우는 중");
        const up = path.join(dir, "up.png");
        const r = await run(ESRGAN(), ["-i", src, "-o", up, "-n", "realesrgan-x4plus", "-s", "4", "-m", path.join(path.dirname(ESRGAN()), "models"), "-f", "png"], { timeoutMs: 10 * 60 * 1000 });
        if (r.code !== 0 || !fs.existsSync(up)) throw new Error(`화질 키우기 실패: ${r.err.slice(-200)}`);
        // 2배면 4배 결과를 반으로 · 긴 변 4096 이하
        const k = fx === "upscale2" ? 0.5 : 1;
        const s = await run(ffmpegPath(), ["-v", "error", "-y", "-i", up, "-vf", `scale='min(4096,iw*${k})':-2`, out]);
        if (s.code !== 0) throw new Error(`크기 맞추기 실패: ${s.err.slice(-200)}`);
      }
      newSrc = await saveImage(out, `${label} ${t.src}`);
    } else {
      const f = await videoToTemp(t.src, dir);
      const frames = path.join(dir, "frames");
      fs.mkdirSync(frames);
      const fps = fx === "bgremove" ? 15 : 30;
      const cap = fx === "bgremove" ? 1080 : fx.startsWith("upscale") ? 1080 : 1920;
      await say("장면을 사진으로 나누는 중");
      const ex = await run(ffmpegPath(), ["-v", "error", "-y", "-ss", String(t.a), "-to", String(t.b), "-i", f, "-vf", `fps=${fps},scale='if(gt(iw,ih),min(${cap},iw),-2)':'if(gt(iw,ih),-2,min(${cap},ih))'`, path.join(frames, "%06d.png")]);
      const count = fs.readdirSync(frames).length;
      if (ex.code !== 0 || !count) throw new Error(`장면 나누기 실패: ${ex.err.slice(-200)}`);
      const audioIn = ["-ss", String(t.a), "-to", String(t.b), "-i", f];
      let outFile = path.join(dir, "fx.mp4");
      let last = -1;
      const prog = (l: string) => {
        const m = /^progress ([\d.]+)/.exec(l);
        if (!m) return;
        const pct = Math.round(Number(m[1]) * 100);
        if (pct - last >= 10) { last = pct; void say(`${pct}%`); }
      };
      if (fx === "bgremove") {
        await say(`사람만 남기는 중 (${count}장, 장당 약 1초)`);
        const out = path.join(dir, "cut");
        const r = await run(AI_PY(), [path.join(process.cwd(), "scripts", "bgremove.py"), frames, out], { timeoutMs: 40 * 60 * 1000, onLine: prog });
        if (r.code !== 0) throw new Error(`배경 제거 실패: ${r.err.slice(-200)}`);
        // 투명 배경 영상 (VP9 + 알파)
        outFile = path.join(dir, "fx.webm");
        const a = await run(ffmpegPath(), ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(out, "%06d.png"), ...audioIn, "-map", "0:v", "-map", "1:a?", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "32", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-shortest", outFile], { timeoutMs: 20 * 60 * 1000 });
        if (a.code !== 0) throw new Error(`투명 영상 만들기 실패: ${a.err.slice(-200)}`);
        alpha = true;
      } else if (fx.startsWith("upscale")) {
        const k = fx === "upscale2" ? 2 : 4;
        await say(`${count}장 화질 키우는 중`);
        const up = path.join(dir, "up");
        fs.mkdirSync(up);
        const r = await run(ESRGAN(), ["-i", frames, "-o", up, "-n", "realesr-animevideov3", "-s", String(k), "-m", path.join(path.dirname(ESRGAN()), "models"), "-f", "png"], { timeoutMs: 40 * 60 * 1000 });
        if (r.code !== 0 || !fs.readdirSync(up).length) throw new Error(`화질 키우기 실패: ${r.err.slice(-200)}`);
        // 긴 변 3840(4K) 이하, 짝수
        const a = await run(ffmpegPath(), ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(up, "%06d.png"), ...audioIn, "-map", "0:v", "-map", "1:a?", "-vf", "scale='if(gt(iw,ih),min(3840,iw),-2)':'if(gt(iw,ih),-2,min(3840,ih))'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", outFile], { timeoutMs: 20 * 60 * 1000 });
        if (a.code !== 0) throw new Error(`영상 합치기 실패: ${a.err.slice(-200)}`);
      } else {
        const k = fx === "slow2" ? 2 : 4;
        await say(`사이 장면 ${count * (k - 1)}장 만드는 중`);
        const slow = path.join(dir, "slow");
        fs.mkdirSync(slow);
        const r = await run(RIFE(), ["-i", frames, "-o", slow, "-m", path.join(path.dirname(RIFE()), "rife-v4.6"), "-n", String(count * k)], { timeoutMs: 40 * 60 * 1000 });
        if (r.code !== 0 || !fs.readdirSync(slow).length) throw new Error(`슬로모션 실패: ${r.err.slice(-200)}`);
        const tempo = k === 2 ? "atempo=0.5" : "atempo=0.5,atempo=0.5";
        const a = await run(ffmpegPath(), ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(slow, "%08d.png"), ...audioIn, "-map", "0:v", "-map", "1:a?", "-af", tempo, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", outFile], { timeoutMs: 20 * 60 * 1000 });
        if (a.code !== 0) throw new Error(`영상 합치기 실패: ${a.err.slice(-200)}`);
      }
      await say("영상공장에 저장 중");
      // 투명 영상은 줄이면 투명이 사라져서 그대로 (50MB 넘으면 안내)
      let final = path.basename(outFile);
      if (alpha) {
        if (fs.statSync(outFile).size > 50 * 1024 * 1024) throw new Error("배경 제거 영상이 너무 커요(50MB 초과). 더 짧게 잘라 주세요.");
      } else final = await fitSize(dir, final);
      const v = await getVideo(t.src);
      newSrc = await addVideoFile({ title: `${v?.title ?? "클립"} (${label})`, file: path.join(dir, final), kind: "edit", info: { description: `영상 편집 ${id} ${label}` } });
      newLen = (await getVideo(newSrc))?.duration ?? newLen * (fx === "slow2" ? 2 : fx === "slow4" ? 4 : 1);
    }
    const cur = (await getEdit(id))!;
    const doc = {
      ...cur.doc,
      clips: cur.doc.clips.map((c) => (c.id === itemId ? { ...c, src: newSrc, in: 0, out: c.kind === "image" ? c.out - c.in : r2(newLen), alpha: alpha || undefined } : c)),
      overlays: cur.doc.overlays.map((o) => (o.id === itemId ? { ...o, src: newSrc, in: 0, dur: o.kind === "image" ? o.dur : r2(fx.startsWith("slow") ? newLen : Math.min(o.dur, newLen)), alpha: alpha || undefined } : o)),
    };
    await setEdit(id, { doc, status: "ready", message: `${label} 했어요` });
  } catch (err) {
    await setEdit(id, { status: "error", message: (err as Error).message.slice(0, 300) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── AI 음성 (edge-tts, 무료) ──
export async function startTts(id: string, input: { text?: string; voice?: string; rate?: number; start?: number; captions?: boolean }) {
  const e = await getEdit(id);
  if (!e) throw new Error("편집을 찾을 수 없어요.");
  const text = String(input.text ?? "").trim();
  if (!text) throw new Error("읽어 줄 글을 적어 주세요.");
  if (text.length > 3000) throw new Error("3000자 이하로 적어 주세요.");
  if (e.status === "working" || e.status === "rendering") throw new Error("다른 작업이 끝난 뒤에 해 주세요.");
  const voice = VOICES.some((v) => v.id === input.voice) ? String(input.voice) : VOICES[0].id;
  const rate = Math.max(-50, Math.min(100, Math.round(Number(input.rate) || 0)));
  await setEdit(id, { status: "working", message: "AI 음성 만드는 중 (맥에서)" });
  await enqueue("edit_tts", { payload: { editId: id, text, voice, rate, start: Math.max(0, Number(input.start) || 0), captions: !!input.captions }, maxAttempts: 1 });
}

export async function runTts(id: string, p: { text: string; voice: string; rate: number; start: number; captions: boolean }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-tts-"));
  try {
    const txt = path.join(dir, "in.txt");
    fs.writeFileSync(txt, p.text);
    const mp3 = path.join(dir, "voice.mp3");
    const r = await run(EDGE_TTS(), ["--voice", p.voice, `--rate=${p.rate >= 0 ? "+" : ""}${p.rate}%`, "-f", txt, "--write-media", mp3], { timeoutMs: 5 * 60 * 1000 });
    if (r.code !== 0 || !fs.existsSync(mp3)) throw new Error(`AI 음성 실패 (인터넷 연결 확인): ${r.err.trim().split("\n").pop()?.slice(0, 200) ?? r.code}`);
    // 편집기·영상공장에서 같은 방식으로 쓰게 검은 화면 mp4 로
    const mp4 = path.join(dir, "voice.mp4");
    const c = await run(ffmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x320:r=5", "-i", mp3, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", mp4]);
    if (c.code !== 0) throw new Error(`음성 저장 실패: ${c.err.slice(-200)}`);
    const vid = await addVideoFile({ title: `🗣 AI 음성: ${p.text.slice(0, 40)}`, file: mp4, kind: "edit", info: { description: `영상 편집 ${id} AI 음성 (${p.voice})` } });
    const dur = (await getVideo(vid))?.duration ?? 3;
    const cur = (await getEdit(id))!;
    const audios = [...cur.doc.audios, { id: sid(), src: vid, start: r2(p.start), in: 0, dur: r2(dur), volume: 1, label: `🗣 ${p.text.slice(0, 20)}` }];
    let texts = cur.doc.texts;
    if (p.captions) {
      // 문장마다 자막: 글자 수 비율로 시간 나눔
      const sents = p.text.split(/(?<=[.!?。…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
      const total = sents.reduce((a, s) => a + s.length, 0) || 1;
      const [W, H] = RATIO_SIZE[cur.doc.ratio];
      let t0 = p.start;
      const add = sents.map((s) => {
        const len = (dur * s.length) / total;
        const x: ReelText = { id: sid(), start: r2(t0), end: r2(t0 + len), text: s, style: { ...DEFAULT_TEXT_STYLE, x: W / 2, y: Math.round(H * 0.78), width: Math.round(W * 0.85), box: "#000000", color: "#ffffff", stroke: "", size: Math.round(W * 0.055), anim: "pop" } };
        t0 += len;
        return x;
      });
      texts = [...texts, ...add];
    }
    await setEdit(id, { doc: { ...cur.doc, audios, texts }, status: "ready", message: `AI 음성을 넣었어요 (${Math.round(dur)}초)` });
  } catch (err) {
    await setEdit(id, { status: "error", message: (err as Error).message.slice(0, 300) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
