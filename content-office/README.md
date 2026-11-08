# AI 콘텐츠 오피스 (1차 MVP)

ChatGPT·Claude·Gemini를 한 웹앱에서 역할별로 쓰는 **멀티 블로그 콘텐츠 제작 오피스**입니다.
사용자가 승인 버튼을 누르면 다음 AI 작업이 자동 실행되는 Human-in-the-Loop 방식으로 동작합니다.

- 기본 등록 블로그: 티스토리(IT·전자제품·생활정보), 네이버(육아·일상·사용 후기), 네이버 알고키친(요리·레시피)
- 데스크톱 · 모바일 반응형 (모바일은 하단 탭 메뉴)

---

## 1. 실행 방법

필요한 것: **Node.js 20 이상** (DB 설치 불필요)

```bash
cd content-office
npm install
npm run dev          # 개발 모드 → http://localhost:3000
```

운영 모드:

```bash
npm run build
npm start            # http://localhost:3000
```

### 휴대폰에서 보기
같은 Wi-Fi에서 PC의 IP로 접속하세요: `http://<PC의 IP>:3000`
(서버가 `0.0.0.0`으로 열리므로 바로 접속됩니다. 외부 인터넷 공개는 아래 '배포' 참고)

### AI 연결 (선택)
```bash
cp .env.example .env.local
# .env.local 에 사용할 키만 입력 → 서버 재시작
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_AI_API_KEY=...
HIGGSFIELD_API_KEY=키ID:시크릿   # 이미지·영상 생성 (선택)
```
- 키는 서버에서만 읽히고 DB·브라우저·내보내기 파일에 저장되지 않습니다.
- 연결 전에는 **템플릿(오프라인) 모드**로 전체 흐름을 확인할 수 있습니다. 템플릿 결과는 AI가 아니며 화면에 '템플릿'으로 표시됩니다. (설정에서 끌 수 있음)
- 연결 후 **설정 > 모델 목록 불러오기**로 실제 사용 가능한 모델 ID를 확인하고, **블로그 관리**에서 역할별 모델을 지정하세요.
  기본 배정: 기획=Gemini, 원고=Claude, 교차 검수=ChatGPT, 부분 수정=Claude, 글감 추천=Gemini

### 데이터 저장
- 기본: 내장 PostgreSQL(PGlite)이 `content-office/data/pglite`에 저장 → 앱을 꺼도 모든 상태 유지
- Supabase/PostgreSQL: `.env.local`에 `DATABASE_URL=postgresql://...` 입력 (스키마는 `db/schema.sql`이 자동 적용)
- 초기화하려면 서버를 끄고 `data/` 폴더를 지우세요.

---

## 2. 제작 흐름 (7단계)

| 단계 | 누가 | 담당 AI (기본) | 데이터 |
|---|---|---|---|
| ① 키워드 추천 | AI | ChatGPT → 안 되면 Gemini | 네이버 검색광고(월간 검색수·연관), 네이버 데이터랩(추세), YouTube 인기 급상승, 시즌 달력, 크리에이터 어드바이저 유입 트렌드(붙여넣기) |
| ② 블로그별 키워드 선택 | 나 | - | 검색량 순으로 정렬된 표에서 체크 |
| ③ SEO 제목 추천·선택 | AI | ChatGPT | 네이버 연관 키워드 검색량 참고, AI가 1개 선택(나중에 변경 가능) |
| ④ 글 작성 (해시태그 포함) | AI | ChatGPT | 블로그 문체·말투 예시 파일 반영, 이미지 자리·이미지 프롬프트 생성 |
| ⑤ 이미지 | 나(버튼) | Higgsfield | 자동 생성 안 함. 프롬프트 확인 후 버튼으로 생성 → 본문에 넣기 |
| ⑥ 글·이미지 검수 | AI | Claude | 생성된 이미지를 직접 보고 검수 |
| ⑦ 발행 | 나 | - | 제목·본문·해시태그 복사 / HTML·MD 다운로드 → 블로그에 게시 → "발행 완료" |

