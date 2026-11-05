import "server-only";
import { q, q1, newId, j } from "./db";
import { searchRecent, trendingVideos, youtubeConnected, type YtVideo } from "./youtube";

/**
 * 트렌드 뷰어 탭
 * - chart: 유튜브 한국 인기 급상승(카테고리) — 할당량 1
 * - queries: 블로그 주제용 검색(최근 N일 조회수 순) — 검색 1번에 할당량 100이라 6시간마다만 새로 불러옴
 * - include: 인기 급상승 카테고리에서 탭 주제와 맞는 영상만 남기는 단어
 */
type Query = { label: string; q: string; short?: boolean };
export type TrendTabDef = { id: string; label: string; icon: string; blog?: string; note?: string; chart?: string; include?: RegExp; queries?: Query[]; days?: number };

// 인기 급상승 카테고리에서 탭 주제와 맞는 영상만 남김 — 제목만 보고, 한 글자 단어(국·밥 등)는 쓰지 않음
const FOOD = /레시피|요리|먹방|맛집|만들기|반찬|디저트|베이킹|케이크|쿠킹|cooking|recipe|mukbang|김치|김장|찌개|볶음|라면|간식|술안주|에어프라이어|밥상|도시락|국물|파스타|떡볶이|고기 굽|한식|양식|중식|일식|빵 만들|홈카페|편의점 신상|먹어 ?봤|맛있게|맛 ?리뷰/i;
const IT = /아이폰|iphone|갤럭시|galaxy|맥북|macbook|아이패드|ipad|애플|\bapple\b|삼성전자|\bsamsung\b|노트북|스마트폰|태블릿|이어폰|버즈|에어팟|airpods|스마트워치|애플워치|\boled\b|모니터|키보드|그래픽카드|\bgpu\b|\bcpu\b|챗gpt|chatgpt|\bai\b|인공지능|언박싱|unboxing|테크|\btech\b|가전|충전기|갤럭시탭|픽셀폰|샤오미|로봇청소기|윈도우|\bmac\b/i;

export const TREND_TABS: TrendTabDef[] = [
  { id: "hot", label: "급상승", icon: "🔥", chart: "" },
  {
    id: "food", label: "요리", icon: "🍳", blog: "알고키친", note: "요즘 뜨는 음식·먹방·레시피", chart: "26", include: FOOD, days: 7,
    queries: [
      { label: "레시피", q: "레시피 만들기" },
      { label: "먹방", q: "먹방" },
      { label: "트렌드 음식", q: "요즘 유행 음식|요즘 핫한 디저트|품절 대란 간식" },
      { label: "간단 요리", q: "초간단 요리|자취 요리" },
    ],
  },
  {
    id: "kids", label: "육아", icon: "👶", blog: "네이버 육아·일상", note: "육아 정책·어린이집·육아템·발달 놀이·소아과", days: 14,
    queries: [
      { label: "육아 정책", q: "육아 지원금 총정리|부모급여 신청|아동수당|육아휴직 급여|첫만남이용권" },
      { label: "어린이집·유치원", q: "어린이집 적응|어린이집 입소|유치원 입학 준비|유치원 추첨" },
      { label: "육아템·장난감", q: "육아템 추천|아기 장난감 추천" },
      { label: "발달 놀이", q: "개월 발달 놀이|아기 놀이" },
      { label: "소아과", q: "소아과 의사가 알려주는|소아과 전문의 육아 꿀팁|아기 열날때 소아과" },
    ],
  },
  {
    id: "it", label: "IT", icon: "💻", blog: "챈뽕노트", note: "신제품·비교·언박싱·공식 광고·터진 쇼츠", chart: "28", include: IT, days: 7,
    queries: [
      { label: "신제품·비교", q: "아이폰 갤럭시 비교|신제품 리뷰" },
      { label: "언박싱", q: "아이폰 언박싱|갤럭시 언박싱|맥북 언박싱|노트북 언박싱|IT 개봉기" },
      { label: "공식 광고", q: "Samsung 공식 광고|Apple 광고|갤럭시 언팩" },
      { label: "IT 쇼츠", q: "아이폰|갤럭시|맥북|IT 리뷰", short: true },
    ],
  },
  {
    id: "travel", label: "여행", icon: "✈️", note: "국내·해외 여행·여행 꿀팁", days: 14,
    queries: [
      { label: "국내 여행", q: "국내 여행 추천|국내 여행 브이로그" },
      { label: "해외 여행", q: "해외여행 브이로그|해외여행 추천" },
      { label: "여행 꿀팁", q: "여행 꿀팁|여행 준비물" },
    ],
  },
  { id: "vlog", label: "브이로그", icon: "📷", chart: "22" },
  { id: "ent", label: "엔터", icon: "🎬", chart: "24" },
  { id: "news", label: "뉴스", icon: "📰", chart: "25" },
  { id: "music", label: "음악", icon: "🎵", chart: "10" },
];

