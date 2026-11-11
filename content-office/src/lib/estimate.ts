import "server-only";
import { getSettings } from "./settings";
import type { StepKey } from "./steps";

/**
 * 돈 드는 버튼을 누르기 전 보여 줄 예상 비용 (토큰 × 단가 추정)
 * - 토큰 수는 지금까지 평균에 가까운 대략값. 실제 청구는 다를 수 있음
 */
const TOKENS: Record<string, { step: StepKey; label: string; input: number; output: number }> = {
  carousel_caption:{step:"carousel",label:"캐러셀 캡션·해시태그 다시 생성",input:3500,output:1600},
  reel_script:{step:"reelscript",label:"🎬 릴스 AI 대본 (트렌드 반영)",input:4500,output:5000},
  ig_reel:{step:"carousel",label:"📱 릴스 대본",input:4000,output:2500},
  ig_reply:{step:"carousel",label:"📱 댓글 답글",input:5000,output:4000},
  ig_profile:{step:"carousel",label:"📱 프로필 점수 (캡처 포함)",input:6000,output:2500},
  ig_plan:{step:"carousel",label:"📱 주간 계획",input:4000,output:2500},
  ig_viral:{step:"carousel",label:"📱 잘 된 영상 분석",input:4500,output:2500},
  carousel_slide:{step:"carousel",label:"카드 한 장 문구 다시 생성",input:3500,output:1600},
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
