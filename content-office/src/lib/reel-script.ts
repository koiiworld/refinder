import "server-only";
import { q } from "./db";
import { extractJson, runStep } from "./ai/run";

/**
 * 릴스 AI 대본
 * - 트렌드: 앱이 이미 모아 둔 자료만 씀 (유튜브 트렌드 탭·블로그 인기글 단어·릴스 분석 결과) — 새로 불러오지 않아 유튜브 할당량 안 씀
 * - 모델: 설정 '단계별 AI' → 🎬 릴스 AI 대본 (기본 Claude Opus 5.5)
 */
export const SCRIPT_FIELDS = [
  { id: "all", label: "전체 트렌드", trend: ["hot", "food", "kids", "it", "travel", "vlog", "ent"], hot: ["all"], study: "" },
  { id: "food", label: "🍳 요리", trend: ["food"], hot: ["food", "restaurant"], study: "요리·살림" },
  { id: "kids", label: "👶 육아", trend: ["kids"], hot: ["kids"], study: "육아" },
  { id: "it", label: "💻 IT·AI", trend: ["it"], hot: ["it"], study: "AI·테크" },
  { id: "travel", label: "✈️ 여행", trend: ["travel"], hot: ["travel", "world"], study: "여행" },
  { id: "life", label: "☕ 생활·정보", trend: ["hot", "vlog"], hot: ["life", "review", "health", "money"], study: "생활정보" },
] as const;

export type ReelScriptInput = { topic?: string; field?: string; seconds?: number; tone?: string; source?: { title?: string; text?: string; url?: string } };
export type ReelScript = {
  title: string;
  hook: string;
  lines: string[];
  caption: string;
  hashtags: string[];
  why: string;
  trends: string[];
  model: string;
  substitutedFor?: string;
};

type Snap = { query: { tab?: string }; data: { videos?: { title: string; views?: number | null; perHour?: number; group?: string }[]; words?: { word: string; count: number }[]; posts?: { title: string; likes?: number }[] }; at: string };

/** 프롬프트에 넣을 요즘 트렌드 (저장된 것만, 최근 3일) */
export async function trendContext(fieldId = "all") {
  const f = SCRIPT_FIELDS.find((x) => x.id === fieldId) ?? SCRIPT_FIELDS[0];
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const yt = await q<Snap>("SELECT query, data, collected_at AS at FROM research_snapshots WHERE source='trend_tab' AND collected_at > $1 AND query->>'tab' = ANY($2) ORDER BY collected_at DESC", [since, [...f.trend]]);
  const hot = await q<Snap>("SELECT query, data, collected_at AS at FROM research_snapshots WHERE source='blog_hot3' AND collected_at > $1 AND query->>'tab' = ANY($2) ORDER BY collected_at DESC", [since, [...f.hot]]);
  const studies = await q<{ title: string; category: string; analysis: { hook?: { text?: string; score?: number }; whyWorks?: string[]; format?: string } }>(
    "SELECT title, category, analysis FROM study_reels WHERE status='done' AND ($1 = '' OR category = $1) ORDER BY updated_at DESC LIMIT 30",
    [f.study],
  ).catch(() => []);

  const seenTab = new Set<string>();
  const videos: string[] = [];
  for (const s of yt) {
    const tab = s.query?.tab ?? "";
    if (seenTab.has(tab)) continue;
    seenTab.add(tab);
    for (const v of (s.data.videos ?? []).slice(0, f.trend.length > 2 ? 5 : 12)) videos.push(`${v.title}${v.views ? ` (조회 ${Math.round(v.views / 1000)}천)` : ""}`);
  }
  const seenHot = new Set<string>();
  const words: string[] = [];
  const posts: string[] = [];
  for (const s of hot) {
    const tab = s.query?.tab ?? "";
    if (seenHot.has(tab)) continue;
    seenHot.add(tab);
    words.push(...(s.data.words ?? []).slice(0, 10).map((w) => w.word));
    posts.push(...(s.data.posts ?? []).slice(0, 5).map((p) => p.title));
  }
  const hooks = studies
    .filter((s) => s.analysis?.hook?.text)
    .sort((a, b) => (b.analysis.hook?.score ?? 0) - (a.analysis.hook?.score ?? 0))
    .slice(0, 8)
    .map((s) => `"${s.analysis.hook!.text}"${s.analysis.hook?.score ? ` (${s.analysis.hook.score}점)` : ""}${s.analysis.whyWorks?.[0] ? ` — ${s.analysis.whyWorks[0]}` : ""}`);

  const parts: string[] = [];
  if (videos.length) parts.push(`[요즘 뜨는 유튜브 영상 제목]\n${[...new Set(videos)].slice(0, 25).map((x) => `- ${x}`).join("\n")}`);
  if (words.length) parts.push(`[네이버 블로그 인기글에 많이 나온 단어]\n${[...new Set(words)].slice(0, 25).join(", ")}`);
  if (posts.length) parts.push(`[네이버 블로그 인기글 제목]\n${[...new Set(posts)].slice(0, 12).map((x) => `- ${x}`).join("\n")}`);
  if (hooks.length) parts.push(`[내가 분석한 잘 된 릴스의 첫 문장(훅)]\n${hooks.map((x) => `- ${x}`).join("\n")}`);
  return { text: parts.join("\n\n"), counts: { videos: videos.length, words: words.length, posts: posts.length, hooks: hooks.length } };
}

