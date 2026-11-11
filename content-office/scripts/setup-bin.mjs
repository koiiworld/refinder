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
} else try {
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(file, 0o755);
  console.log("[setup-bin] yt-dlp 설치 완료", fs.statSync(file).size);
} catch (e) {
  console.log("[setup-bin] yt-dlp 설치 실패 (영상공장 다운로드만 안 됨):", e.message);
}

// 영상 스튜디오 자막용 한글 글꼴 (리눅스 서버에는 한글 글꼴이 없음)
const font = path.join(dir, "NotoSansKR.ttf");
if (!fs.existsSync(font) || fs.statSync(font).size < 100_000) {
  try {
    const r = await fetch("https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf", { redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(font, Buffer.from(await r.arrayBuffer()));
    console.log("[setup-bin] 한글 글꼴 설치 완료", fs.statSync(font).size);
  } catch (e) {
    console.log("[setup-bin] 한글 글꼴 설치 실패 (영상 자막 없이 진행):", e.message);
  }
}

// 릴스 편집기 글꼴 고르기용 (무료 OFL 글꼴)
for (const [file, src] of [["BlackHanSans-Regular.ttf", "blackhansans"], ["DoHyeon-Regular.ttf", "dohyeon"], ["Jua-Regular.ttf", "jua"]]) {
  const f = path.join(dir, file);
  if (fs.existsSync(f) && fs.statSync(f).size > 100_000) continue;
  try {
    const r = await fetch(`https://github.com/google/fonts/raw/main/ofl/${src}/${file}`, { redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log("[setup-bin] 글꼴 설치", file);
  } catch (e) {
    console.log("[setup-bin] 글꼴 설치 실패 (본고딕으로 대신):", file, e.message);
  }
}
