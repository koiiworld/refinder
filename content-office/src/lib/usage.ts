import "server-only";
import { q } from "./db";
import { getSettings } from "./settings";

export type ModelUsage = { provider: string; model: string; calls: number; failed: number; inputTokens: number; outputTokens: number; cost: number };
export type StepUsage = { step: string; label: string; calls: number; failed: number; cost: number; models: ModelUsage[] };

/** ai_runs.purpose → 화면에 보일 단계 이름 */
const STEP_OF: Record<string, [string, string]> = {
  keywords: ["1", "① 키워드 추천"],
  "season-keywords": ["1", "① 키워드 추천"],
  titles: ["3", "③ SEO 제목 뽑기"],
  outline: ["3b", "③-2 기획안 (목차·근거)"],
  write: ["4", "④ 글 작성 (이미지 프롬프트 포함)"],
  hashtags: ["4h", "④ 해시태그"],
  "ai-learning": ["c1", "📚 AI 학습지"],
  carousel: ["c1", "📱 인스타 캐러셀"],
  "carousel-ideas": ["c1", "📱 인스타 캐러셀"],
  diagnose: ["d1", "🩺 블로그 진단"],
  "blog-hot": ["h1", "📰 블로그 핫이슈"],
  "hot-report": ["h1", "📰 블로그 핫이슈"],
  "video-subtitle": ["v1", "🎬 영상공장"],
  "studio-plan": ["v2", "🎬 영상 스튜디오"],
  "revenue-capture": ["r1", "수익 캡처 읽기"],
  review: ["6", "⑥ 글·이미지 검수"],
  edit: ["8", "에디터에서 부분 수정"],
  image: ["5", "⑤ 이미지 생성 (ChatGPT·Gemini)"],
};

/** 오늘(한국 시간) AI 사용량·비용 — 단계별·모델별. 기록된 비용이 0이면 현재 단가로 다시 계산 */
export async function todayUsage() {
  const { pricing } = await getSettings();
  const rows = await q<{ purpose: string; provider: string; model: string; status: string; input_tokens: number; output_tokens: number; cost_usd: number }>(
    `SELECT purpose, provider, model, status, COALESCE(input_tokens,0) AS input_tokens, COALESCE(output_tokens,0) AS output_tokens, COALESCE(cost_usd,0) AS cost_usd
     FROM ai_runs
     WHERE created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
       AND provider <> 'template'`,
  );
  const byModel = new Map<string, ModelUsage>();
  const bySteps = new Map<string, { label: string; models: Map<string, ModelUsage> }>();
  const add = (map: Map<string, ModelUsage>, key: string, r: (typeof rows)[number], cost: number) => {
    const u = map.get(key) ?? { provider: r.provider, model: r.model, calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    if (r.status === "succeeded") u.calls++;
    else u.failed++;
    u.inputTokens += Number(r.input_tokens);
    u.outputTokens += Number(r.output_tokens);
    u.cost += cost;
    map.set(key, u);
  };
  for (const r of rows) {
    const key = `${r.provider}:${r.model}`;
    const p = pricing[key];
    const cost = Number(r.cost_usd) > 0 ? Number(r.cost_usd) : p ? (Number(r.input_tokens) * p.input + Number(r.output_tokens) * p.output) / 1_000_000 : 0;
    add(byModel, key, r, cost);
    const [step, label] = (r.purpose.startsWith("radar-learning:") ? ["radar", "📡 트렌드 레이더 학습"] : STEP_OF[r.purpose]) ?? ["9", "기타 (이전 기능)"];
    const s = bySteps.get(step) ?? { label, models: new Map() };
    add(s.models, key, r, cost);
    bySteps.set(step, s);
  }
  const models = Array.from(byModel.values()).sort((a, b) => b.cost - a.cost);
  const steps: StepUsage[] = Array.from(bySteps.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, s]) => {
      const ms = Array.from(s.models.values()).sort((a, b) => b.cost - a.cost);
      return { step, label: s.label, models: ms, calls: ms.reduce((n, m) => n + m.calls, 0), failed: ms.reduce((n, m) => n + m.failed, 0), cost: ms.reduce((n, m) => n + m.cost, 0) };
    });
  const img = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM media_jobs WHERE created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`,
  );
  return { models, steps, total: models.reduce((s, m) => s + m.cost, 0), images: Number(img[0]?.n ?? 0) };
}
