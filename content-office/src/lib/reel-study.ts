import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { q, q1, newId, j } from "./db";
import { enqueue } from "./jobs";
import { addVideoLink, ffmpegPath, getVideo, probe } from "./videos";
import { getFile } from "./video-store";
import { extractJson, runStep } from "./ai/run";

/**
 * 🔍 릴스 분석기 (맥 전용 처리, AI는 무료 Gemini)
 * 링크 → 영상공장으로 받기 → 말 받아쓰기(faster-whisper) → 첫 3초·장면 바뀔 때마다 사진 → AI가 직접 보고 분석
 * - 내 릴스: 첫 3초가 어땠는지·고칠 점 / 참고 릴스: 왜 잘 됐는지·구조·내 채널에 적용할 아이디어
 * - 카테고리별로 모아 보관
 */
export type StudyReel = {
  id: string; url: string; video_id: string | null; mine: boolean; status: "queued" | "running" | "done" | "error"; message: string;
  title: string; uploader: string; category: string; transcript: { start: number; end: number; text: string }[]; frames: { t: number; img: string; first?: boolean }[];
  analysis: StudyAnalysis; created_at: string; updated_at: string;
};
export type StudyAnalysis = {
  summary?: string;
  hook?: { text: string; verdict: string; score: number };
  structure?: { t: string; part: string; desc: string }[];
  scenes?: { t: number; desc: string }[];
  whyWorks?: string[];
  improve?: string[];
  apply?: string[];
  format?: string;
};
export const STUDY_CATEGORIES = ["AI·테크", "요리·살림", "육아", "생활정보", "재테크", "뷰티·패션", "여행", "마케팅·SNS", "자기계발", "기타"];

const HOME = os.homedir();
const WHISPER_PY = () => process.env.WHISPER_PYTHON || path.join(HOME, ".ai-content-office", "whisper-venv", "bin", "python");
const WHISPER_SCRIPT = () => process.env.WHISPER_SCRIPT || path.join(process.cwd(), "scripts", "transcribe.py");

