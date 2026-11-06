// 영상공장용 yt-dlp 실행 파일을 bin/ 에 받아 둠 (맥·리눅스 각각). 이미 있으면 건너뜀. 실패해도 빌드는 계속.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bin");
const file = path.join(dir, "yt-dlp");
const name = process.platform === "darwin" ? "yt-dlp_macos" : process.platform === "linux" ? (process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux") : null;
if (!name) {
  console.log("[setup-bin] 이 운영체제는 자동 설치를 지원하지 않습니다:", process.platform);
  process.exit(0);
}
if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000 && !process.argv.includes("--force")) {
  console.log("[setup-bin] yt-dlp 이미 있음");
  process.exit(0);
}
try {
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(file, 0o755);
  console.log("[setup-bin] yt-dlp 설치 완료", fs.statSync(file).size);
} catch (e) {
  console.log("[setup-bin] yt-dlp 설치 실패 (영상공장 다운로드만 안 됨):", e.message);
}
