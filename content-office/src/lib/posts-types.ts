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
}

export interface PostImage {
  prompt: string;
  alt: string;
  aspect: string;
  mediaJobId?: string | null;
  url?: string | null;
  inserted?: boolean;
}

export interface PostExtras {
  hashtags: string[];
  images: PostImage[];
  writer?: { provider: string; model: string; substitutedFor: string | null };
  publishedUrl?: string | null;
  publishedAt?: string | null;
}
