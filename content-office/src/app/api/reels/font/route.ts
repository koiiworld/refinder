import fs from "node:fs";
import path from "node:path";

/** 미리보기용 글꼴 (내보내기와 같은 Noto Sans KR) */
export async function GET() {
  const f = path.join(process.cwd(), "bin", "NotoSansKR.ttf");
  if (!fs.existsSync(f)) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(f)), { headers: { "content-type": "font/ttf", "cache-control": "private, max-age=86400" } });
}
