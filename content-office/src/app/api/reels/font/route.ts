import fs from "node:fs";
import { ensureFont, fontFile } from "@/lib/reel-fonts";

/** 미리보기용 글꼴 (내보내기와 같은 파일) ?f=글꼴id&w=굵기 — 처음 쓰는 글꼴은 이때 받아 둠 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("f") ?? "noto";
  const w = Number(sp.get("w") ?? 400) || 400;
  const f = (await ensureFont(id, w)) ?? fontFile("noto", 0);
  if (!f || !fs.existsSync(f)) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(f)), { headers: { "content-type": "font/ttf", "cache-control": "private, max-age=604800" } });
}
