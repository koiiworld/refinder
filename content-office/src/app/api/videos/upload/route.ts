import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail, handle, ok } from "@/lib/api";
import { addVideoFile, fitSize } from "@/lib/videos";

/** 내 영상 파일 올리기 (폼 'file') → 영상공장에 저장 · 50MB 넘으면 줄여서 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return fail("영상 파일을 골라 주세요.");
    const audio = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name);
    if (!audio && !/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) return fail("영상(mp4·mov)이나 음악(mp3·m4a·wav) 파일만 올릴 수 있어요.");
    if (file.size > 300 * 1024 * 1024) return fail("300MB 이하 영상만 올릴 수 있어요.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-"));
    try {
      const ext = (/\.(\w+)$/.exec(file.name)?.[1] ?? "mp4").toLowerCase();
      fs.writeFileSync(path.join(dir, `in.${ext}`), Buffer.from(await file.arrayBuffer()));
      let src = `in.${ext}`;
      if (audio) {
        // 음악·음성은 검은 화면을 붙인 mp4로 (영상공장·편집기에서 같은 방식으로 다룸)
        const { ffmpegPath } = await import("@/lib/videos");
        const { spawnSync } = await import("node:child_process");
        const r = spawnSync(ffmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x320:r=5", "-i", src, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", "audio.mp4"], { cwd: dir, timeout: 5 * 60 * 1000 });
        if (r.status !== 0) return fail("음악 파일을 읽지 못했어요.");
        src = "audio.mp4";
      }
      const name = await fitSize(dir, src);
      const id = await addVideoFile({ title: `${audio ? "🎵 " : ""}${file.name.replace(/\.\w+$/, "").slice(0, 120) || "내 영상"}`, file: path.join(dir, name), kind: "upload" });
      return ok({ id });
    } catch (e) {
      return fail((e as Error).message);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
