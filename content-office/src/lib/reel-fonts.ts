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
// 브라우저 이름을 대면 구글이 한글 글꼴을 90조각(unicode-range)으로 나눠 줌 → 첫 조각만 받으면 한글이 안 들어 있음.
// 일반 프로그램 이름으로 요청하면 쪼개지 않은 TTF 한 파일(전체 글자)을 줌
const UA = "ContentOffice-FontFetcher/1.0";
const pending = new Map<string, Promise<string | null>>();

export function fontFile(id: string, w: number): string | null {
  const def = REEL_FONTS.find((f) => f.id === id);
  if (!def) return null;
  if (def.file) return path.join(process.cwd(), "bin", def.file);
  return path.join(DIR(), `${def.id}-${w}.full.ttf`); // .full: 예전에 잘못 받은 조각 파일과 구분
}

/** 글꼴 파일 경로 (없으면 받아 옴). 실패하면 null */
export async function ensureFont(id: string, w: number): Promise<string | null> {
  const def = REEL_FONTS.find((f) => f.id === id);
  if (!def) return null;
  const weight = def.file ? 0 : (def.weights ?? [400]).includes(w) ? w : (def.weights ?? [400])[0];
  const file = fontFile(def.id, weight)!;
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  // 미리 받아 두는 4종(bin/)이 없으면 구글에서 받아 bin/fonts/ 에 (굵기 범위 글꼴은 400·700 중 하나로)
  if (def.file) {
    const alt = path.join(DIR(), `${def.id}-${w || 400}.full.ttf`);
    if (fs.existsSync(alt) && fs.statSync(alt).size > 1000) return alt;
    return download(def.family, w || 400, alt, `${def.id}-${w || 400}`);
  }
  return download(def.family, weight, file, `${def.id}-${weight}`);
}

/** 구글 폰트에서 쪼개지지 않은 TTF 한 파일 받기 (같은 글꼴을 동시에 여러 번 받지 않음) */
function download(family: string, weight: number, file: string, key: string): Promise<string | null> {
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      try {
        const css = await (await fetch(`${BASE()}?family=${encodeURIComponent(family)}:wght@${weight}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
        // 조각(unicode-range)으로 왔으면 한글이 빠진 파일이라 쓰지 않음
        const urls = [...css.matchAll(/url\((https?:[^)]+\.ttf)\)/g)].map((m) => m[1]);
        if (urls.length !== 1 || /unicode-range/.test(css)) return null;
        const r = await fetch(urls[0], { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 1000) return null;
        fs.mkdirSync(path.dirname(file), { recursive: true });
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
