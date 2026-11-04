import "server-only";
import TurndownService from "turndown";

/**
 * 말투 예시용 HTML(블로그 글 저장 파일·편집기 HTML) → 마크다운 텍스트
 * - 네이버 블로그(스마트에디터)·티스토리 본문 영역이 있으면 그 부분만 사용
 * - 스크립트·스타일·메뉴 등은 버리고, 이미지는 [이미지: 설명] 으로 남김
 */

// 본문 영역을 찾는 표시 (앞에 있을수록 우선)
const MAIN_MARKERS = [
  /<div[^>]+class="[^"]*\bse-main-container\b[^"]*"[^>]*>/i, // 네이버 스마트에디터 ONE
  /<div[^>]+id="postViewArea"[^>]*>/i, // 네이버 구 에디터
  /<div[^>]+class="[^"]*\btt_article_useless_p_margin\b[^"]*"[^>]*>/i, // 티스토리
  /<div[^>]+class="[^"]*\b(?:entry-content|article-view|contents_style|area_view)\b[^"]*"[^>]*>/i, // 티스토리 스킨들
  /<article[^>]*>/i,
  /<main[^>]*>/i,
  /<body[^>]*>/i,
];

/** 여는 태그 위치부터 짝이 맞는 닫는 태그까지 잘라냄 */
function balancedBlock(html: string, start: number, tag: string): string {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

function mainContent(html: string): string {
  for (const marker of MAIN_MARKERS) {
    const m = marker.exec(html);
    if (!m) continue;
    const tag = /^<(\w+)/.exec(m[0])![1].toLowerCase();
    const block = balancedBlock(html, m.index, tag);
    if (block.replace(/<[^>]+>/g, "").trim().length > 50) return block;
  }
  return html;
}

// ───────── 블로그 글 주소에서 본문 가져오기 ─────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const naverBase = () => (process.env.NAVER_BLOG_BASE_URL?.trim() || "https://blog.naver.com").replace(/\/$/, "");

/** 네이버 블로그 글 번호 찾기: 주소(blog.naver.com/아이디/번호, PostView.naver?blogId=..&logNo=..) 또는 저장한 HTML 안의 같은 패턴 */
export function findNaverPost(text: string): { blogId: string; logNo: string } | null {
  const t = text.replace(/&amp;/g, "&");
  const a = /blogId=([A-Za-z0-9_-]+)[^"'\s<>]*?[&?]logNo=(\d{6,})/.exec(t) ?? /logNo=(\d{6,})[^"'\s<>]*?[&?]blogId=([A-Za-z0-9_-]+)/.exec(t);
  if (a) return a[1].match(/^\d+$/) ? { blogId: a[2], logNo: a[1] } : { blogId: a[1], logNo: a[2] };
  const b = /(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/.exec(t);
  return b ? { blogId: b[1], logNo: b[2] } : null;
}

async function getHtml(url: string) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`글을 불러오지 못했습니다 (HTTP ${res.status}). 비공개 글이면 가져올 수 없습니다.`);
  return (await res.text()).slice(0, 3_000_000);
}

/** 네이버 블로그 글 본문 HTML (공개 글만) */
export async function fetchNaverPostHtml(p: { blogId: string; logNo: string }) {
  return getHtml(`${naverBase()}/PostView.naver?blogId=${encodeURIComponent(p.blogId)}&logNo=${p.logNo}&redirect=Dlog&widgetTypeCall=true&directAccess=false`);
}

/**
 * 블로그 글 주소 → { 제목, 마크다운 본문 }
 * 허용: 네이버 블로그, *.tistory.com, 앱에 등록한 블로그 주소의 도메인 (그 외 주소는 내부망 접근 방지를 위해 차단)
 */
export async function importPostFromUrl(raw: string, allowedHosts: string[]) {
  let u: URL;
  try {
    u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    throw new Error("올바른 블로그 글 주소가 아닙니다.");
  }
  const naver = /(^|\.)blog\.naver\.com$/i.test(u.hostname) ? findNaverPost(u.href) : null;
  let html: string;
  if (naver) html = await fetchNaverPostHtml(naver);
  else if (/\.tistory\.com$/i.test(u.hostname) || allowedHosts.includes(u.hostname.toLowerCase())) html = await getHtml(u.href);
  else if (/(^|\.)blog\.naver\.com$/i.test(u.hostname)) throw new Error("네이버 블로그 '글' 주소를 넣어 주세요 (예: https://blog.naver.com/아이디/글번호).");
  else throw new Error("네이버 블로그·티스토리·등록한 내 블로그의 글 주소만 가져올 수 있습니다.");
  const title =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ??
    u.pathname;
  return { title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s*[:|]\s*네이버\s*블로그\s*$/, "").trim(), text: sampleHtmlToText(html) };
}

export function isHtmlFile(name: string) {
  return /\.html?$/i.test(name);
}

export function sampleHtmlToText(html: string): string {
  const cleaned = mainContent(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|template|form|button|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, "");
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
  td.addRule("image", {
    filter: "img",
    replacement: (_c, node) => {
      const alt = ((node as HTMLElement).getAttribute("alt") ?? "").trim();
      return alt ? `\n[이미지: ${alt}]\n` : "\n[이미지]\n";
    },
  });
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|")),
      );
      if (!rows.length) return "";
      const head = rows[0];
      return "\n\n" + [head, head.map(() => "---"), ...rows.slice(1)].map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n\n";
    },
  });
  // 링크는 글자만 남김 (말투 예시에는 주소가 필요 없음)
  td.addRule("link", { filter: "a", replacement: (content) => content });
  return td
    .turndown(cleaned)
    .replace(/​/g, "")
    .replace(/^(\s*)([-*]|\d+\.)\s{2,}/gm, "$1$2 ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
