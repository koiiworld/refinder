import "server-only";
import { q, q1, j } from "./db";
import { getBlog } from "./repo";
import { naverPostStats } from "./blog-posts";
import { extractJson, runStep } from "./ai/run";

/**
 * 블로그별 인기 글 TOP 10
 * - 조회수: 네이버·티스토리는 글별 조회수를 공개하지 않아, 크리에이터 어드바이저(또는 티스토리 통계) 캡처를 AI가 읽어 저장
 * - 반응 순위: 공개된 공감·댓글 수 (네이버)
 */

export type ViewsTop = { at: string; period: string; items: { rank: number; title: string; views: number }[]; ai?: string };
export type ReactionTop = { title: string; url: string; likes: number; comments: number; views: number | null; date: string | null }[];

export async function topPosts(blogId: string): Promise<{ views: ViewsTop | null; reaction: ReactionTop; platform: string }> {
  const blog = await getBlog(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const saved = await q1<{ value: ViewsTop }>("SELECT value FROM settings WHERE key=$1", [`top_views:${blogId}`]);
  const stats = blog.url ? await naverPostStats(blog.url) : {};
  const reaction = Object.values(stats)
    .filter((s) => s.title && s.url)
    .map((s) => ({ title: s.title!, url: s.url!, likes: s.likes, comments: s.comments, views: s.views, date: s.date ?? null }))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || b.likes + b.comments * 3 - (a.likes + a.comments * 3))
    .slice(0, 10);
  return { views: saved?.value ?? null, reaction, platform: blog.platform };
}

/** 통계 화면 캡처 → AI가 글 제목·조회수 순위를 읽어 저장 */
export async function saveViewsFromCapture(blogId: string, images: string[]) {
  const blog = await getBlog(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const system = `당신은 블로그 통계 화면을 읽어 옮겨 적는 도우미입니다. 화면에 실제로 보이는 글 제목과 숫자만 옮기고, 보이지 않는 값은 절대 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `첨부한 캡처는 ${blog.platform === "tistory" ? "티스토리 통계(인기글)" : "네이버 크리에이터 어드바이저(또는 블로그 통계)의 조회수 순위·인기 콘텐츠"} 화면입니다.
글 제목과 조회수를 조회수가 많은 순서대로 최대 10개 옮겨 적으세요.
- title: 화면에 보이는 글 제목 그대로 (잘려 있으면 보이는 만큼)
- views: 조회수 숫자 (쉼표 없이)
- period: 화면에 보이는 기간 (예: "최근 7일", "2026.11.01~11.06"), 모르면 빈 문자열
- 조회수 목록이 안 보이면 items 를 빈 배열로
형식: {"period": "", "items": [{"title": "", "views": 0}]}`;
  const res = await runStep({ step: "keywords", purpose: "top-views", blog: null, system, prompt, images, json: true, maxTokens: 1500 });
  const raw = extractJson<{ period?: string; items?: { title?: string; views?: number | string }[] }>(res.text);
  const items = (raw.items ?? [])
    .map((i) => ({ title: String(i.title ?? "").trim(), views: Number(String(i.views ?? "").replace(/[^\d]/g, "")) || 0 }))
    .filter((i) => i.title)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((i, k) => ({ rank: k + 1, ...i }));
  if (!items.length) throw new Error("캡처에서 글 제목·조회수를 찾지 못했어요. 조회수 순위가 보이는 화면으로 다시 올려 주세요.");
  const value: ViewsTop = { at: new Date().toISOString(), period: String(raw.period ?? ""), items, ai: `${res.provider}/${res.model}` };
  await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [`top_views:${blogId}`, j(value)]);
  return value;
}