export async function listStudies() {
  return q<StudyReel>("SELECT * FROM study_reels ORDER BY created_at DESC LIMIT 300");
}
export async function getStudy(id: string) {
  return q1<StudyReel>("SELECT * FROM study_reels WHERE id=$1", [id]);
}
async function setStudy(id: string, patch: Partial<StudyReel>) {
  const keys = Object.keys(patch) as (keyof StudyReel)[];
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`UPDATE study_reels SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (["transcript", "frames", "analysis"].includes(k) ? j(patch[k]) : patch[k]))]);
}

/** 링크 여러 개 넣기 (한 줄에 하나) → 받기 시작 */
export async function addStudies(urls: string[], mine: boolean) {
  const list = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 20);
  if (!list.length) throw new Error("릴스 주소를 넣어 주세요.");
  const ids: string[] = [];
  for (const url of list) {
    const videoId = await addVideoLink(url, false); // 영상공장에 받아 둠 (편집기로도 바로 열 수 있게)
    const id = newId("study_");
    await q("INSERT INTO study_reels (id, url, video_id, mine, status, message) VALUES ($1,$2,$3,$4,'queued','영상 받는 중')", [id, url, videoId, mine]);
    await enqueue("reel_study", { payload: { studyId: id }, maxAttempts: 1, runAfter: new Date(Date.now() + 15_000) });
    ids.push(id);
  }
  return ids;
}

export async function deleteStudy(id: string) {
  await q("DELETE FROM study_reels WHERE id=$1", [id]);
}
export async function setCategory(id: string, category: string) {
  await setStudy(id, { category: category.trim().slice(0, 30) || "기타" });
}

function run(cmd: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-20_000)));
    const t = setTimeout(() => p.kill("SIGKILL"), 15 * 60 * 1000);
    p.on("error", (e) => { clearTimeout(t); resolve({ code: 1, out, err: e.message }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, out, err }); });
  });
}

/** 장면이 바뀌는 시각 (최대 10개) + 첫 3초 (0·1·2초) */
async function frameTimes(file: string, duration: number) {
  const r = await run(ffmpegPath(), ["-hide_banner", "-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"]);
  let cuts = Array.from(r.err.matchAll(/pts_time:([\d.]+)/g)).map((m) => Number(m[1])).filter((t) => t > 3 && t < duration - 0.3);
  cuts = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] >= 1.5);
  if (cuts.length > 10) cuts = Array.from({ length: 10 }, (_, i) => cuts[Math.floor((i * cuts.length) / 10)]);
  if (!cuts.length) for (let t = 5; t < duration - 0.5 && cuts.length < 6; t += Math.max(3, duration / 7)) cuts.push(Math.round(t * 10) / 10);
  const first = [0, 1, 2].filter((t) => t < duration).map((t) => ({ t: t + 0.3, first: true }));
  return [...first, ...cuts.map((t) => ({ t: Math.round((t + 0.2) * 10) / 10, first: false }))];
}

async function grab(file: string, t: number, out: string) {
  await run(ffmpegPath(), ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", out]);
  return fs.existsSync(out) ? fs.readFileSync(out) : null;
}

/** 작업: 분석 (맥) — 영상이 아직 받아지는 중이면 잠시 뒤 다시 */
export async function runReelStudy(id: string) {
  const s = await getStudy(id);
  if (!s) return;
  const v = s.video_id ? await getVideo(s.video_id) : null;
  if (!v || v.status === "error") return setStudy(id, { status: "error", message: v?.message || "영상을 받지 못했어요." });
  if (v.status !== "ready" || !v.path) {
    await setStudy(id, { message: "영상 받는 중" });
    await enqueue("reel_study", { payload: { studyId: id }, maxAttempts: 1, runAfter: new Date(Date.now() + 15_000) });
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "study-"));
  try {
    await setStudy(id, { status: "running", message: "말 받아쓰는 중", title: v.title, uploader: String((v.info as { uploader?: string })?.uploader ?? "") });
    const file = path.join(dir, "v.mp4");
    fs.writeFileSync(file, await getFile(v.path));
    const duration = (await probe(file)).duration ?? v.duration ?? 0;
    let segments: StudyReel["transcript"] = [];
    if (fs.existsSync(WHISPER_PY()) || process.env.WHISPER_PYTHON) {
      const r = await run(WHISPER_PY(), [WHISPER_SCRIPT(), file, process.env.WHISPER_MODEL || "small"], { FFMPEG: ffmpegPath() });
      if (r.code === 0) segments = (JSON.parse(r.out.trim().split("\n").pop() || "{}").segments ?? []) as typeof segments;
    }
    await setStudy(id, { message: "장면 사진 뽑는 중", transcript: segments });
    const frames: StudyReel["frames"] = [];
    const dataUrls: string[] = [];
    for (const [k, f] of (await frameTimes(file, duration)).entries()) {
      const buf = await grab(file, f.t, path.join(dir, `f${k}.jpg`));
      if (!buf) continue;
      const img = `img_${crypto.randomBytes(12).toString("hex")}`;
      await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'study','frame','image/jpeg',$2,$3)", [img, buf, `${id}@${f.t}`]);
      frames.push({ t: f.t, img, first: f.first });
      dataUrls.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
    }
    await setStudy(id, { message: "AI가 보고 분석하는 중", frames });
    const script = segments.map((x) => `[${x.start.toFixed(1)}s] ${x.text}`).join("\n") || "(말소리 없음)";
    const system = "너는 인스타 릴스·쇼츠를 분석하는 한국어 콘텐츠 전략가야. 함께 준 화면 사진을 직접 보고 판단해. 없는 내용은 지어내지 마. 답은 JSON만.";
    const prompt = `${s.mine ? "내가 올린 릴스야. 첫 3초가 시청자를 붙잡았는지 냉정하게 보고, 고칠 점을 알려 줘." : "잘 된 참고 릴스야. 왜 잘 됐는지 구조를 뜯어 보고, 내 채널에 적용할 아이디어를 줘."}
제목/설명: ${v.title}
길이: ${Math.round(duration)}초
사진 순서와 시각: ${frames.map((f, i) => `${i + 1}번=${f.t}초${f.first ? "(첫 3초)" : ""}`).join(", ")}

[말소리 받아쓰기]
${script.slice(0, 5000)}

카테고리는 다음 중 하나: ${STUDY_CATEGORIES.join(", ")}
{"category": "...", "summary": "한 줄 요약", "format": "형식(예: 리스트형·튜토리얼·브이로그·밈)", "hook": {"text": "첫 3초에 보이는 화면·자막·말", "verdict": "붙잡는 힘에 대한 판단", "score": 1~10}, "structure": [{"t": "0~3초", "part": "훅", "desc": "..."}], "scenes": [{"t": 사진 시각(초), "desc": "그 사진에 보이는 것"}], "whyWorks": ["..."], ${s.mine ? '"improve": ["고칠 점"],' : ""} "apply": ["내 채널에 적용할 구체적 아이디어"]}`;
    const res = await runStep({ step: "reelstudy", role: "ideas", purpose: "reel_study", blog: null, system, prompt, json: true, maxTokens: 3000, images: dataUrls, retries: 0 });
    const a = extractJson<StudyAnalysis & { category?: string }>(res.text);
    const category = STUDY_CATEGORIES.includes(String(a.category)) ? String(a.category) : "기타";
    const { category: _c, ...analysis } = a;
    void _c;
    await setStudy(id, { status: "done", message: "", category, analysis: { ...analysis, hook: analysis.hook ? { ...analysis.hook, score: Math.max(1, Math.min(10, Number(analysis.hook.score) || 0)) } : undefined } });
  } catch (e) {
    await setStudy(id, { status: "error", message: (e as Error).message.slice(0, 300) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
