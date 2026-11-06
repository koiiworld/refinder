import "server-only";
import type { Blog } from "./types";

/**
 * 내 블로그의 실제 최근 글 목록 (블로그 RSS)
 * - 글 끝 '함께 보면 좋은 글'에 실제로 있는 글만 넣기 위해 사용
 * - 네이버: rss.blog.naver.com/아이디.xml · 티스토리 등: 블로그주소/rss
 * - 6시간 캐시, 실패하면 빈 목록 (글쓰기는 계속 진행)
 */

export type BlogPostLink = { title: string; url: string; date?: string | null };

const TTL = 6 * 60 * 60 * 1000;
const g = globalThis as unknown as { __blogPosts?: Map<string, { at: number; posts: BlogPostLink[] }> };
const cache = (g.__blogPosts ??= new Map());

export function rssUrlOf(blogUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(blogUrl.trim());
  } catch {
    return null;
  }
  if (/(^|\.)blog\.naver\.com$/i.test(u.hostname)) {
    const id = u.pathname.split("/").filter(Boolean)[0] ?? u.searchParams.get("blogId");
    if (!id) return null;
    const base = (process.env.NAVER_RSS_BASE_URL?.trim() || "https://rss.blog.naver.com").replace(/\/$/, "");
    return `${base}/${encodeURIComponent(id)}.xml`;
  }
  return `${u.origin}/rss`;
}

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", middot: "·", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", times: "×", rarr: "→" };
const decodeOnce = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (NAMED[e.toLowerCase()] ?? m),
  );
// 티스토리 RSS는 '&amp;middot;' 처럼 두 번 인코딩된 경우가 있어 두 번 풀어 줌
const text = (s: string) => decodeOnce(decodeOnce(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))).replace(/\s+/g, " ").trim();
/** 글이 아닌 안내 페이지 */
const NOT_POST = /^(블로그\s*소개|소개|about|공지)$|개인정보\s*처리\s*방침|이용\s*약관|privacy|terms of/i;

export function parseRss(xml: string): BlogPostLink[] {
  const out: BlogPostLink[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const item = m[0];
    const title = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1] ?? "");
    const link = text(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(item)?.[1] ?? "").split("?")[0];
    const pub = text(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1] ?? "");
    const t = pub ? new Date(pub) : null;
    if (title && !NOT_POST.test(title) && /^https?:\/\//.test(link)) out.push({ title, url: link, date: t && !isNaN(t.getTime()) ? t.toISOString() : null });
  }
  return out;
}

export async function recentPosts(blog: Pick<Blog, "url">, limit = 30): Promise<BlogPostLink[]> {
  const rss = blog.url ? rssUrlOf(blog.url) : null;
  if (!rss) return [];
  const hit = cache.get(rss);
  if (hit && Date.now() - hit.at < TTL) return hit.posts.slice(0, limit);
  try {
    const res = await fetch(rss, { headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const posts = parseRss(await res.text()).slice(0, 50);
    cache.set(rss, { at: Date.now(), posts });
    return posts.slice(0, limit);
  } catch {
    return [];
  }
}

/** 이 블로그에 이미 쓴(또는 쓰는 중인) 글 제목: 블로그 RSS + 앱에서 만든 글. 주제 중복 피하기용 */
export async function writtenTitles(blog: Pick<Blog, "id" | "url">, excludeProjectId?: string): Promise<string[]> {
  const { q } = await import("./db");
  const [rss, mine] = await Promise.all([
    recentPosts(blog, 50),
    q<{ title: string }>(
      "SELECT title FROM projects WHERE blog_id=$1 AND deleted_at IS NULL AND id <> $2 AND stage IN ('writing','reviewing','ready','published') ORDER BY updated_at DESC LIMIT 50",
      [blog.id, excludeProjectId ?? ""],
    ),
  ]);
  return Array.from(new Set([...rss.map((p) => p.title), ...mine.map((m) => m.title)].map((t) => t.trim()).filter(Boolean))).slice(0, 80);
}
