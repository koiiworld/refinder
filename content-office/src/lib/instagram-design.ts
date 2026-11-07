import "server-only";

// 공개 게시물만 읽음. 로그인·쿠키 우회 없이, 실패하면 캡처 업로드를 안내.
const FAILURE = "공개 게시물 이미지를 읽지 못했어요. 비공개·로그인 제한이거나 페이지 형식이 바뀌었을 수 있어요. 게시물 캡처를 올려 주세요.";
export function instagramPostUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("인스타 게시물 주소를 확인해 주세요."); }
  if (u.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(u.hostname) || u.username || u.password || u.port || !/^\/(p|reel)\/[\w-]+\/?$/.test(u.pathname)) throw new Error("https://www.instagram.com/p/… 형식의 게시물 주소를 넣어 주세요.");
  return `https://www.instagram.com${u.pathname.replace(/\/$/, "")}/`;
}
const PIN_HOSTS = ["pinterest.com", "www.pinterest.com", "kr.pinterest.com", "pinterest.co.kr", "www.pinterest.co.kr", "pin.it"];
export function referenceUrl(raw: string) {
  let u: URL; try { u = new URL(raw.trim()); } catch { throw new Error("참고 링크를 확인해 주세요."); }
  if (PIN_HOSTS.includes(u.hostname) && u.protocol === "https:" && !u.port && !u.username && !u.password && (u.hostname === "pin.it" ? /^\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname) : /^\/pin\/\d+\/?$/.test(u.pathname))) return u.origin + u.pathname;
  return instagramPostUrl(raw);
}
const testOrigin = () => process.env.NODE_ENV !== "production" || process.env.VIDEO_ALLOW_LOCAL === "1" ? process.env.INSTAGRAM_TEST_ORIGIN : undefined;
function allowed(raw: string, media: boolean) {
  const u = new URL(raw);
  const test = testOrigin();
  if (test && u.origin === new URL(test).origin) return u;
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || !(media ? host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net") || host === "i.pinimg.com" : ["www.instagram.com", "instagram.com", ...PIN_HOSTS].includes(host))) throw new Error("허용되지 않은 이미지 주소입니다.");
  return u;
}
async function bounded(res: Response, max: number) {
  if (Number(res.headers.get("content-length")) > max) throw new Error("이미지가 너무 큽니다.");
  const reader = res.body?.getReader(); if (!reader) throw new Error(FAILURE);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > max) throw new Error("파일이 너무 큽니다."); chunks.push(value); }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function fetchInstagram(raw: string, media = false) {
  let u = allowed(raw, media);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0", accept: media ? "image/*" : "text/html" }, signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { await res.body?.cancel(); u = allowed(new URL(res.headers.get("location")!, u).href, media); continue; }
    if (!res.ok) { await res.body?.cancel(); throw new Error(FAILURE); }
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (media && !["image/jpeg", "image/png", "image/webp"].includes(mime)) { await res.body?.cancel(); throw new Error("지원하지 않는 이미지 형식입니다."); }
    return { data: await bounded(res, media ? 4 * 1024 * 1024 : 4 * 1024 * 1024), mime };
  }
  throw new Error(FAILURE);
}

/** 현재 게시물 JSON의 sidecar/carousel만 순서대로. 프로필·추천 게시물 이미지 제외. */
function postImages(html: string, code: string): string[] {
  const urls: string[] = [];
  const add = (s: unknown) => { if (typeof s !== "string") return; try { allowed(s, true); if (!urls.includes(s)) urls.push(s); } catch {} };
  const imageOf = (v: Record<string, unknown>) => {
    if (v.is_video || v.media_type === 2) return;
    if (typeof v.display_url === "string") add(v.display_url);
    else {
      const versions = v.image_versions2 as { candidates?: { url: string; width: number }[] } | undefined;
      add(versions?.candidates?.slice().sort((a,b) => b.width-a.width)[0]?.url);
    }
  };
  const visit = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 25) return;
    const o = v as Record<string, unknown>;
    if (o.shortcode === code || o.code === code) {
      const sidecar = o.edge_sidecar_to_children as { edges?: { node: Record<string, unknown> }[] } | undefined;
      const children = sidecar?.edges?.map(x=>x.node) ?? o.carousel_media;
      if (Array.isArray(children)) children.forEach(x=>imageOf(x)); else imageOf(o);
      return;
    }
    Object.values(o).forEach(x=>visit(x,depth+1));
  };
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim().replace(/^window\._sharedData\s*=\s*/, "").replace(/;$/, "");
    try { visit(JSON.parse(raw)); } catch { /* 다른 스크립트 */ }
  }
  if (!urls.length) {
    for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (!/\bproperty=["']og:image["']/i.test(tag[0])) continue;
      add(/\bcontent=["']([^"']+)/i.exec(tag[0])?.[1]?.replace(/&amp;/g, "&"));
    }
  }
  return urls.slice(0, 6);
}
export async function importInstagramImages(raw: string) {
  const url = referenceUrl(raw);
  const code = url.split("/").filter(Boolean).at(-1)!;
  const base = testOrigin();
  const target = base ? `${base}${new URL(url).pathname}` : url;
  let images: string[] = []; let sourceText = "";
  for (const suffix of url.includes("instagram.com") ? ["", "embed/captioned/"] : [""]) {
    try {
      const html = (await fetchInstagram(target + suffix)).data.toString("utf8");
      images = postImages(html, code);
      sourceText = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>/\b(?:name|property)=["'](?:og:title|og:description|description)["']/i.test(m[0])).map(m=>/\bcontent=["']([^"']+)/i.exec(m[0])?.[1] ?? "").join("\n").replace(/&amp;/g,"&").replace(/&quot;/g,'"').slice(0,6000);
    } catch { /* 공개 embed도 시도 */ }
    if (images.length) break;
  }
  if (!images.length) throw new Error(FAILURE);
  const downloaded = [];
  for (const img of images) downloaded.push(await fetchInstagram(img, true));
  return { url, downloaded, sourceText };
}
