// 공용 타입 정의

export type ProviderId = "openai" | "anthropic" | "google" | "template";

export type RoleKey = "planner" | "writer" | "reviewer" | "editor" | "ideas" | "prompter";

export interface RoleAssignment {
  provider: ProviderId;
  model: string;
}

export type AiRoles = Partial<Record<RoleKey, RoleAssignment>>;

export interface Blog {
  id: string;
  name: string;
  platform: string;
  url: string;
  category: string;
  description: string;
  style_guide: string;
  review_rules: string[];
  image_style: string;
  /** 이미지 방식: ai = Higgsfield로 생성, official = 제조사 공식 홈페이지 이미지 사용 */
  image_source: "ai" | "official";
  ai_roles: AiRoles;
  color: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  /** AI 작업 시 서버가 채워 넣는 말투 예시 (DB 컬럼 아님) */
  style_samples?: { filename: string; content: string }[];
}

export interface Source {
  url: string;
  title: string;
  description?: string;
  note?: string;
  collected_at: string; // ISO
  fetched?: boolean; // 서버에서 실제로 페이지 정보를 수집했는지
}

export interface Idea {
  id: string;
  blog_id: string;
  title: string;
  memo: string;
  keywords: string[];
  origin: "user" | "ai";
  origin_detail: string;
  sources: Source[];
  status: "new" | "approved" | "rejected";
  project_id: string | null;
  created_at: string;
}

export interface PlanImage {
  position: string;
  description: string;
}

export interface Plan {
  titleCandidates: string[];
  selectedTitle: string;
  mainKeyword: string;
  subKeywords: string[];
  searchIntent: string;
  targetReader: string;
  direction: string;
  outline: { heading: string; points: string[] }[];
  sources: { title: string; url: string; note: string }[];
  imagePlan: PlanImage[];
  notes: string;
}

export interface ReviewIssue {
  type: "fact" | "source" | "style" | "seo" | "rule" | "other";
  severity: "high" | "medium" | "low";
  quote: string;
  comment: string;
  suggestion: string;
}

export interface FactCheck {
  claim: string;
  status: "consistent_with_sources" | "needs_verification" | "likely_incorrect";
  note: string;
}

export interface ReviewResult {
  summary: string;
  score: number | null;
  issues: ReviewIssue[];
  factChecks: FactCheck[];
  ruleChecks: { rule: string; passed: boolean; note: string }[];
  provider: string;
  model: string;
  reviewedAt: string;
}

export interface Project {
  id: string;
  blog_id: string;
  idea_id: string | null;
  title: string;
  topic: string;
  brief: string;
  sources: Source[];
  stage: string;
  status: "waiting" | "running" | "error" | "done";
  status_message: string;
  plan: Plan | null;
  review: ReviewResult | null;
  approved_version_id: string | null;
  needs_rereview: boolean;
  scheduled_date: string | null;
  package: PublishPackage | null;
  created_at: string;
  updated_at: string;
}

export interface PublishPackage {
  generatedAt: string;
  title: string;
  html: string;
  markdown: string;
  tags: string[];
  metaDescription: string;
  imageChecklist: string[];
  versionId: string | null;
}

export interface DocumentRow {
  project_id: string;
  title: string;
  content_html: string;
  last_editor: "none" | "ai" | "user";
  user_edited_at: string | null;
  ai_written_at: string | null;
  pending_proposal_id: string | null;
  revision: number;
  updated_at: string;
}

export interface Version {
  id: string;
  project_id: string;
  kind: "plan" | "draft";
  number: number;
  title: string;
  content: string;
  source: string;
  label: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  project_id: string | null;
  blog_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  attempts: number;
  max_attempts: number;
  run_after: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}
