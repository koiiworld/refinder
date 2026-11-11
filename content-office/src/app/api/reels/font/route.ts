import fs from "node:fs";
import path from "node:path";
import { REEL_FONTS } from "@/remotion/types";

/** 미리보기용 글꼴 (내보내기와 같은 파일) ?f=noto|blackhan|dohyeon|jua */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("f") ?? "noto";
  const def = REEL_FONTS.find((x) => x.id === id) ?? REEL_FONTS[0];
  let f = path.join(process.cwd(), "bin", def.file);
  if (!fs.existsSync(f)) f = path.join(process.cwd(), "bin", REEL_FONTS[0].file);
  if (!fs.existsSync(f)) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(f)), { headers: { "content-type": "font/ttf", "cache-control": "private, max-age=86400" } });
}