export type TrendVideo = YtVideo & { group: string; perHour: number };
export type TrendTabData = { videos: TrendVideo[]; groups: string[]; at: number; error?: string; connected: boolean; ranked: "youtube" | "speed"; nextRefreshHours: number };

const CHART_TTL = 30 * 60 * 1000;
/** 탭 구성(검색어·필터)을 바꾸면 올려서 예전 캐시를 무시 */
const CACHE_VERSION = 3;
const SEARCH_TTL = 6 * 60 * 60 * 1000;

const perHour = (v: YtVideo) => Math.round(v.views / Math.max(6, (Date.now() - new Date(v.publishedAt).getTime()) / 3600000));

async function load(tab: TrendTabDef): Promise<TrendVideo[]> {
  const out: TrendVideo[] = [];
  const seen = new Set<string>();
  const push = (v: YtVideo, group: string) => {
    if (!v.id || seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ ...v, group, perHour: perHour(v) });
  };
  if (tab.chart !== undefined) {
    const chart = await trendingVideos(tab.chart, tab.queries ? 50 : 24);
    for (const v of chart) if (!tab.include || tab.include.test(v.title)) push(v, "급상승");
  }
  for (const qd of tab.queries ?? []) {
    try {
      // 쇼츠 검색은 엉뚱한 영상이 섞이기 쉬워 탭 주제 필터를 한 번 더 거침
      for (const v of await searchRecent(qd.q, tab.days ?? 7, { short: qd.short })) if (!qd.short || !tab.include || tab.include.test(v.title)) push(v, qd.label);
    } catch (e) {
      if (!out.length) throw e;
    }
  }
  // 급상승 차트만 있는 탭은 유튜브 순위 그대로.
  // 주제 탭은 묶음(레시피·먹방…)마다 '시간당 조회수'(뜨는 속도) 순으로 정렬한 뒤 번갈아 섞어서, 한 묶음이 위를 독차지하지 않게 함
  if (!tab.queries) return out.slice(0, 48);
  const byGroup = new Map<string, TrendVideo[]>();
  for (const v of out) byGroup.set(v.group, [...(byGroup.get(v.group) ?? []), v]);
  for (const list of byGroup.values()) list.sort((a, b) => b.perHour - a.perHour);
  const order = Array.from(byGroup.keys()).sort((a, b) => (byGroup.get(b)![0]?.perHour ?? 0) - (byGroup.get(a)![0]?.perHour ?? 0));
  const mixed: TrendVideo[] = [];
  for (let i = 0; mixed.length < out.length; i++) for (const g of order) if (byGroup.get(g)![i]) mixed.push(byGroup.get(g)![i]);
  return mixed.slice(0, 48);
}

/** 탭 데이터: 메모리·DB 캐시 → 오래됐으면 새로 불러옴 */
export async function trendTab(tabId: string): Promise<TrendTabData> {
  const tab = TREND_TABS.find((t) => t.id === tabId) ?? TREND_TABS[0];
  const ttl = tab.queries ? SEARCH_TTL : CHART_TTL;
  const base = { ranked: (tab.queries ? "speed" : "youtube") as TrendTabData["ranked"], nextRefreshHours: tab.queries ? 6 : 0.5 };
  const groupsOf = (vs: TrendVideo[]) => Array.from(new Set(vs.map((v) => v.group)));
  if (!youtubeConnected()) return { videos: [], groups: [], at: 0, connected: false, ...base };
  const cached = await q1<{ data: { videos: TrendVideo[] }; at: string }>("SELECT data, collected_at AS at FROM research_snapshots WHERE source='trend_tab' AND query->>'tab'=$1 AND query->>'v'=$2 ORDER BY collected_at DESC LIMIT 1", [tab.id, String(CACHE_VERSION)]);
  const cachedAt = cached ? new Date(cached.at).getTime() : 0;
  if (cached && Date.now() - cachedAt < ttl) return { videos: cached.data.videos, groups: groupsOf(cached.data.videos), at: cachedAt, connected: true, ...base };
  try {
    const videos = await load(tab);
    await q("DELETE FROM research_snapshots WHERE source='trend_tab' AND query->>'tab'=$1", [tab.id]);
    await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'trend_tab',$2,$3)", [newId("snap_"), j({ tab: tab.id, v: String(CACHE_VERSION) }), j({ videos })]);
    return { videos, groups: groupsOf(videos), at: Date.now(), connected: true, ...base };
  } catch (e) {
    if (cached) return { videos: cached.data.videos, groups: groupsOf(cached.data.videos), at: cachedAt, connected: true, error: `${(e as Error).message} (이전에 불러온 목록을 보여 줍니다)`, ...base };
    return { videos: [], groups: [], at: 0, connected: true, error: (e as Error).message, ...base };
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
