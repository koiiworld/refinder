-- AI 콘텐츠 오피스 스키마 (PostgreSQL / Supabase / PGlite 공용)
-- 모든 문장은 재실행해도 안전하도록 IF NOT EXISTS 를 사용합니다.

CREATE TABLE IF NOT EXISTS blogs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL,              -- tistory | naver | wordpress | other
  url           TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  style_guide   TEXT NOT NULL DEFAULT '',   -- 작성 문체
  review_rules  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 검수 규칙 목록
  image_style   TEXT NOT NULL DEFAULT '',   -- 이미지 스타일
  ai_roles      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 역할별 {provider, model}
  color         TEXT NOT NULL DEFAULT '#2563eb',
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 글감 (트렌드·키워드 연구소)
CREATE TABLE IF NOT EXISTS ideas (
  id           TEXT PRIMARY KEY,
  blog_id      TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  memo         TEXT NOT NULL DEFAULT '',
  keywords     JSONB NOT NULL DEFAULT '[]'::jsonb,
  origin       TEXT NOT NULL DEFAULT 'user',   -- user | ai
  origin_detail TEXT NOT NULL DEFAULT '',      -- 예: AI 제안 모델명
  sources      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{url,title,description,collected_at,note}]
  status       TEXT NOT NULL DEFAULT 'new',    -- new | approved | rejected
  project_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 실제 조회된 외부 트렌드 데이터 스냅샷 (조회 출처·조회일 보존)
CREATE TABLE IF NOT EXISTS research_snapshots (
  id           TEXT PRIMARY KEY,
  blog_id      TEXT REFERENCES blogs(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,          -- naver_datalab | url_fetch
  query        JSONB NOT NULL DEFAULT '{}'::jsonb,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  blog_id          TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  idea_id          TEXT,
  title            TEXT NOT NULL,
  topic            TEXT NOT NULL DEFAULT '',
  brief            TEXT NOT NULL DEFAULT '',     -- 사용자 요청사항
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage            TEXT NOT NULL DEFAULT 'topic_approval',
  status           TEXT NOT NULL DEFAULT 'waiting',  -- waiting | running | error | done
  status_message   TEXT NOT NULL DEFAULT '',
  plan             JSONB,
  review           JSONB,
  approved_version_id TEXT,
  needs_rereview   BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_date   TEXT,                         -- YYYY-MM-DD
  package          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 현재 작업 중인 원고 (에디터 자동 저장 대상)
CREATE TABLE IF NOT EXISTS documents (
  project_id      TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  content_html    TEXT NOT NULL DEFAULT '',
  last_editor     TEXT NOT NULL DEFAULT 'none',  -- none | ai | user
  user_edited_at  TIMESTAMPTZ,
  ai_written_at   TIMESTAMPTZ,
  pending_proposal_id TEXT,                      -- 사용자 수정 보호로 보류된 AI 원고 버전
  revision        INTEGER NOT NULL DEFAULT 0,    -- 낙관적 동시성 제어용
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기획안·원고 버전
CREATE TABLE IF NOT EXISTS versions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,           -- plan | draft
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,           -- draft: HTML, plan: JSON 문자열
  source      TEXT NOT NULL,           -- ai | user | autosave | restore | ai_edit
  label       TEXT NOT NULL DEFAULT '',
  provider    TEXT,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS versions_project_idx ON versions(project_id, kind, number);

-- 사용자 승인 기록 (검수 결과와 별도)
CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  decision    TEXT NOT NULL,           -- approved | changes_requested | rejected | skipped
  comment     TEXT NOT NULL DEFAULT '',
  version_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI 검수 결과 기록
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id  TEXT,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 서버 측 작업 큐
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT,
  blog_id      TEXT,
  type         TEXT NOT NULL,          -- plan | draft | review | package | suggest_ideas
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued | running | succeeded | failed | canceled
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status, run_after);

-- AI 호출 실행 내역 (비용 포함)
CREATE TABLE IF NOT EXISTS ai_runs (
  id             TEXT PRIMARY KEY,
  job_id         TEXT,
  project_id     TEXT,
  blog_id        TEXT,
  purpose        TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  status         TEXT NOT NULL,        -- succeeded | failed
  attempt        INTEGER NOT NULL DEFAULT 1,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12,6) NOT NULL DEFAULT 0,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 프로젝트 활동 타임라인
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_project_idx ON events(project_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);
