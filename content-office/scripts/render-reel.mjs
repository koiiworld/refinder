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

const opts = { serveUrl, id: "Reel", inputProps: job.props, ...(job.browser ? { browserExecutable: job.browser } : {}) };
const composition = await selectComposition(opts);
let last = 0;
await renderMedia({
  ...opts,
  composition,
  codec: "h264",
  crf: 23,
  outputLocation: job.out,
  concurrency: 2,
  onProgress: ({ progress }) => {
    if (progress - last >= 0.05 || progress === 1) {
      last = progress;
      console.log(`progress ${progress.toFixed(2)}`);
    }
  },
});
console.log("done");
