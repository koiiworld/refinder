import "server-only";
import { q, q1, newId, j } from "./db";

/**
 * 📰 블로그 핫이슈: 네이버 블로그 홈 '주제별 보기'에 지금 올라오는 글 중 반응(공감·댓글) 많은 글
 * - 주제별 최근 글 50개를 읽어 공감 + 댓글×3 순으로 정렬, 제목에서 자주 나온 단어도 뽑음
 * - 1시간 캐시
 */

export const HOT_TABS = [
  { id: "all", seq: 0, label: "전체", icon: "🔥" },
  { id: "food", seq: 20, label: "요리·레시피", icon: "🍳" },
  { id: "restaurant", seq: 29, label: "맛집", icon: "🍜" },
  { id: "kids", seq: 15, label: "육아·결혼", icon: "👶" },
  { id: "it", seq: 30, label: "IT·컴퓨터", icon: "💻" },
  { id: "review", seq: 21, label: "상품리뷰", icon: "🛍️" },
  { id: "travel", seq: 27, label: "국내여행", icon: "🧳" },
  { id: "world", seq: 28, label: "세계여행", icon: "✈️" },
  { id: "health", seq: 32, label: "건강·의학", icon: "💊" },
  { id: "money", seq: 33, label: "비즈니스·경제", icon: "💰" },
  { id: "life", seq: 14, label: "일상·생각", icon: "☕" },
] as const;

export type HotPost = { id: string; title: string; brief: string; nickname: string; url: string; thumb: string | null; likes: number; comments: number; at: number; score: number };
export type HotTabData = { posts: HotPost[]; words: { word: string; count: number }[]; at: number; error?: string };

const TTL = 60 * 60 * 1000;
const PAGES = 5;
const STOP = new Set("후기 추천 방법 정리 리뷰 내돈내산 솔직 솔직후기 오늘 이번 진짜 정말 그리고 하는 있는 없는 위한 함께 나의 우리 제가 이렇게 아이 아이랑 가볼만한 가볼만한곳 사용 사용법 사용후기 꿀팁 맛있는 너무 최고 대박 같이 모음 총정리 정보 가격 위치 주차 메뉴 메뉴판 내돈 협찬 포스팅 블로그 체험 일상 기록 2025 2026 2027".split(" "));

function base() {
  return (process.env.NAVER_SECTION_BASE_URL?.trim() || "https://section.blog.naver.com").replace(/\/$/, "");
}

async function page(seq: number, n: number) {
  const res = await fetch(`${base()}/ajax/DirectoryPostList.naver?directorySeq=${seq}&pageNo=${n}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)", referer: "https://section.blog.naver.com/" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`네이버 블로그 홈 응답 오류 (HTTP ${res.status})`);
  const text = (await res.text()).replace(/^\)\]\}',?\s*/, "");
  const data = JSON.parse(text) as { result?: { postList?: Record<string, unknown>[] } };
  return data.result?.postList ?? [];
}

const clean = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").trim();

/** 제목에서 자주 나온 단어 (2글자 이상, 흔한 말 제외) */
export function topWords(titles: string[], limit = 15) {
  const count = new Map<string, number>();
  for (const t of titles) {
    const seen = new Set<string>();
    for (const raw of t.split(/[\s,.!?·|｜/()[\]{}"'“”‘’~…:;#&+\-_<>]+/)) {
      const w = raw.replace(/[^\p{L}\p{N}]/gu, "").replace(/(은|는|이|가|을|를|의|에|도|로|으로|와|과|랑|에서)$/u, "");
      if (w.length < 2 || /^\d+$/.test(w) || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      count.set(w, (count.get(w) ?? 0) + 1);
    }
  }
  return [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, c]) => ({ word, count: c }));
}

export async function hotTab(tabId: string, force = false): Promise<HotTabData> {
  const tab = HOT_TABS.find((t) => t.id === tabId) ?? HOT_TABS[0];
  const cached = await q1<{ data: HotTabData; at: string }>("SELECT data, collected_at AS at FROM research_snapshots WHERE source='blog_hot' AND query->>'tab'=$1 ORDER BY collected_at DESC LIMIT 1", [tab.id]);
  if (!force && cached && Date.now() - new Date(cached.at).getTime() < TTL) return { ...cached.data, at: new Date(cached.at).getTime() };
  try {
    const all: HotPost[] = [];
    for (let n = 1; n <= PAGES; n++) {
      const list = await page(tab.seq, n);
      for (const p of list) {
        const url = String(p.postUrl ?? "");
        if (!/^https?:\/\//.test(url) || all.some((x) => x.url === url)) continue;
        const thumbs = Array.isArray(p.thumbnails) ? (p.thumbnails as { url?: string }[]) : [];
        const likes = Number(p.sympathyCnt ?? 0) || 0;
        const comments = Number(p.commentCnt ?? 0) || 0;
        all.push({ id: `${p.domainIdOrBlogId}/${p.logNo}`, title: clean(p.title), brief: clean(p.briefContents).slice(0, 120), nickname: clean(p.nickname), url, thumb: thumbs[0]?.url ?? null, likes, comments, at: Number(p.addDate ?? 0), score: likes + comments * 3 });
      }
      if (list.length < 10) break;
    }
    const posts = all.sort((a, b) => b.score - a.score);
    const data: HotTabData = { posts, words: topWords(posts.map((p) => p.title)), at: Date.now() };
    await q("DELETE FROM research_snapshots WHERE source='blog_hot' AND query->>'tab'=$1", [tab.id]);
    await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'blog_hot',$2,$3)", [newId("snap_"), j({ tab: tab.id }), j(data)]);
    return data;
  } catch (e) {
    if (cached) return { ...cached.data, at: new Date(cached.at).getTime(), error: `새로 불러오지 못해 이전 결과를 보여 줘요: ${(e as Error).message}` };
    return { posts: [], words: [], at: Date.now(), error: (e as Error).message };
  }
}
