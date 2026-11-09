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

-- ① 키워드 추천 결과 (② 사용자가 블로그별로 선택)
CREATE TABLE IF NOT EXISTS keyword_picks (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  batch_id    TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  season      TEXT NOT NULL DEFAULT '',
  origin      TEXT NOT NULL,                 -- ai | naver_related | user
  volume      JSONB,                         -- 네이버 검색광고 실제 월간 검색수
  trend       JSONB,                         -- 네이버 데이터랩 최근 3개월 상대지수
  status      TEXT NOT NULL DEFAULT 'new',   -- new | used | dismissed
  project_id  TEXT,
  provider    TEXT,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS keyword_picks_blog_idx ON keyword_picks(blog_id, created_at);
ALTER TABLE media_jobs ADD COLUMN IF NOT EXISTS project_id TEXT;
-- 휴지통: 삭제한 글은 deleted_at 이 채워지고, 휴지통에서 다시 삭제해야 완전히 지워짐
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- 블로그별 이미지 방식: ai(Higgsfield 생성) | official(제조사 공식 홈페이지 이미지)
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS image_source TEXT NOT NULL DEFAULT 'ai';
-- 블로그 방문자 수 (네이버 블로그 정보·티스토리 방문자 카운터에서 1시간마다 수집). today = 그날 방문자(하루 중 최댓값)
CREATE TABLE IF NOT EXISTS blog_visits (
  blog_id     TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  today       INTEGER NOT NULL DEFAULT 0,
  total       INTEGER,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blog_id, day)
);
-- 트렌드 뷰어 스크랩 (유튜브 급상승 영상 저장)
CREATE TABLE IF NOT EXISTS trend_scraps (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL DEFAULT 'youtube',
  item_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT '',
  thumbnail   TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL,
  views       BIGINT,
  category    TEXT NOT NULL DEFAULT '',
  memo        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, item_id)
);
-- ChatGPT·Gemini로 만든 이미지 (응답이 파일 자체라 DB에 보관하고 /api/img/아이디 로 보여 줌)
CREATE TABLE IF NOT EXISTS generated_images (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  prompt      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 인스타 캐러셀(카드뉴스): 블로그 글에서 만들거나 주제로 따로 만듦
CREATE TABLE IF NOT EXISTS carousels (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT REFERENCES blogs(id) ON DELETE SET NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  topic       TEXT NOT NULL DEFAULT '',
  slides      JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption     TEXT NOT NULL DEFAULT '',
  hashtags    JSONB NOT NULL DEFAULT '[]'::jsonb,
  images      JSONB NOT NULL DEFAULT '[]'::jsonb,
  style       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 🎬 영상공장: 링크로 받은 영상 · 편집본 · 스튜디오에서 만든 영상
CREATE TABLE IF NOT EXISTS videos (
  id           TEXT PRIMARY KEY,
  source_url   TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'download',  -- download | edit | studio
  parent_id    TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',    -- queued | running | ready | error
  message      TEXT NOT NULL DEFAULT '',
  path         TEXT,                               -- 저장소 경로 (mp4)
  thumb_path   TEXT,
  original_path TEXT,                              -- 자막 지우기 전 원본
  size         BIGINT,
  duration     REAL,
  width        INTEGER,
  height       INTEGER,
  info         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 저장소 키가 없을 때 임시로 DB에 보관하는 영상 파일
CREATE TABLE IF NOT EXISTS video_blobs (
  path        TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Higgsfield 생성 1건 예상 비용 (잔액 계산용)
ALTER TABLE media_jobs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC;
-- 조회수 순위 캡처 기록 (블로그·종류·날짜별 하나, 다시 넣으면 교체)
CREATE TABLE IF NOT EXISTS view_captures (
  blog_id    TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,              -- day | week | month
  day        DATE NOT NULL,              -- 그 기간의 마지막 날 (일간은 그날)
  period     TEXT NOT NULL DEFAULT '',
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai         TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blog_id, kind, day)
);
-- 🎬 영상 제작 스튜디오: 기획 → 캐릭터 → 장면 이미지 → 장면 영상 → 합치기
CREATE TABLE IF NOT EXISTS studio_projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  prompt      TEXT NOT NULL DEFAULT '',
  options     JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan        JSONB NOT NULL DEFAULT '{}'::jsonb,
  character   JSONB NOT NULL DEFAULT '{}'::jsonb,
  scenes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_id    TEXT,
  status      TEXT NOT NULL DEFAULT 'planned',
  message     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ✅ 할 일 (날짜·시간은 한국 시간 기준 문자열로 저장)
CREATE TABLE IF NOT EXISTS todos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,              -- YYYY-MM-DD (한국)
  due_time    TEXT,                       -- HH:MM (한국, 선택)
  blog_id     TEXT REFERENCES blogs(id) ON DELETE SET NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  idea_id     TEXT,
  memo        TEXT NOT NULL DEFAULT '',
  notify      BOOLEAN NOT NULL DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS todos_due_idx ON todos(due_date);
-- 🔔 텔레그램 알림 예약 (할 일 하나에 대기 중 예약은 하나만)
CREATE TABLE IF NOT EXISTS todo_notifications (
  id          TEXT PRIMARY KEY,
  todo_id     TEXT NOT NULL,
  send_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | sending | sent | canceled | failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS todo_notifications_one_pending ON todo_notifications(todo_id) WHERE status = 'pending';
-- 💡 아이디어 노트
CREATE TABLE IF NOT EXISTS ideas_notes (
  id          TEXT PRIMARY KEY,
  memo        TEXT NOT NULL,
  blog_id     TEXT REFERENCES blogs(id) ON DELETE SET NULL,
  link        TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',          -- calendar:<이벤트 키> 등
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 📅 마케팅 달력: 직접 넣은 행사(비정기·비공식 포함)
CREATE TABLE IF NOT EXISTS calendar_events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'irregular',  -- official | irregular
  link        TEXT NOT NULL DEFAULT '',
  memo        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 글 발행 예정일 (달력 표시용, 한국 날짜)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS publish_date TEXT;
-- 할 일 업무내용(인스타·유튜브·블로그·개인일정)과 연결 대상(캐러셀·영상 등)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE todos ADD COLUMN IF NOT EXISTS ref_id TEXT;
-- ✂️ 릴스 편집기: 바탕 영상 + 편집 문서(장면·자막·배경) → 맥에서 Remotion으로 내보내기
CREATE TABLE IF NOT EXISTS reel_projects (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  base_video_id   TEXT,
  doc             JSONB NOT NULL DEFAULT '{}'::jsonb,
  guide           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 받아쓰기·화면 전환 지점
  status          TEXT NOT NULL DEFAULT 'analyzing',    -- analyzing | ready | rendering | error
  message         TEXT NOT NULL DEFAULT '',
  output_video_id TEXT,
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 🔍 릴스 분석기: 링크 → 받아쓰기·장면 사진 → AI 분석 (카테고리별 보관)
CREATE TABLE IF NOT EXISTS study_reels (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  video_id    TEXT,
  mine        BOOLEAN NOT NULL DEFAULT FALSE,     -- 내 릴스(첫 3초·개선점) / 참고 릴스(구조)
  status      TEXT NOT NULL DEFAULT 'queued',     -- queued | running | done | error
  message     TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL DEFAULT '',
  uploader    TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT '',
  transcript  JSONB NOT NULL DEFAULT '[]'::jsonb,
  frames      JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{t, img}]
  analysis    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 📺 시리즈 기획 (같은 캐릭터로 여러 화)
CREATE TABLE IF NOT EXISTS studio_series (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  hero        TEXT NOT NULL DEFAULT '',
  friend      TEXT NOT NULL DEFAULT '',
  theme       TEXT NOT NULL DEFAULT '',
  style       TEXT NOT NULL DEFAULT '3d',
  characters  TEXT NOT NULL DEFAULT '',   -- 모든 장면 프롬프트에 그대로 넣는 캐릭터 생김새 문장 (영어)
  episodes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 📣 채널 변환: 블로그 글(앱 글·이미 올린 글·붙여넣기) → 다른 채널 초안
CREATE TABLE IF NOT EXISTS repurpose_docs (
  id          TEXT PRIMARY KEY,
  blog_id     TEXT,
  project_id  TEXT,
  title       TEXT NOT NULL DEFAULT '',
  source_url  TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  result      JSONB NOT NULL DEFAULT '{}'::jsonb,
  model       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 🔁 루틴 관리: 반복 업무 → 날짜별 실행 → 텔레그램 알림·재알림
CREATE TABLE IF NOT EXISTS routines (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'blog',        -- blog | research | insta | video | etc
  blog_id     TEXT,
  link        TEXT NOT NULL DEFAULT '',            -- 바로가기 (앱 화면 경로 또는 외부 주소)
  schedule    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {type: daily|weekly|monthly, days: [0-6], day: 1-31}
  time        TEXT NOT NULL DEFAULT '09:00',       -- 첫 알림 (한국 시간)
  deadline    TEXT NOT NULL DEFAULT '23:59',       -- 마감 (한국 시간)
  notify      BOOLEAN NOT NULL DEFAULT TRUE,
  remind      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {mode: interval|times|none, minutes, times: ["11:00"], max}
  completion  TEXT NOT NULL DEFAULT 'button',      -- button | checklist | system
  checklist   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id, label, kind: capture|check, required}]
  skip_holidays BOOLEAN NOT NULL DEFAULT FALSE,
  paused      BOOLEAN NOT NULL DEFAULT FALSE,
  priority    TEXT NOT NULL DEFAULT 'normal',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS routine_runs (
  id           TEXT PRIMARY KEY,
  routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  run_date     TEXT NOT NULL,                      -- 실행일 (한국 날짜)
  base_date    TEXT NOT NULL DEFAULT '',           -- 자료 기준일 (보통 전날 통계 등, 실행일과 따로)
  due_at       TIMESTAMPTZ NOT NULL,
  deadline_at  TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',    -- pending | in_progress | done | missed
  items        JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id, done, at, img, note}]
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (routine_id, run_date)
);
CREATE TABLE IF NOT EXISTS routine_notifications (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES routine_runs(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                         -- first | remind | snooze
  round     INTEGER NOT NULL DEFAULT 0,
  send_at   TIMESTAMPTZ NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending',       -- pending | sending | sent | failed | unknown | canceled | skipped
  attempts  INTEGER NOT NULL DEFAULT 0,
  error     TEXT,
  sent_at   TIMESTAMPTZ,
  message_id BIGINT,
  UNIQUE (run_id, kind, round)
);
CREATE INDEX IF NOT EXISTS routine_notifications_due ON routine_notifications (status, send_at);
-- 🎞 영상 편집 (캡컷형)
CREATE TABLE IF NOT EXISTS edit_projects (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  doc             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'ready',   -- ready | rendering | working | error
  message         TEXT NOT NULL DEFAULT '',
  output_video_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS image_kit JSONB NOT NULL DEFAULT '{}'::jsonb;  -- 🎨 이미지 컨셉 키트 (레퍼런스·스타일 문구·Soul ID)
ALTER TABLE carousels ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;        -- 게시함 (직접 표시)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE ideas_notes ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';  -- blog | insta | youtube | etc
ALTER TABLE ideas_notes ADD COLUMN IF NOT EXISTS detail TEXT NOT NULL DEFAULT '';    -- 세부 (블로그 이름·릴스·쇼츠·직접 입력)

-- 릴스 편집·영상 편집도 휴지통으로 (deleted_at 이 채워지면 목록에서 숨김, 휴지통에서 되살리기·완전 삭제)
ALTER TABLE reel_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE edit_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 휴지통(나머지 항목): 지운 줄을 통째로 보관 → 되살리기 · 30일 뒤 자동 완전 삭제
CREATE TABLE IF NOT EXISTS trash_items (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  label      TEXT NOT NULL DEFAULT '',
  rows       JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 💬 텔레그램 메시지함: 보낸(out) · 받은(in) 메시지 기록
CREATE TABLE IF NOT EXISTS telegram_messages (
  id         TEXT PRIMARY KEY,
  direction  TEXT NOT NULL,              -- out | in
  kind       TEXT NOT NULL DEFAULT '',   -- routine | todo | briefing | test | manual | reply | text | button
  chat_id    TEXT NOT NULL DEFAULT '',
  chat_name  TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'sent', -- sent | failed | received
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS telegram_messages_dir ON telegram_messages (direction, created_at DESC);

-- 📄 문서 → 마크다운 (MarkItDown, 맥): 원본은 변환 뒤 지움
CREATE TABLE IF NOT EXISTS doc_conversions (
  id         TEXT PRIMARY KEY,
  filename   TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  input      BYTEA,
  status     TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | error
  message    TEXT NOT NULL DEFAULT '',
  markdown   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인스타 디자인 참고함: 원본은 참고 전용, 내 캐러셀의 사진으로 복제하지 않음
CREATE TABLE IF NOT EXISTS ai_learning_refs (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  source_text TEXT NOT NULL DEFAULT '',
  analyze_until TIMESTAMPTZ,
  title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  images JSONB NOT NULL DEFAULT '[]',
  analysis JSONB,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ai_learning_tasks (
  id TEXT PRIMARY KEY,
  ref_id TEXT NOT NULL REFERENCES ai_learning_refs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'study',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  todo_id TEXT,
  idea_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 실제로 읽은 본문과 읽기 범위. 이전 대표 이미지만 저장한 자료는 자동 학습하지 않음.
ALTER TABLE ai_learning_refs ADD COLUMN IF NOT EXISTS coverage JSONB;
ALTER TABLE ai_learning_refs ADD COLUMN IF NOT EXISTS previous_analysis JSONB;

-- 트렌드 레이더: 일정·수집 항목·주간 예산을 DB에 보존 (맥/Render 중복 실행 방지)
CREATE TABLE IF NOT EXISTS radar_settings (id INTEGER PRIMARY KEY CHECK(id=1), auto_learning BOOLEAN NOT NULL DEFAULT TRUE, weekly_limit NUMERIC NOT NULL DEFAULT 1);
INSERT INTO radar_settings(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS radar_sources (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 weekday INTEGER NOT NULL DEFAULT 1, time TEXT NOT NULL DEFAULT '09:00', next_run_at TIMESTAMPTZ NOT NULL, queued_until TIMESTAMPTZ,
 last_checked TIMESTAMPTZ, last_error TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS radar_items (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES radar_sources(id), url TEXT NOT NULL, title TEXT NOT NULL, source_text TEXT NOT NULL DEFAULT '',
 published_at TIMESTAMPTZ, coverage TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'new', message TEXT NOT NULL DEFAULT '', learn_id TEXT REFERENCES ai_learning_refs(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(source_id,url)
);
CREATE TABLE IF NOT EXISTS radar_weeks (week TEXT PRIMARY KEY, limit_usd NUMERIC NOT NULL, spent NUMERIC NOT NULL DEFAULT 0, reserved NUMERIC NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS radar_attempts (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES radar_items(id), week TEXT NOT NULL, reserved NUMERIC NOT NULL, actual NUMERIC, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS radar_items_url_unique ON radar_items(url);

-- 429 후 같은 호스트의 반복 읽기 차단. 서버 재시작·여러 계정에도 유효.
CREATE TABLE IF NOT EXISTS remote_read_limits(host TEXT PRIMARY KEY,retry_at TIMESTAMPTZ NOT NULL);
-- 이전 버전에서 방금 관측한 인스타 429도 기본 1시간 보호 기간을 이어받음.
INSERT INTO remote_read_limits(host,retry_at)
SELECT 'instagram.com',MAX(last_checked)+INTERVAL '1 hour' FROM radar_sources
WHERE platform='instagram' AND last_error LIKE '%HTTP 429%' AND last_checked>NOW()-INTERVAL '1 hour'
HAVING MAX(last_checked) IS NOT NULL
ON CONFLICT(host) DO NOTHING;

-- 레이더는 관심 계정 바로가기로 전환. 기존 자료·사용/예약 비용 기록은 보존.
UPDATE radar_settings SET auto_learning=FALSE WHERE auto_learning=TRUE;
UPDATE radar_sources SET enabled=FALSE WHERE enabled=TRUE;

-- 블로그마다 저장하는 제목 작성 규칙·문자 그대로 금지할 표현
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS title_rules JSONB NOT NULL DEFAULT '["키워드를 나열하지 않고 자연스러운 한 문장으로 쓴다","과장하거나 확인되지 않은 효과·수익을 약속하지 않는다"]'::jsonb;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS title_forbidden JSONB NOT NULL DEFAULT '["|","｜"]'::jsonb;

-- 📥 크롬 확장 프로그램으로 받은 내용 (ChatGPT·제미나이 답변·이미지) — 글마다
CREATE TABLE IF NOT EXISTS post_inbox (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind       TEXT NOT NULL,                 -- text | image
  html       TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL DEFAULT '',
  image_url  TEXT NOT NULL DEFAULT '',
  source     JSONB NOT NULL DEFAULT '{}'::jsonb, -- {site, url, title}
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_inbox_project ON post_inbox (project_id, created_at DESC);

-- 공통 규칙은 별도 저장 후 각 블로그에 동적으로 적용. 개별 설정을 덮어쓰지 않음.
CREATE TABLE IF NOT EXISTS blog_common_rules(
 id TEXT PRIMARY KEY,rules JSONB NOT NULL DEFAULT '[]',forbidden JSONB NOT NULL DEFAULT '[]',scopes JSONB NOT NULL,
 target JSONB NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PC의 기존 네이버 로그인으로 실행. 미확인 신청은 자동 재시도하지 않음.
CREATE TABLE IF NOT EXISTS seoichoo_jobs (
 id TEXT PRIMARY KEY, blog_id TEXT NOT NULL REFERENCES blogs(id), kind TEXT NOT NULL,
 payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued',
 result JSONB NOT NULL DEFAULT '{}', cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS seoichoo_one_active ON seoichoo_jobs ((TRUE)) WHERE status IN ('queued','running');