- 단계별 AI는 **설정 > 단계별 AI**에서 바꿀 수 있습니다. 담당 AI가 미연결·크레딧 부족·혼잡이면 **연결된 다른 AI로 자동 대체**되고 화면에 "○○ 대신 사용"으로 표시됩니다.
- ②에서 키워드를 고르면 ③→④→⑥이 자동으로 이어지고, 서버 재시작에도 작업이 유지됩니다(혼잡 시 최대 약 8분간 자동 재시도).
- 직접 고친 글은 AI가 덮어쓰지 않습니다(다시 쓰기 결과는 '제안'으로 보관). 검수 뒤 글을 고치면 '다시 검수'를 권합니다.
- 실제 조회하지 않은 검색량·추세는 표시하지 않습니다('-').
- 블로그 자동 발행은 하지 않습니다(티스토리 Open API 종료, 네이버 블로그 글쓰기 API 없음).

메뉴: **글 만들기(①②) · 진행 현황(③~⑦) · 블로그 설정(문체·말투 예시) · 설정(AI 연결·단계별 AI·단가·백업)**

## 4. 구조

```
content-office/
├─ db/schema.sql              # PostgreSQL 스키마 (blogs, ideas, projects, documents, versions,
│                             #   approvals, reviews, jobs, ai_runs, events, research_snapshots, settings)
├─ src/lib/
│  ├─ db.ts                   # PGlite ↔ PostgreSQL(Supabase) 어댑터, 자동 마이그레이션·시드
│  ├─ stages.ts               # 제작 단계 정의
│  ├─ workflow.ts             # 승인·수정 요청·반려·재실행·복원·제안 적용
│  ├─ jobs.ts                 # 서버 작업 큐 (DB 저장, 재시작 복구, 지수 백오프 재시도)
│  ├─ repo.ts                 # 버전 생성, 사용자 수정 보호, 자동 저장·재검수 감지
│  ├─ ai/providers.ts         # OpenAI·Anthropic·Google 공식 HTTP API 호출
│  ├─ ai/run.ts               # 역할 배정 해석, 실행 기록·비용 계산, JSON 추출, HTML 정화
│  ├─ ai/prompts.ts           # 기획·원고·수정·검수·부분수정·글감 프롬프트와 템플릿
│  ├─ research.ts             # URL 메타 수집(SSRF 차단), 네이버 데이터랩
│  └─ exporter.ts             # 발행 패키지·HTML·마크다운 변환
├─ src/app/                   # 화면(App Router)과 API 라우트(/api/*)
├─ src/components/            # 에디터(TipTap), 기획안 편집기, 공용 UI
└─ tests/                     # 통합 테스트·모의 AI 서버
```

기술: Next.js 16 · React 19 · TypeScript · PostgreSQL(PGlite/Supabase) · TipTap 3

---

## 5. 테스트

```bash
# 터미널 1
npm run build && npm start
# 터미널 2 — 승인형 워크플로 전체(7개 시나리오)
BASE_URL=http://localhost:3000 npm test
```

AI 연결 경로(요청 형식·응답 파싱·재시도·비용) 테스트 — 실제 키 없이 모의 서버 사용:
```bash
node tests/mock-ai-server.mjs &
OPENAI_API_KEY=test-openai ANTHROPIC_API_KEY=test-anthropic GOOGLE_AI_API_KEY=test-google \
OPENAI_BASE_URL=http://localhost:4010 ANTHROPIC_BASE_URL=http://localhost:4010 GOOGLE_AI_BASE_URL=http://localhost:4010 \
PGLITE_DIR=./data/test-ai npm start
BASE_URL=http://localhost:3000 node --test tests/ai-providers.test.mjs
```

---

## 6. 외부(모바일) 접속용 배포 — Render + Supabase (무료로 시작 가능)

노트북을 꺼도 휴대폰에서 접속할 수 있도록 클라우드에 상시 배포합니다. 설정 파일(저장소 루트의 `render.yaml`)은 준비되어 있고,
계정 가입·로그인만 직접 해주시면 됩니다. (모두 휴대폰 브라우저로도 진행 가능)

