import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * 제조사 공식 페이지에서 제품 이미지 후보 찾기
 * - og:image, <img src/srcset>, <source srcset> 에서 큰 사진 위주로 최대 24개
 * - 내부망 주소는 차단 (주소를 직접 확인하고, 리다이렉트도 한 번씩 다시 확인)
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("http(s) 주소만 쓸 수 있습니다.");
  if (process.env.OFFICIAL_IMAGES_ALLOW_LOCAL === "1") return; // 테스트용
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) throw new Error("이 주소는 가져올 수 없습니다.");
}

async function safeFetch(raw: string): Promise<{ url: URL; html: string }> {
  let u = new URL(raw);
  for (let i = 0; i < 4; i++) {
    await assertPublic(u);
    const res = await fetch(u, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "ko-KR,ko;q=0.9" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = new URL(res.headers.get("location")!, u);
      continue;
    }
    if (!res.ok) throw new Error(`공식 페이지가 열리지 않습니다 (HTTP ${res.status}). 사이트가 자동 접속을 막으면 이미지 주소를 직접 넣어 주세요.`);
    return { url: u, html: (await res.text()).slice(0, 4_000_000) };
  }
  throw new Error("페이지 이동이 너무 많습니다.");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/gi, "/");
const SKIP = /\.svg(\?|$)|sprite|icon|logo|favicon|badge|placeholder|blank|spacer|1x1|pixel|tracking|avatar|flag|arrow|chevron|loading/i;

/** srcset 에서 가장 큰 후보 */
function bestFromSrcset(srcset: string) {
  let best = "";
  let bestW = -1;
  for (const part of srcset.split(",")) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = d ? parseFloat(d) * (d.endsWith("x") ? 1000 : 1) : 0;
    if (w >= bestW) {
      best = u;
      bestW = w;
    }
  }
  return best;
}

export function extractImages(html: string, base: URL, limit = 24): string[] {
  const found: string[] = [];
  const add = (raw?: string) => {
    if (!raw) return;
    const v = decode(raw.trim());
    if (!v || v.startsWith("data:")) return;
    try {
      const abs = new URL(v, base).href;
      if (/^https?:/.test(abs) && !SKIP.test(abs) && /\.(jpe?g|png|webp|avif)(\?|$)|\/image|images?\./i.test(abs)) found.push(abs);
    } catch {
      /* 잘못된 주소는 건너뜀 */
    }
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)) add(/content=["']([^"']+)["']/i.exec(m[0])?.[1]);
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = /\b(?:data-)?srcset=["']([^"']+)["']/i.exec(tag)?.[1];
    if (srcset) add(bestFromSrcset(srcset));
    add(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i.exec(tag)?.[1]);
  }
  // 같은 사진의 크기만 다른 주소는 하나로 (쿼리 제거 기준)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of found) {
    const key = u.split("?")[0].replace(/_(small|medium|large|xlarge|\d+x\d*|\d+w)(?=\.)/i, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

export async function findOfficialImages(pageUrl: string) {
  let u: URL;
  try {
    u = new URL(pageUrl.trim());
  } catch {
    throw new Error("올바른 공식 페이지 주소가 아닙니다.");
  }
  const { url, html } = await safeFetch(u.href);
  const images = extractImages(html, url);
  if (!images.length) throw new Error("이 페이지에서 제품 이미지를 찾지 못했습니다. 다른 공식 페이지 주소나 이미지 주소를 직접 넣어 주세요.");
  return images;
}

/** 직접 넣은 이미지 주소 확인 (공개 주소인지) */
export async function checkImageUrl(raw: string) {
  const u = new URL(raw.trim());
  await assertPublic(u);
  return u.href;
}
