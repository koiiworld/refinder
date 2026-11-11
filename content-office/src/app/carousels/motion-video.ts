// 🎞 모션 캐러셀: 카드 한 장을 짧은 MP4 영상으로 (브라우저에서 바로 — 맥·서버 필요 없음, 무료)
// - 크롬·엣지(윈도우 포함): WebCodecs로 프레임을 하나씩 그려 H.264 MP4로 → 실제 시간보다 빠르고 화질 일정
// - 지원 안 되는 브라우저: 화면 녹화(MediaRecorder)로 대신 (실제 시간만큼 걸림, 형식은 브라우저에 따라 mp4/webm)
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { SH as H, SW as W } from "@/lib/carousel-scene";

export const FPS = 30;
type Draw = (canvas: HTMLCanvasElement, t: number) => void | Promise<void>;

async function pickCodec() {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42003e", "avc1.42002a"]) {
    const cfg: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
    } catch {}
  }
  return null;
}

async function encodeWebCodecs(cfg: VideoEncoderConfig, draw: Draw, seconds: number, onProgress?: (p: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: W, height: H, frameRate: FPS }, fastStart: "in-memory" });
  let failed: Error | null = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e as Error; } });
  enc.configure(cfg);
  const frames = Math.round(seconds * FPS);
  for (let i = 0; i < frames; i++) {
    if (failed) throw failed;
    await draw(canvas, frames > 1 ? i / (frames - 1) : 1);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
    enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    if (i % 10 === 0) { onProgress?.(i / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
  muxer.finalize();
  onProgress?.(1);
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), ext: "mp4" };
}

async function encodeRecorder(draw: Draw, seconds: number, onProgress?: (p: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream) throw new Error("이 브라우저는 영상 만들기를 지원하지 않아요. 크롬이나 엣지에서 해 주세요.");
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  await draw(canvas, 0);
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((ok) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      void Promise.resolve(draw(canvas, t)).then(() => {
        onProgress?.(t);
        if (t < 1) requestAnimationFrame(tick);
        else ok();
      });
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  const mime = rec.mimeType || type || "video/webm";
  return { blob: new Blob(parts, { type: mime }), ext: mime.includes("mp4") ? "mp4" : "webm" };
}

/** 그리기 함수(t: 0~1)로 seconds초 영상 만들기 */
export async function makeMotionVideo(draw: Draw, seconds: number, onProgress?: (p: number) => void) {
  const cfg = await pickCodec();
  return cfg ? encodeWebCodecs(cfg, draw, seconds, onProgress) : encodeRecorder(draw, seconds, onProgress);
}
