import "server-only";
import { q, newId, j } from "./db";

/**
 * YouTube Data API v3 (공식)
 * - 인기 급상승: videos.list chart=mostPopular regionCode=KR (할당량 1)
 * - 키워드 검색: search.list (할당량 100, 하루 기본 10,000)
 */

export function youtubeConnected() {
  return !!process.env.YOUTUBE_API_KEY?.trim();
}

function base() {
  return (process.env.YOUTUBE_BASE_URL?.trim() || "https://www.googleapis.com").replace(/\/$/, "");
}

export const YT_CATEGORIES: Record<string, string> = {
  "": "전체",
  "26": "노하우·스타일 (요리·뷰티·살림)",
  "28": "과학·기술",
  "22": "인물·블로그 (브이로그)",
  "19": "여행·이벤트",
  "24": "엔터테인먼트",
  "10": "음악",
  "17": "스포츠",
  "20": "게임",
};

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  tags: string[];
  thumbnail: string;
  url: string;
  /** 영상 길이(초). contentDetails 를 요청했을 때만 */
  seconds?: number;
  channelId?: string;
}

async function get(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YouTube API 키(YOUTUBE_API_KEY)가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${base()}/youtube/v3/${path}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const d = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; errors?: { reason?: string }[] } } & Record<string, unknown>;
  if (!res.ok || d.error) {
    const reason = d.error?.errors?.[0]?.reason ?? "";
    const hint = reason === "quotaExceeded" ? " (오늘 YouTube 할당량을 다 썼습니다. 내일 다시 시도하세요)" : reason.includes("keyInvalid") ? " (API 키를 확인하세요)" : "";
    throw new Error(`YouTube API 오류 ${d.error?.code ?? res.status}: ${d.error?.message ?? ""}${hint}`);
  }
  return d;
}

type RawVideo = {
  id: string | { videoId?: string };
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; tags?: string[]; thumbnails?: Record<string, { url?: string } | undefined> };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

function toVideo(v: RawVideo): YtVideo {
  const id = typeof v.id === "string" ? v.id : v.id?.videoId ?? "";
  return {
    id,
    title: v.snippet?.title ?? "",
    channel: v.snippet?.channelTitle ?? "",
    publishedAt: v.snippet?.publishedAt ?? "",
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
    tags: v.snippet?.tags ?? [],
    thumbnail: v.snippet?.thumbnails?.medium?.url ?? "",
    url: `https://www.youtube.com/watch?v=${id}`,
    channelId: v.snippet?.channelId,
    ...(v.contentDetails?.duration ? { seconds: isoSeconds(v.contentDetails.duration) } : {}),
  };
}

/** ISO 8601 길이(PT1H2M3S) → 초 */
function isoSeconds(d: string) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d);
  return m ? Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0) : 0;
}

/** 트렌드 뷰어용: 큰 썸네일·길이까지 (할당량 1) */
export async function trendingVideos(categoryId = "", max = 24) {
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode: "KR", maxResults: String(max), hl: "ko" };
  if (categoryId) params.videoCategoryId = categoryId;
  const d = await get("videos", params);
  return ((d.items as RawVideo[]) ?? []).map((v) => {
    const t = v.snippet?.thumbnails ?? {};
    return { ...toVideo(v), thumbnail: t.maxres?.url ?? t.high?.url ?? t.medium?.url ?? "" };
  });
}

const STOP = new Set(["the", "and", "official", "mv", "video", "shorts", "feat", "ep", "with", "of", "in", "to", "a", "vs", "ver", "full", "live", "teaser", "trailer", "m/v", "합니다", "하는", "있는", "없는", "그리고", "이번", "오늘", "진짜", "너무", "우리", "영상", "공식", "최초", "공개", "티저", "예고"]);

/** 영상 제목·태그에서 자주 나온 단어 (실제 인기 영상 기반, 수치는 등장 영상 수) */
export function frequentTerms(videos: YtVideo[], limit = 30) {
  const count = new Map<string, number>();
  for (const v of videos) {
    const words = new Set(
      [...v.title.split(/[\s\[\]\(\)【】|/·,.!?~"'“”‘’#:;<>{}+=_\-…]+/), ...v.tags]
        .map((w) => w.trim().toLowerCase())
        // 2자 이상, 숫자만·자음/모음만(ㅋㅋ, ㅠㅠ)·이모지/기호만인 단어 제외
        .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w) && !/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w) && /[가-힣a-z]/.test(w)),
    );
    for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
  }
  return Array.from(count.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, videos]) => ({ term, videos }));
}

export async function trending(categoryId = "") {
  const params: Record<string, string> = { part: "snippet,statistics", chart: "mostPopular", regionCode: "KR", maxResults: "50", hl: "ko" };
  if (categoryId) params.videoCategoryId = categoryId;
  const d = await get("videos", params);
  const videos = ((d.items as RawVideo[]) ?? []).map(toVideo);
  const terms = frequentTerms(videos);
  const snap = newId("snap_");
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'youtube_trending',$2,$3)", [snap, j({ categoryId }), j({ terms, count: videos.length })]);
  return { videos, terms, collected_at: new Date().toISOString() };
}

/** 키워드로 최근 인기 영상 검색 (조회수 순) — 할당량 100 사용 */
export async function searchVideos(keyword: string, days = 90) {
  const after = new Date(Date.now() - days * 86400000).toISOString();
  const s = await get("search", { part: "snippet", q: keyword, type: "video", regionCode: "KR", relevanceLanguage: "ko", order: "viewCount", publishedAfter: after, maxResults: "15" });
  const ids = ((s.items as RawVideo[]) ?? []).map((v) => (typeof v.id === "string" ? v.id : v.id?.videoId)).filter(Boolean) as string[];
  if (!ids.length) return { videos: [] as YtVideo[], terms: [], collected_at: new Date().toISOString() };
  const d = await get("videos", { part: "snippet,statistics", id: ids.join(",") });
  const videos = ((d.items as RawVideo[]) ?? []).map(toVideo).sort((a, b) => b.views - a.views);
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'youtube_search',$2,$3)", [newId("snap_"), j({ keyword, days }), j({ count: videos.length, top: videos.slice(0, 5).map((v) => ({ title: v.title, views: v.views })) })]);
  return { videos, terms: frequentTerms(videos, 20), collected_at: new Date().toISOString() };
}
