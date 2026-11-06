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
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) return fail("영상 파일(mp4·mov)만 올릴 수 있어요.");
    if (file.size > 300 * 1024 * 1024) return fail("300MB 이하 영상만 올릴 수 있어요.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-"));
    try {
      const ext = (/\.(\w+)$/.exec(file.name)?.[1] ?? "mp4").toLowerCase();
      fs.writeFileSync(path.join(dir, `in.${ext}`), Buffer.from(await file.arrayBuffer()));
      const name = await fitSize(dir, `in.${ext}`);
      const id = await addVideoFile({ title: file.name.replace(/\.\w+$/, "").slice(0, 120) || "내 영상", file: path.join(dir, name), kind: "upload" });
      return ok({ id });
    } catch (e) {
      return fail((e as Error).message);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
