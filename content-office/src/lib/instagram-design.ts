import "server-only";
import {assertRemoteReadAllowed,stopOnRemote429,RemoteReadLimited} from "./remote-read-limit";

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
async function fetchInstagram(raw: string, media = false, originalUrl?:string) {
  let u = allowed(raw, media);
  for (let i = 0; i < 4; i++) {
    const policyUrl=testOrigin()&&u.origin===new URL(testOrigin()!).origin&&originalUrl?originalUrl:u.href;
    await assertRemoteReadAllowed(policyUrl);
    const res = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0", accept: media ? "image/*" : "text/html" }, signal: AbortSignal.timeout(15000) });
    await stopOnRemote429(policyUrl,res);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { await res.body?.cancel(); u = allowed(new URL(res.headers.get("location")!, u).href, media); continue; }
    if (!res.ok) { await res.body?.cancel(); throw new Error(FAILURE); }
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (media && !["image/jpeg", "image/png", "image/webp"].includes(mime)) { await res.body?.cancel(); throw new Error("지원하지 않는 이미지 형식입니다."); }
    return { data: await bounded(res, media ? 4 * 1024 * 1024 : 4 * 1024 * 1024), mime };
  }
  throw new Error(FAILURE);
}

/** 게시물 본문·캐러셀을 함께 읽음. 대표 이미지 메타데이터는 부분 수집으로 표시. */
export function parseInstagramPost(html: string, code: string) {
  const urls: string[] = [], captions: string[] = [];
  let expected: number | null = null, matched = false;
  const add = (value: unknown) => { if(typeof value!=="string")return;try { allowed(value,true);if(!urls.includes(value))urls.push(value); }catch{} };
  const imageOf = (v: Record<string,unknown>) => {
    if(v.is_video || v.media_type===2)return;
    if(typeof v.display_url === "string")add(v.display_url);
    else { const c=(v.image_versions2 as {candidates?:{url:string;width:number}[]}|undefined)?.candidates;add(c?.slice().sort((a,b)=>b.width-a.width)[0]?.url); }
  };
  const visit=(v:unknown,depth=0):void=>{
    if(depth>30 || !v)return;
    if(typeof v==="string" && /^[{[]/.test(v) && v.length<4000000){try{visit(JSON.parse(v),depth+1);}catch{}return;}
    if(typeof v!=="object")return;
    const o=v as Record<string,unknown>;
    if(o.shortcode===code || o.code===code){
      matched=true;
      const edges=(o.edge_media_to_caption as {edges?:{node?:{text?:string}}[]}|undefined)?.edges;
      for(const e of edges??[])if(e.node?.text)captions.push(e.node.text);
      const caption=typeof o.caption==="string"?o.caption:(o.caption as {text?:string}|undefined)?.text;
      if(caption)captions.push(caption);
      const children=(o.edge_sidecar_to_children as {edges?:{node:Record<string,unknown>}[]}|undefined)?.edges?.map(e=>e.node)??o.carousel_media;
      if(Array.isArray(children)){expected=children.length;children.forEach(imageOf);}else {expected=1;imageOf(o);}
      return;
    }
    Object.values(o).forEach(x=>visit(x,depth+1));
  };
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const raw=m[1].trim().replace(/^window\._sharedData\s*=\s*/,"").replace(/;$/,"");try{visit(JSON.parse(raw));}catch{}
  }
  const meta:Record<string,string>={};
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
    const attrs:Record<string,string>={};for(const a of m[0].matchAll(/([\w:-]+)=["']([^"']*)["']/g))attrs[a[1]]=a[2].replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    if(attrs.property||attrs.name)meta[attrs.property||attrs.name]=attrs.content??"";
  }
  if(!urls.length)add(meta['og:image']);
  // og:description에는 로그인 안내·좋아요 수·잘린 캡션이 섞일 수 있으므로 완전한 본문으로 취급하지 않음.
  const caption=[...new Set(captions)].join('\n').slice(0,16000);
  return {urls:urls.slice(0,6),sourceText:caption || meta['og:description'] || meta.description || '',caption:!!caption,expected,matched};
}
export async function importInstagramImages(raw: string) {
  const url = referenceUrl(raw);
  const code = url.split("/").filter(Boolean).at(-1)!;
  const base = testOrigin();
  const target = base ? `${base}${new URL(url).pathname}` : url;
  let parsed: ReturnType<typeof parseInstagramPost> | null = null;
  for (const suffix of url.includes("instagram.com") ? ["", "embed/captioned/"] : [""]) {
    try {
      const result=parseInstagramPost((await fetchInstagram(target+suffix,false,url)).data.toString("utf8"),code);
      if(!parsed || Number(result.caption)>Number(parsed.caption) || result.urls.length>parsed.urls.length)parsed=result;
      if(result.caption && result.expected!==null && result.urls.length===result.expected)break;
    }catch(e){if(e instanceof RemoteReadLimited)throw e; /* 다른 공개 형식도 시도 */ }
  }
  if(!parsed || (!parsed.urls.length&&!parsed.sourceText))throw new Error(FAILURE);
  const downloaded=[];
  for(const img of parsed.urls)downloaded.push(await fetchInstagram(img,true,url));
  const instagram=url.includes('instagram.com');
  const complete=instagram ? parsed.caption && parsed.sourceText.length>=80 : parsed.caption;
  return {url,downloaded,sourceText:parsed.sourceText,coverage:{caption:parsed.caption,imageCount:downloaded.length,expectedImages:parsed.expected,complete,method:instagram?'인스타 게시물 설명문·확보한 이미지':'공개 게시물',note:complete?`설명문 본문을 읽었어요. 이미지 ${downloaded.length}장${parsed.expected!==null?' / 전체 '+parsed.expected+'장':''}을 확보했으며 나머지는 읽었다고 하지 않아요.`:"본문이나 전체 장을 확인하지 못했어요. 텍스트·마크다운 또는 캡처를 보충해 주세요."}};
}
