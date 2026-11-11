import "server-only";
import fs from "node:fs";
import path from "node:path";
import { REEL_FONTS } from "@/remotion/types";

/**
 * 릴스 글꼴 파일 (구글 폰트 무료 한글 글꼴)
 * - 미리 받아 둔 4개는 bin/, 나머지는 처음 쓸 때 구글 폰트에서 TTF 를 받아 bin/fonts/ 에 저장
 * - 오래된 브라우저 주소로 요청하면 구글이 woff2 대신 ttf 주소를 줌 (Remotion·브라우저 둘 다 읽을 수 있음)
 */
const DIR = () => process.env.REEL_FONT_DIR || path.join(process.cwd(), "bin", "fonts");
const BASE = () => process.env.GOOGLE_FONTS_CSS_URL || "https://fonts.googleapis.com/css2";
const OLD_UA = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30";
const pending = new Map<string, Promise<string | null>>();

export function fontFile(id: string, w: number): string | null {
  const def = REEL_FONTS.find((f) => f.id === id);
  if (!def) return null;
  if (def.file) return path.join(process.cwd(), "bin", def.file);
  return path.join(DIR(), `${def.id}-${w}.ttf`);
}

/** 글꼴 파일 경로 (없으면 받아 옴). 실패하면 null */
export async function ensureFont(id: string, w: number): Promise<string | null> {
  const def = REEL_FONTS.find((f) => f.id === id);
  if (!def) return null;
  const weight = def.file ? 0 : (def.weights ?? [400]).includes(w) ? w : (def.weights ?? [400])[0];
  const file = fontFile(def.id, weight)!;
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  if (def.file) return null; // 미리 받는 글꼴은 setup-bin 담당
  const key = `${def.id}-${weight}`;
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      try {
        const css = await (await fetch(`${BASE()}?family=${encodeURIComponent(def.family)}:wght@${weight}`, { headers: { "user-agent": OLD_UA }, signal: AbortSignal.timeout(20_000) })).text();
        const url = /url\((https?:[^)]+\.ttf)\)/.exec(css)?.[1];
        if (!url) return null;
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 1000) return null;
        fs.mkdirSync(DIR(), { recursive: true });
        fs.writeFileSync(file + ".part", buf);
        fs.renameSync(file + ".part", file);
        return file;
      } catch {
        return null;
      } finally {
        pending.delete(key);
      }
    })());
  }
  return pending.get(key)!;
}
