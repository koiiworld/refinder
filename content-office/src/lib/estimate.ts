import "server-only";
import { getSettings } from "./settings";
import type { StepKey } from "./steps";

/**
 * 돈 드는 버튼을 누르기 전 보여 줄 예상 비용 (토큰 × 단가 추정)
 * - 토큰 수는 지금까지 평균에 가까운 대략값. 실제 청구는 다를 수 있음
 */
const TOKENS: Record<string, { step: StepKey; label: string; input: number; output: number }> = {
  studio_rewrite:{step:"studio",label:"영상 문구·구성 다시 생성",input:3500,output:2200},
  outline: { step: "titles", label: "③-2 기획안 (목차·근거)", input: 2500, output: 1200 },
  write: { step: "writing", label: "④ 글 작성", input: 7000, output: 5000 },
  hashtags: { step: "hashtags", label: "④ 해시태그", input: 2000, output: 200 },
  review: { step: "review", label: "⑥ 검수", input: 9000, output: 1500 },
};

export type StepEstimate = { key: string; label: string; model: string; provider: string; usd: number | null };

export async function estimateSteps(keys: (keyof typeof TOKENS)[]) {
  const { stepAi, pricing } = await getSettings();
  const steps: StepEstimate[] = keys.map((k) => {
    const t = TOKENS[k];
    const a = stepAi[t.step];
    const p = pricing[`${a.provider}:${a.model}`];
    return { key: k, label: t.label, model: a.model, provider: a.provider, usd: p ? (t.input * p.input + t.output * p.output) / 1_000_000 : null };
  });
  return { steps, total: steps.every((s) => s.usd != null) ? steps.reduce((a, s) => a + (s.usd ?? 0), 0) : null };
}

/** 글 화면용: 기획안 / 글 쓰기 이후 자동으로 이어지는 단계 */
export async function postEstimates() {
  return { outline: await estimateSteps(["outline"]), write: await estimateSteps(["write", "hashtags", "review"]) };
}