### ① Supabase — 데이터 저장소 (약 3분)
1. https://supabase.com 가입 → **New project**
2. Region: **Northeast Asia (Seoul)**, Database Password 설정(따로 메모)
3. 프로젝트 생성 후 상단 **Connect** → **Session pooler** 연결 문자열 복사
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`
4. `[YOUR-PASSWORD]`를 2번의 비밀번호로 바꿔 둡니다. (Direct connection은 IPv6 전용이라 Render에서 접속되지 않으니 꼭 *Session pooler* 사용)
   - 테이블은 앱이 처음 실행될 때 자동 생성됩니다.

### ② Render — 앱 서버 (약 5분 + 빌드 3~5분)
1. https://render.com 에 **GitHub 계정으로 가입**하고 `koiiworld/refinder` 저장소 접근 허용
2. **New + → Blueprint** → `refinder` 저장소 선택, 브랜치 **feature/ai-content-office**
3. 입력 칸에 값 입력:
   - `APP_PASSWORD`: 앱 접속 비밀번호 (**필수** — 비우면 앱이 차단됩니다)
   - `DATABASE_URL`: ①에서 만든 연결 문자열 (**필수**)
   - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY`: 가진 것만 (나중에 Environment 메뉴에서 추가 가능)
4. **Apply/Deploy** → 완료되면 `https://ai-content-office-xxxx.onrender.com` 주소가 생깁니다.

### ③ 휴대폰에서
- 위 주소 접속 → 비밀번호 입력 → Safari "공유 → 홈 화면에 추가" / Chrome "⋮ → 홈 화면에 추가"하면 앱처럼 실행됩니다.
- 이 브랜치에 커밋을 푸시하면 Render가 자동으로 다시 배포합니다.

### 무료 요금제의 한계
- Render 무료 서버는 **15분간 접속이 없으면 잠들고**, 다음 접속 때 깨어나는 데 30~60초 걸립니다. 진행 중이던 작업은 DB에 저장되어 있어 깨어나면 이어서 처리됩니다. 항상 켜두려면 Render Starter(월 7달러)로 변경하세요.
- Supabase 무료 프로젝트는 **1주일 동안 사용이 없으면 일시정지**됩니다(대시보드에서 Restore로 재개, 데이터는 유지).
- 무료 서버의 디스크는 재시작 시 지워지므로 반드시 `DATABASE_URL`을 설정하세요. (설정하지 않으면 설정 화면에 경고가 표시됩니다)

### 다른 플랫폼
Railway, Fly.io, VPS 등 Node.js 상시 실행 서버라면 `npm ci && npm run build && npm start`로 동일하게 동작합니다(`PORT` 환경 변수 사용).
Vercel 같은 서버리스 환경은 백그라운드 작업 큐가 요청 사이에 멈출 수 있어 권장하지 않습니다.


## AI 학습지와 과제물

메뉴 **AI 학습지**에서 후킹 문구·이미지 생성·디자인·블로그·기타를 고릅니다. 공개 인스타/핀터레스트 링크, 네이버/티스토리 글 또는 캡처를 저장하고 예상 비용을 확인한 뒤 **AI 학습**을 누르세요. 기타 자료는 관련 분야 여러 곳에 자동 배정되며 직접 고칠 수 있습니다. 접근 제한이 있는 링크는 캡처로 대체하세요. 최대 6장의 실제 읽힌 자료만 분석합니다.

모델을 재훈련하지 않고 원칙과 취향을 저장합니다. 선호·최근 자료 중 켜진 항목을 다음 생성에 참고하고, 현재 요청과 블로그별 규칙을 우선합니다. 자료 가져오기·분류 수정·시안 비교·과제 이동은 AI 호출이 없습니다. 학습은 설정의 릴스 분석 담당 AI를 사용하며, 다른 AI로 자동 전환하지 않습니다. 토큰 단가에 따른 예상 비용은 실제 청구와 다를 수 있습니다.

캐러셀 편집기에서는 **기존/학습/변형 시안**을 비교하고 선택한 뒤 저장합니다. 참고 이미지를 그대로 재사용하지 않고 배치·배색·여백·글자 강약을 반영합니다. 후킹은 구체적인 정보와 원문 근거를 우선하며 과장 표현과 근거 없는 숫자를 걸러냅니다. 자동 검사가 모든 주장을 검증하지는 않으므로 최종 문구를 확인하세요.

