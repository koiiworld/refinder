import "server-only";
import { q, newId } from "./db";
import { trendingVideos, youtubeConnected, type YtVideo } from "./youtube";

/** 트렌드 뷰어 탭 (YouTube 카테고리 ID). 한국 인기 급상승에서 실제로 조회되는 카테고리만 */
export const TREND_TABS = [
  { id: "", label: "급상승", icon: "🔥" },
  { id: "26", label: "요리·뷰티·살림", icon: "🍳" },
  { id: "28", label: "IT·과학", icon: "💻" },
  { id: "22", label: "브이로그", icon: "📷" },
  { id: "24", label: "엔터", icon: "🎬" },
  { id: "25", label: "뉴스", icon: "📰" },
  { id: "10", label: "음악", icon: "🎵" },
  { id: "20", label: "게임", icon: "🎮" },
  { id: "17", label: "스포츠", icon: "⚽" },
] as const;

const TTL = 30 * 60 * 1000;
const g = globalThis as unknown as { __trendCache?: Map<string, { at: number; videos: YtVideo[] }> };
const cache = (g.__trendCache ??= new Map());

/** 카테고리별 한국 인기 급상승 (30분 캐시 — 할당량 아끼기) */
export async function trendTab(categoryId: string, refresh = false): Promise<{ videos: YtVideo[]; at: number; error?: string; connected: boolean }> {
  if (!youtubeConnected()) return { videos: [], at: 0, connected: false };
  const hit = cache.get(categoryId);
  if (hit && !refresh && Date.now() - hit.at < TTL) return { ...hit, connected: true };
  try {
    const videos = await trendingVideos(categoryId, 24);
    const entry = { at: Date.now(), videos };
    cache.set(categoryId, entry);
    return { ...entry, connected: true };
  } catch (e) {
    if (hit) return { ...hit, connected: true, error: `${(e as Error).message} (이전에 불러온 목록을 보여 줍니다)` };
    return { videos: [], at: 0, connected: true, error: (e as Error).message };
  }
}

export type TrendScrap = { id: string; item_id: string; title: string; channel: string; thumbnail: string; url: string; views: number | null; category: string; memo: string; created_at: string };

export async function listScraps() {
  return q<TrendScrap>("SELECT * FROM trend_scraps ORDER BY created_at DESC LIMIT 200");
}

export async function addScrap(v: { item_id: string; title: string; channel?: string; thumbnail?: string; url: string; views?: number | null; category?: string }) {
  if (!v.item_id || !v.title || !/^https:\/\/www\.youtube\.com\/watch\?v=/.test(v.url)) throw new Error("스크랩할 영상 정보가 올바르지 않습니다.");
  await q(
    `INSERT INTO trend_scraps (id, item_id, title, channel, thumbnail, url, views, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (source, item_id) DO UPDATE SET views = EXCLUDED.views`,
    [newId("scr_"), v.item_id, v.title.slice(0, 300), (v.channel ?? "").slice(0, 120), /^https:\/\//.test(v.thumbnail ?? "") ? v.thumbnail : "", v.url, v.views ?? null, (v.category ?? "").slice(0, 40)],
  );
}

export async function removeScrap(itemId: string) {
  await q("DELETE FROM trend_scraps WHERE item_id=$1", [itemId]);
}
