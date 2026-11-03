// 제작 단계 정의 (클라이언트·서버 공용)

export type StageKind = "gate" | "ai" | "manual" | "auto" | "end";

export interface StageDef {
  key: string;
  label: string;
  kind: StageKind;
  phase: 1 | 2; // 1차 MVP 구현 / 2차 예정
  help: string;
}

export const STAGES: StageDef[] = [
  { key: "topic_approval", label: "주제 승인", kind: "gate", phase: 1, help: "글감을 이 주제로 진행할지 승인합니다. 승인하면 기획안 작성이 자동 시작됩니다." },
  { key: "planning", label: "기획안 작성", kind: "ai", phase: 1, help: "기획 담당 AI가 SEO 제목, 키워드, 목차, 이미지 계획을 작성 중입니다." },
  { key: "plan_approval", label: "기획 승인", kind: "gate", phase: 1, help: "기획안을 검토하고 승인·수정 요청·직접 수정하세요. 승인하면 원고 작성이 자동 시작됩니다." },
  { key: "drafting", label: "원고 작성", kind: "ai", phase: 1, help: "작가 AI가 블로그 문체로 원고를 작성 중입니다. 완료 후 교차 검수가 자동 시작됩니다." },
  { key: "reviewing", label: "AI 교차 검수", kind: "ai", phase: 1, help: "검수 담당 AI가 사실관계·출처·문체·검수 규칙을 점검 중입니다." },
  { key: "draft_approval", label: "원고 승인", kind: "gate", phase: 1, help: "에디터에서 원고를 직접 고치거나 AI에 수정 요청 후 승인하세요." },
  { key: "images", label: "이미지 제작", kind: "manual", phase: 2, help: "이미지 스튜디오(AI 이미지 생성)는 2차 개발 예정입니다. 지금은 에디터에서 직접 이미지를 넣고 완료 처리하세요." },
  { key: "image_approval", label: "이미지 승인", kind: "gate", phase: 1, help: "본문 이미지 배치를 확인하고 승인하세요. 승인하면 발행 패키지가 자동 생성됩니다." },
  { key: "packaging", label: "발행 패키지", kind: "auto", phase: 1, help: "발행용 HTML·마크다운·태그·메타 설명을 생성 중입니다." },
  { key: "carousel", label: "인스타 캐러셀", kind: "manual", phase: 2, help: "캐러셀 제작실은 2차 개발 예정입니다. 건너뛰고 최종 승인으로 진행할 수 있습니다." },
  { key: "final_approval", label: "최종 승인", kind: "gate", phase: 1, help: "발행 패키지를 확인하고 최종 승인하세요. 외부 블로그 자동 발행은 하지 않으며, 패키지를 내려받아 직접 발행합니다." },
  { key: "done", label: "발행 준비 완료", kind: "end", phase: 1, help: "최종 승인된 프로젝트입니다." },
];

export const STAGE_INDEX: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

export function stageDef(key: string): StageDef {
  return STAGES.find((s) => s.key === key) ?? { key, label: key === "rejected" ? "반려됨" : key, kind: "end", phase: 1, help: "" };
}

export const GATE_STAGES = STAGES.filter((s) => s.kind === "gate").map((s) => s.key);

export function isAfterDraftApproval(stage: string) {
  return (STAGE_INDEX[stage] ?? -1) > STAGE_INDEX["draft_approval"];
}