**과제물**에서는 학습에서 나온 점검·공부·설정·시도할 방향을 체크하고, 골라서 할 일이나 아이디어 노트에 보냅니다. 중복 전송은 한 번만 등록됩니다. 과제 완료와 할 일 완료는 별도이며, 과제가 실제 설정·유료 실행을 자동 수행하지 않습니다.

### Linux에서 격리 테스트

`bash tests/run-isolated.sh`는 `/tmp/co-test`에서 실제 키·DB를 제외하고 빌드한 다음 두 테스트 스위트를 실행합니다. API·받아쓰기·음성 및 로컬 비전 모델은 모의 도구로, Remotion·ffmpeg·MarkItDown은 실제 도구로 통합 흐름을 검증합니다. 모델 품질이나 실제 인스타/핀터레스트 접근 성공률을 검증하는 테스트는 아닙니다.

macOS 기본 도구 위치 외에는 `REMOTION_RUNTIME`, `REMOTION_BROWSER`, `MARKITDOWN_BIN`을 지정하세요. Remotion 도구 버전은 앱과 같은 4.0.538을 사용합니다. `AI_TOOLS_PYTHON`, `ESRGAN_BIN`, `RIFE_BIN`을 지정하면 해당 실제 로컬 비전 도구로 실행합니다. 지정하지 않으면 명시적 모의 도구를 사용하며, 출력 파일·프레임·해상도·작업 큐·저장 경로는 그대로 검사합니다.


## 내용 중심 학습과 트렌드 레이더

학습지는 모든 분야에서 먼저 게시물 본문의 도구·지식·방법·사용 조건·주의점·원문 근거·우리 작업에 적용할 점을 정리합니다. 후킹/이미지 생성/디자인/블로그는 배운 지식을 활용할 분야입니다. 이미지는 필요한 시각 자료로 함께 읽습니다. 대표 이미지만 읽거나 본문이 불확실한 자료는 학습을 막고 보충을 요청합니다. 실제 수집한 본문을 확인하고 텍스트·마크다운(파일 포함)으로 보충할 수 있습니다. 기존 분석은 보존하며 새 자료로 다시 공부합니다.

학습지 맨 앞 **트렌드 레이더**에서 계정·채널·RSS와 매주 확인할 한국 요일/시각을 등록합니다. 인스타그램은 공개 계정 목록/캡션, 유튜브는 연결된 API의 제목·설명, RSS/Atom은 공개된 본문·요약을 사용합니다. 영상 전체·자막이나 읽지 못한 캐러셀 장을 읽었다고 하지 않습니다. 계정당 최근 5개를 확인하고, 최근 7일 새 글만 자동 학습합니다. 게시 시각이 불명확하거나 사이트가 접근을 막으면 본문 보충 대기로 남깁니다. 중복 게시물은 다시 학습하지 않습니다.

자동 학습의 기본 주간 한도는 **$1 (₩1,500)**입니다. 등록 계정이 없으면 호출하지 않습니다. Gemini 공식 입력 토큰 수와 출력 최대 6,000 토큰의 비용을 앱에 등록된 단가로 예약하고, 여유가 없으면 생성하지 않습니다. 동시 작업의 예약 합계도 원자적으로 검사합니다. 응답이 불확실한 실패는 예약금을 유지하고 자동 재호출하지 않습니다. 실제 청구서는 모델·단가·무료 사용량에 따라 다를 수 있습니다. 이 한도는 레이더 자동 학습에만 적용하며 수동 AI 실행은 별도입니다.

작업은 DB 큐에 보존되고 서버가 켜진 뒤 분당 확인합니다. 맥과 브라우저는 꺼도 됩니다. Render가 잠든 시간의 정확한 시각 실행은 보장하지 않으며, 재개 후 밀린 확인을 처리합니다. 계정의 확인 일정·일시 정지와 전체 자동 학습을 앱에서 조정할 수 있습니다. 보충이 필요한 자료는 레이더에 표시되며 마크다운을 넣으면 같은 주간 한도 안에서 이어서 학습합니다.
