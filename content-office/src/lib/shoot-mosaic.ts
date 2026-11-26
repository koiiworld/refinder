import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ffmpegPath, probe } from "./videos";
import { extractJson, runStep } from "./ai/run";

/**
 * 🫥 현장 숏폼 얼굴 모자이크 (맥에서 처리)
 * ① 클립에서 1초에 2장씩 장면 사진을 뽑아 ② Claude(단계 shootface)가 사진마다 얼굴 위치를 알려 주면
 * ③ 그 자리를 앞뒤 사진 시각까지 넉넉히(둘레 35% 더) 모자이크로 덮은 새 영상을 만든다.
 * - AI가 모든 장면(1초 30장)을 보는 게 아니라서 사진 사이에 빠르게 지나가는 얼굴은 놓칠 수 있음 → 화면에 그렇게 안내
 * - 얼굴 찾기에 실패하면 가리지 않은 영상으로 넘어가지 않고 멈춤 (다른 AI로 자동 대체 없음)
 */
export const FACE_FPS = 2;
const MAX_FRAMES = 120; // 클립 하나에 최대 (60초까지 1초 2장, 더 길면 간격이 벌어짐)
const BATCH = 8; // 한 번에 보내는 사진 수 (많으면 사진 번호를 헷갈림)
const MARGIN = 0.35;

export type FaceBox = { x: number; y: number; w: number; h: number }; // 0~1 비율
export type FaceTrack = FaceBox & { from: number; to: number };

type Run = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<{ code: number; out: string; err: string }>;

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const iou = (a: FaceBox, b: FaceBox) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = x * y;
  return i / (a.w * a.h + b.w * b.h - i || 1);
};
const union = (a: FaceBox, b: FaceBox): FaceBox => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** AI 답(사진 번호별 [x1,y1,x2,y2] 0~1000) → 둘레를 넓힌 0~1 상자 */
export function parseFaces(raw: unknown, count: number): FaceBox[][] {
  const out: FaceBox[][] = Array.from({ length: count }, () => []);
  const frames = (raw as { frames?: { n?: number; faces?: unknown[] }[] })?.frames;
  for (const f of Array.isArray(frames) ? frames : []) {
    const k = Math.round(Number(f?.n)) - 1;
    if (!out[k]) continue;
    for (const b of Array.isArray(f.faces) ? f.faces.slice(0, 20) : []) {
      const v = (Array.isArray(b) ? b : []).map((n) => Number(n) / 1000);
      if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) continue;
      const x1 = Math.min(v[0], v[2]), x2 = Math.max(v[0], v[2]), y1 = Math.min(v[1], v[3]), y2 = Math.max(v[1], v[3]);
      const w = x2 - x1, h = y2 - y1;
      if (w < 0.005 || h < 0.005) continue;
      const x = clamp(x1 - w * MARGIN), y = clamp(y1 - h * MARGIN);
      out[k].push({ x, y, w: clamp(x2 + w * MARGIN) - x, h: clamp(y2 + h * MARGIN) - y });
    }
  }
  return out;
}

/**
 * 사진별 얼굴 → 가릴 구간 목록. 한 사진의 얼굴은 앞 사진 시각 ~ 다음 사진 시각까지 덮고(그 사이 움직임 대비),
 * 이어지는 사진에서 겹치는 얼굴은 하나로 합쳐(최대 6장) 필터 수를 줄임
 */
export function faceTracks(times: number[], faces: FaceBox[][], duration: number): FaceTrack[] {
  const done: FaceTrack[] = [];
  let open: (FaceTrack & { n: number; last: FaceBox })[] = [];
  times.forEach((t, i) => {
    const from = i === 0 ? 0 : times[i - 1], to = i === times.length - 1 ? duration + 1 : times[i + 1];
    const next: typeof open = [];
    for (const b of faces[i] ?? []) {
      const k = open.findIndex((o) => o.n < 6 && iou(o.last, b) > 0.25);
      if (k >= 0) {
        const o = open.splice(k, 1)[0];
        next.push({ ...union(o, b), from: o.from, to, n: o.n + 1, last: b });
      } else next.push({ ...b, from, to, n: 1, last: b });
    }
    done.push(...open.map(({ n: _n, last: _l, ...r }) => r));
    open = next;
  });
  done.push(...open.map(({ n: _n, last: _l, ...r }) => r));
  return done;
}

