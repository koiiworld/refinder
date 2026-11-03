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

-- 프롬프트 수정실 (대상 AI × 용도별 프롬프트와 수정 이력)
CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  target      TEXT NOT NULL,              -- gpt | claude | gemini | higgsfield
  kind        TEXT NOT NULL,              -- visual | writing | info
  media       TEXT NOT NULL DEFAULT 'image', -- visual 일 때 image | video
  blog_id     TEXT REFERENCES blogs(id) ON DELETE SET NULL,
  input       TEXT NOT NULL,              -- 사용자가 처음 쓴 프롬프트
  goal        TEXT NOT NULL DEFAULT '',   -- 원하는 결과 설명
  versions    JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{n, result, source, provider, model, feedback, created_at}]
  current     JSONB,                      -- 현재 최종본 (RefineResult)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 이미지·영상 생성 작업 (Higgsfield 등 외부 생성 API)
CREATE TABLE IF NOT EXISTS media_jobs (
  id           TEXT PRIMARY KEY,
  prompt_id    TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,           -- higgsfield
  model        TEXT NOT NULL,           -- 앱 내부 모델 ID (soul-standard 등)
  media        TEXT NOT NULL,           -- image | video
  request_id   TEXT,
  status       TEXT NOT NULL,           -- queued | in_progress | completed | failed | nsfw | canceled | error
  status_url   TEXT,
  cancel_url   TEXT,
  input        JSONB NOT NULL DEFAULT '{}'::jsonb,
  urls         JSONB NOT NULL DEFAULT '[]'::jsonb,
  error        TEXT,
  expires_at   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_jobs_prompt_idx ON media_jobs(prompt_id, created_at);

-- 블로그별 말투 예시 파일 (마크다운·텍스트). AI 원고 작성·수정·검수 시 문체 참고용
CREATE TABLE IF NOT EXISTS blog_samples (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  content     TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blog_samples_blog_idx ON blog_samples(blog_id, created_at);

-- 마케팅 달력: 직접 추가한 이벤트
CREATE TABLE IF NOT EXISTS marketing_events (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT REFERENCES blogs(id) ON DELETE CASCADE,   -- NULL 이면 모든 블로그
  name        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  lead_days   INTEGER NOT NULL DEFAULT 21,
  keywords    JSONB NOT NULL DEFAULT '[]'::jsonb,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시즌 키워드 (AI 제안 또는 출발 키워드) — 검색량 수치는 저장하지 않음
CREATE TABLE IF NOT EXISTS season_keywords (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  event_key   TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  year        INTEGER NOT NULL,
  keyword     TEXT NOT NULL,
  angle       TEXT NOT NULL DEFAULT '',    -- 글 방향
  timing      TEXT NOT NULL DEFAULT '',    -- 발행 시점 제안
  intent      TEXT NOT NULL DEFAULT '',    -- 검색 의도
  source      TEXT NOT NULL,               -- ai | seed
  provider    TEXT,
  model       TEXT,
  idea_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS season_keywords_idx ON season_keywords(blog_id, year, event_key);

-- 실제 조회한 키워드 검색량 캐시 (출처·조회일 보존, 7일 재사용)
CREATE TABLE IF NOT EXISTS keyword_stats (
  keyword      TEXT NOT NULL,       -- 띄어쓰기 제거한 키워드
  source       TEXT NOT NULL,       -- naver_ad
  data         JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (keyword, source)
);