const SYSTEM = `너는 한국 인스타그램 릴스·유튜브 쇼츠 대본 작가야. 요즘 트렌드를 읽고, 끝까지 보게 만들고 저장·공유되는 대본을 쓴다.
규칙:
- 첫 줄은 1~2초 안에 멈추게 하는 훅. 숫자·반전·실수 지적·궁금증 중 하나를 쓴다. "안녕하세요" 같은 인사 금지.
- 한 줄 = 화면 자막 하나. 한 줄은 18자 안팎(최대 26자)으로 짧게. 말하듯 쉬운 말.
- 중간에 한 번 "근데" 같은 전환으로 이탈을 막고, 마지막 줄은 저장·댓글·팔로우 중 하나를 자연스럽게 부탁.
- 트렌드 자료는 참고만 하고 베끼지 않는다. 자료에 없는 사실(가격·통계·날짜·효능)은 지어내지 않는다. 모르면 일반적인 표현으로 쓴다.
- 과장·낚시(무조건, 100%, 보장)는 쓰지 않는다.
반드시 JSON 하나만 답한다.`;

export async function writeReelScript(input: ReelScriptInput): Promise<ReelScript> {
  const seconds = [15, 30, 45, 60].includes(Number(input.seconds)) ? Number(input.seconds) : 30;
  const topic = String(input.topic ?? "").trim().slice(0, 300);
  const tone = String(input.tone ?? "").trim().slice(0, 100);
  const ctx = await trendContext(input.field);
  const srcText = String(input.source?.text ?? "").trim().slice(0, 7000);
  const srcTitle = String(input.source?.title ?? "").trim().slice(0, 200);
  const srcBlock = srcText ? `[원본 블로그 글 — 이 글의 내용으로만 대본을 써. 글에 없는 사실·숫자·가격은 넣지 마. 트렌드는 훅·말투·구성에만 참고]\n제목: ${srcTitle}\n${srcText}\n\n` : "";
  const lineCount = Math.round(seconds / 2.5);
  const prompt = `[만들 릴스]
주제: ${topic || srcTitle || "(없음 — 아래 트렌드에서 지금 가장 반응이 좋을 주제를 골라 줘)"}
길이: 약 ${seconds}초 → 자막 ${lineCount - 2}~${lineCount + 2}줄
${tone ? `말투·분위기: ${tone}\n` : ""}
${srcBlock}${ctx.text || "[트렌드 자료 없음] 저장된 트렌드가 아직 없어요. 한국 인스타그램에서 요즘 잘 되는 형식(전후 비교·실수 지적·꿀팁 N가지)을 바탕으로 써 줘."}

[답 형식]
{"title":"프로젝트 제목(20자 이내)","hook":"첫 줄과 같은 훅","lines":["자막1","자막2",...],"caption":"게시물 캡션 2~4줄","hashtags":["해시태그",...5개],"why":"이 대본이 지금 트렌드에 맞는 이유 한두 문장","trends":["참고한 트렌드 키워드 2~4개"]}`;
  const res = await runStep({ step: "reelscript", purpose: "reel-script", blog: null, system: SYSTEM, prompt, json: true, maxTokens: 12000, retries: 0 });
  const raw = extractJson<Partial<ReelScript>>(res.text);
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).map((l) => String(l).replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 40);
  if (lines.length < 2) throw new Error("대본 응답이 불완전해요. 다시 눌러 주세요.");
  const tags = (Array.isArray(raw.hashtags) ? raw.hashtags : []).map((x) => String(x).replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean);
  return {
    title: String(raw.title ?? "").trim().slice(0, 40) || lines[0].slice(0, 30),
    hook: String(raw.hook ?? lines[0]).trim().slice(0, 80),
    lines,
    caption: String(raw.caption ?? "").trim().slice(0, 2200),
    hashtags: [...new Set(tags)].slice(0, 8).map((t) => `#${t}`),
    why: String(raw.why ?? "").trim().slice(0, 400),
    trends: (Array.isArray(raw.trends) ? raw.trends : []).map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 6),
    model: res.model,
    substitutedFor: res.substitutedFor,
  };
}
