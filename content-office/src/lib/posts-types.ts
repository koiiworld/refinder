// 7단계 글 데이터 (projects.plan / projects.package 에 저장)

export interface PostPlan {
  keyword: string;
  candidates: { title: string; reason: string }[];
  best: number;
  selectedTitle: string;
  bestReason: string;
  subKeywords: string[];
  related: { keyword: string; total: number }[];
  ai: { provider: string; model: string; substitutedFor: string | null };
  userPicked?: boolean;
  /** 📰 핫이슈 리포트에서 승인한 글감 (제목·글 작성에 함께 전달) */
  brief?: PostBrief;
  /** ③-2 기획안: 목차·핵심 주장·근거·이미지 계획 (승인해야 글을 씀) */
  outline?: PostOutline;
}

export interface PostOutline {
  sections: { heading: string; points: string[] }[];
  claims: { claim: string; evidence: string; source: string; check: boolean }[];
  images: { n: number; what: string }[];
  approved: boolean;
  ai?: { provider: string; model: string };
}

export interface PostBrief {
  issue: string;
  title: string;
  why: string;
  direction: string;
  sources: { title: string; url: string }[];
}

export interface PostImage {
  /** 이 자리는 앱에서 넣지 않고 블로그 편집기에서 직접 넣음 (발행 준비 판정에서 제외) */
  manual?: boolean;
  prompt: string;
  alt: string;
  aspect: string;
  /** ai = Higgsfield 생성용, official = 공식 홈페이지 이미지 */
  kind?: "ai" | "official";
  /** official: 이미지에 나올 제품 이름 */
  product?: string;
  /** official: 이미지를 찾을 공식 페이지 주소 (AI 추정 → 사용자가 확인·수정) */
  pageUrl?: string;
  /** official: 본문에 넣을 출처 표기 (예: 출처: Apple) */
  credit?: string;
  /** official: 공식 페이지에서 찾은 이미지 후보 */
  candidates?: string[];
  mediaJobId?: string | null;
  /** 마지막으로 고른 Higgsfield 모델 */
  model?: string;
  url?: string | null;
  inserted?: boolean;
  /** 본문에 넣은 이미지 주소 (교체할 때 같은 자리를 바꾸기 위해) */
  insertedUrl?: string | null;
}

export interface PostExtras {
  hashtags: string[];
  images: PostImage[];
  writer?: { provider: string; model: string; substitutedFor: string | null };
  publishedUrl?: string | null;
  /** 마지막 '수정 요청사항' 반영 결과 */
  lastEdit?: { at: string; note: string; changes: string[] };
  publishedAt?: string | null;
}
