// 맥 전용: 릴스 편집 문서를 Remotion으로 mp4 만들기
// 사용: REMOTION_RUNTIME=~/.ai-content-office/remotion-runtime node scripts/render-reel.mjs <job.json>
// job.json = { entry, props, out, cacheDir, browser? }
// 진행: 표준 출력에 "progress 0.42" 줄을 찍음
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const runtime = process.env.REMOTION_RUNTIME;
if (!runtime || !fs.existsSync(path.join(runtime, "node_modules", "@remotion", "renderer"))) {
  console.error("Remotion 도구가 맥에 없어요 (~/.ai-content-office/remotion-runtime).");
  process.exit(2);
}
const req = createRequire(path.join(runtime, "package.json"));
const { bundle } = req("@remotion/bundler");
const { renderMedia, selectComposition } = req("@remotion/renderer");

// 화면 코드가 바뀌었을 때만 다시 묶음 (매번 묶으면 30초쯤 걸림)
const dir = path.dirname(job.entry);
const hash = crypto.createHash("sha1");
for (const f of fs.readdirSync(dir).sort()) hash.update(f + fs.readFileSync(path.join(dir, f)));
const key = hash.digest("hex").slice(0, 12);
const bundleDir = path.join(job.cacheDir, `bundle-${key}`);
let serveUrl = bundleDir;
if (!fs.existsSync(path.join(bundleDir, "index.html"))) {
  console.log("progress 0.01");
  serveUrl = await bundle({ entryPoint: job.entry, outDir: bundleDir });
}

// 예전 묶음은 지움 (최근 2개만 남김 — 맥 저장공간 아끼기)
try {
  const olds = fs.readdirSync(job.cacheDir).filter((f) => f.startsWith("bundle-") && f !== `bundle-${key}`).map((f) => ({ f, t: fs.statSync(path.join(job.cacheDir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(1);
  for (const { f } of olds) fs.rmSync(path.join(job.cacheDir, f), { recursive: true, force: true });
} catch {}

process.on("uncaughtException", (e) => { console.error(`ERR: ${e?.message ?? e}`); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error(`ERR: ${e?.message ?? e}`); process.exit(1); });
const opts = { serveUrl, id: job.compositionId || "Reel", inputProps: job.props, timeoutInMilliseconds: 120000, ...(job.browser ? { browserExecutable: job.browser } : {}) };
try {
  const composition = await selectComposition(opts);
  let last = 0;
  await renderMedia({
    ...opts,
    composition,
    codec: "h264",
    crf: 23,
    ...(job.scale ? { scale: job.scale } : {}), // 해상도: 720p 0.67 · 1080p 1 · 2K 1.33 · 4K 2
    outputLocation: job.out,
    concurrency: 2,
    onProgress: ({ progress }) => {
      if (progress - last >= 0.05 || progress === 1) {
        last = progress;
        console.log(`progress ${progress.toFixed(2)}`);
      }
    },
  });
} catch (e) {
  // 진짜 이유를 한 줄로 (앱이 이 줄을 화면에 보여 줌)
  console.error(`ERR: ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
}
console.log("done");