/** 가릴 구간 → ffmpeg 필터 (상자마다 그 자리만 잘라 모자이크로 바꿔 그 시간에만 덮음). W·H = 화면에 보이는 방향의 영상 크기(px) */
export function mosaicFilter(tracks: FaceTrack[], W: number, H: number) {
  let chain = "[0:v]null[s0]";
  tracks.forEach((b, i) => {
    const x = Math.max(0, Math.min(W - 16, Math.floor(b.x * W))), y = Math.max(0, Math.min(H - 16, Math.floor(b.y * H)));
    const w = Math.max(16, Math.min(W - x, Math.ceil(b.w * W))), h = Math.max(16, Math.min(H - y, Math.ceil(b.h * H)));
    const block = Math.max(8, Math.round(Math.min(w, h) / 7)); // 얼굴 하나에 7칸쯤 → 크게 찍힌 얼굴도 못 알아보게
    chain += `;[s${i}]split[m${i}][c${i}];[c${i}]crop=${w}:${h}:${x}:${y},pixelize=w=${block}:h=${block}[b${i}];[m${i}][b${i}]overlay=${x}:${y}:enable='between(t,${b.from.toFixed(2)},${b.to.toFixed(2)})'[s${i + 1}]`;
  });
  return `${chain};[s${tracks.length}]format=yuv420p[v]`;
}

/**
 * 클립 하나: 얼굴을 찾아 모자이크한 파일을 만든다
 * → { file: 모자이크한 mp4(얼굴이 없으면 null), faces: 가린 구간 수, frames: AI가 본 사진 수 }
 */
export async function mosaicClip(input: { file: string; dir: string; tag: string; duration: number; run: Run; onStep?: (msg: string) => void }) {
  const { file, dir, tag, duration, run } = input;
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.ceil(duration * FACE_FPS)));
  const gap = duration / count;
  const times = Array.from({ length: count }, (_, i) => Math.round((i * gap + Math.min(0.1, gap / 2)) * 100) / 100);
  const shots: { t: number; url: string }[] = [];
  for (const [i, t] of times.entries()) {
    const out = path.join(dir, `${tag}-face-${i}.jpg`);
    await run(ffmpegPath(), ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out], { timeoutMs: 60_000 });
    if (fs.existsSync(out)) shots.push({ t, url: `data:image/jpeg;base64,${fs.readFileSync(out).toString("base64")}` });
  }
  if (!shots.length) throw new Error("얼굴을 찾을 장면 사진을 뽑지 못했어요.");
  const faces: FaceBox[][] = [];
  for (let i = 0; i < shots.length; i += BATCH) {
    const part = shots.slice(i, i + BATCH);
    input.onStep?.(`얼굴 찾는 중 ${Math.min(shots.length, i + BATCH)}/${shots.length}장`);
    const res = await runStep({
      step: "shootface", role: "ideas", purpose: "shoot_face", blog: null, json: true, maxTokens: 2500, images: part.map((s) => s.url), retries: 0, noFallback: true,
      system: "너는 영상 속 사람 얼굴을 가리기 위한 얼굴 위치 찾기 도우미야. 누구인지 알아보거나 추측하지 않는다. 사진에 보이는 사람 얼굴의 위치만 찾는다. 답은 JSON만.",
      prompt: `사진 ${part.length}장을 순서대로 줬어 (1번~${part.length}번). 사진마다 보이는 사람 얼굴을 모두 찾아 줘. 작게 보이는 뒤쪽 사람, 옆얼굴, 일부만 보이는 얼굴, 거울·화면에 비친 얼굴도 포함해. 뒤통수만 보이면 빼. 얼굴이 없으면 빈 배열.
위치는 그 사진의 왼쪽 위가 (0,0), 오른쪽 아래가 (1000,1000)인 [x1,y1,x2,y2] (이마~턱, 양쪽 귀까지 넉넉히).
{"frames":[{"n":1,"faces":[[x1,y1,x2,y2]]},{"n":2,"faces":[]}]}`,
    });
    faces.push(...parseFaces(extractJson(res.text), part.length));
  }
  const tracks = faceTracks(shots.map((s) => s.t), faces, duration);
  if (!tracks.length) return { file: null, faces: 0, frames: shots.length };
  if (tracks.length > 150) throw new Error("가릴 얼굴이 너무 많아요. 이 클립은 빼거나 짧게 잘라서 올려 주세요.");
  input.onStep?.(`얼굴 ${tracks.length}곳 가리는 중`);
  const out = path.join(dir, `${tag}-mosaic.mp4`);
  const script = path.join(dir, `${tag}-mosaic.txt`);
  // 화면에 보이는 방향의 실제 크기 (세로로 찍은 휴대폰 영상은 저장된 크기와 가로·세로가 반대일 수 있어 사진 한 장을 뽑아 잼)
  const full = path.join(dir, `${tag}-size.png`);
  await run(ffmpegPath(), ["-v", "error", "-y", "-i", file, "-frames:v", "1", full], { timeoutMs: 60_000 });
  const size = fs.existsSync(full) ? await probe(full) : null;
  if (!size?.width || !size?.height) throw new Error("영상 크기를 읽지 못해 모자이크를 하지 못했어요.");
  fs.writeFileSync(script, mosaicFilter(tracks, size.width, size.height));
  const r = await run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-filter_complex_script", script, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], { timeoutMs: 30 * 60 * 1000 });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(`모자이크 실패: ${r.err.trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
  return { file: out, faces: tracks.length, frames: shots.length };
}
