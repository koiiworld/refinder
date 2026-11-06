/**
 * 발행 준비 판정 (서버·화면 공용) — 항상 '지금 원고' 기준
 * - 검수 뒤 글·이미지가 바뀌면 재검수 필요
 * - 고치지 않은 중요 지적, 근거 없는 사실(fact) 지적이 남으면 수정 필요
 * - [이미지 N] 빈자리: 앱에서 넣을 자리는 남으면 안 되고, '블로그 편집기에서 직접 넣기'로 표시한 자리는 수동 발행 준비
 */

export type ReadyState = "approval" | "running" | "error" | "rereview" | "fix" | "images" | "ready" | "manual" | "published" | "writing";

export const READY_LABEL: Record<ReadyState, { label: string; tone: "accent" | "warn" | "bad" | "ok" | "" }> = {
  approval: { label: "내 승인 필요", tone: "accent" },
  running: { label: "자동 실행 중", tone: "" },
  writing: { label: "작성 전", tone: "" },
  error: { label: "실패", tone: "bad" },
  rereview: { label: "재검수 필요", tone: "warn" },
  fix: { label: "수정 필요", tone: "warn" },
  images: { label: "이미지 남음", tone: "warn" },
  ready: { label: "발행 준비", tone: "ok" },
  manual: { label: "수동 발행 준비", tone: "ok" },
  published: { label: "발행 완료", tone: "ok" },
};

type Issue = { type?: string; severity?: string; fixed?: boolean; userNote?: string; comment?: string; quote?: string };
type Img = { url?: string | null; manual?: boolean };

export type Readiness = {
  state: ReadyState;
  score: number | null;
  openIssues: number;
  openHigh: number;
  unverified: { comment: string; quote: string }[];
  placeholders: number[]; // 앱에서 넣어야 하는 빈자리 번호
  manualPlaceholders: number[]; // 블로그 편집기에서 직접 넣을 빈자리 번호
  reasons: string[];
};

/** 본문 [이미지 N] 자리 번호들 */
export function placeholderNumbers(html: string): number[] {
  return [...(html ?? "").matchAll(/\[이미지\s*(\d+)[^\]]*\]/g)].map((m) => Number(m[1]));
}

export function readiness(input: {
  stage: string;
  status: string;
  needsRereview: boolean;
  review: { score?: number | null; issues?: Issue[]; imagesSeen?: number } | null;
  images: Img[];
  placeholders: number[];
  outlinePending?: boolean;
}): Readiness {
  const issues = input.review?.issues ?? [];
  const open = issues.filter((i) => !i.fixed);
  const openHigh = open.filter((i) => i.severity === "high");
  // 사실 지적: 고쳤거나, 코멘트에 원문 출처 주소를 붙였으면 해결로 봄
  const unverified = open.filter((i) => i.type === "fact" && !/https?:\/\//.test(i.userNote ?? "")).map((i) => ({ comment: String(i.comment ?? ""), quote: String(i.quote ?? "") }));
  const placeholders = input.placeholders.filter((n) => !input.images[n - 1]?.manual);
  const manualPlaceholders = input.placeholders.filter((n) => input.images[n - 1]?.manual);
  const imagesNow = input.images.filter((i) => i.url).length;
  const imagesChanged = !!input.review && imagesNow > (input.review.imagesSeen ?? 0);
  const score = input.review?.score ?? null;
  const reasons: string[] = [];
  let state: ReadyState;
  if (input.stage === "published") state = "published";
  else if (input.status === "error") state = "error";
  else if (input.status === "running") state = "running";
  else if (input.stage === "titles" || input.outlinePending) state = "approval";
  else if (!input.review) state = input.stage === "ready" ? "rereview" : "writing";
  else if (input.needsRereview || imagesChanged) {
    state = "rereview";
    reasons.push(input.needsRereview ? "검수 뒤에 글을 고쳤어요" : "검수 뒤에 이미지를 새로 넣었어요");
  } else if (openHigh.length || unverified.length || (score != null && score < 80)) {
    state = "fix";
    if (openHigh.length) reasons.push(`중요 지적 ${openHigh.length}건 남음`);
    if (unverified.length) reasons.push(`근거 확인 필요 ${unverified.length}건 (출처 주소를 코멘트에 붙이거나 표현을 고치세요)`);
    if (score != null && score < 80) reasons.push(`검수 점수 ${score}점 (80점 미만)`);
  } else if (placeholders.length) {
    state = "images";
    reasons.push(`앱에서 넣을 이미지 자리 ${placeholders.length}곳 남음`);
  } else state = manualPlaceholders.length ? "manual" : "ready";
  if (state === "manual") reasons.push(`블로그 편집기에서 직접 넣을 이미지 ${manualPlaceholders.length}곳`);
  return { state, score, openIssues: open.length, openHigh: openHigh.length, unverified, placeholders, manualPlaceholders, reasons };
}
