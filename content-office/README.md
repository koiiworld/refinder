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

## 2. 작동하는 기능 vs 미구현 기능

| 영역 | 상태 | 비고 |
|---|---|---|
| 멀티 블로그 관리 (블로그별 문체·AI 역할·이미지 스타일·검수 규칙, 블로그 추가/보관) | ✅ 작동 | |
| 통합 대시보드 (운영 현황·단계별 현황·승인 대기함·발행 일정·AI 비용/실행 내역) | ✅ 작동 | |
| 콘텐츠 캘린더 | ✅ 작동 | 프로젝트의 발행 예정일 기준 + 시즌 이벤트 표시 |
| 마케팅 달력 (한국 시즌·기념일·쇼핑 이벤트, 준비 시점, 직접 추가, AI 시즌 키워드 → 글감) | ✅ 작동 | 설날·추석은 2026~2028년 입력, 키워드 도출은 AI 연결 필요, 검색량 미표시 |
| 승인형 워크플로 (승인·수정 요청·직접 수정·다른 AI로 재검수·버전 복원·작업 재실행·반려) | ✅ 작동 | 서버 작업 큐 + 자동 재시도 |
| 콘텐츠 기획실 (SEO 제목 후보·키워드·검색 의도·목차·출처·이미지 계획, 직접 수정) | ✅ 작동 | 실제 기획은 AI 연결 필요 |
| AI 원고실 (역할 배정·작성·교차 검수·사실관계/출처/규칙 점검·버전 관리) | ✅ 작동 | OpenAI/Anthropic/Google 공식 API |
| WYSIWYG 에디터 (제목·본문·표·링크·이미지, 자동 저장, 선택 부분 AI 수정, 전후 비교, 버전 복원) | ✅ 작동 | 부분 수정은 AI 연결 필요 |
| 사용자 수정 보호 · 승인 후 변경 재검수 | ✅ 작동 | |
| 발행 패키지 내보내기 (HTML·마크다운·JSON) · 전체 백업 | ✅ 작동 | |
| 글감 직접 등록 · 경쟁 콘텐츠 URL 수집(수집일 저장) · AI 글감 추천 | ✅ 작동 | AI 추천은 AI 연결 필요 |
| 검색어 트렌드 (네이버 데이터랩 공식 API) | ⚠️ 코드 구현·미검증 | `NAVER_CLIENT_ID/SECRET` 필요 |
| 키워드 월간 검색량·경쟁도·연관 키워드 (네이버 검색광고 API, 7일 캐시) | ⚠️ 키 입력 후 실검증 | `NAVER_AD_API_KEY/SECRET_KEY/CUSTOMER_ID` |
| 유튜브 인기 급상승·키워드별 인기 영상·자주 나온 단어 (YouTube Data API) | ✅ 작동 | `YOUTUBE_API_KEY` |
| 네이버 크리에이터 어드바이저 유입 트렌드 (붙여넣기 저장 → 글감·AI 키워드 도출에 반영) | ✅ 작동 | 공식 API 없음, 화면에서 복사해 붙여넣기 |
| 접속 비밀번호 | ✅ 작동 | `APP_PASSWORD` 설정 시 |
| 블로그별 말투 예시 파일(.md/.txt) 업로드 → 원고·수정·부분수정·검수에 말투 반영 | ✅ 작동 | 요청당 최대 8,000자 전달 |
| 프롬프트 수정실 (ChatGPT·Claude·Gemini·Higgsfield × 이미지·영상/글 원고/정보 전달, 버전 기록) | ✅ 작동 | 다듬기는 텍스트 AI 연결 필요 |
| Higgsfield 생성: 이미지(SOUL), 영상(Wan 2.6 이미지→영상) | ✅ 작동 | `HIGGSFIELD_API_KEY=키ID:시크릿`, 크레딧 차감 |
| 이미지 스튜디오 (원고 연동 이미지 기획·승인·본문 배치) | ❌ 2차 | 지금은 에디터에서 이미지 직접 삽입 후 '이미지 작업 완료' |
| 인스타그램 캐러셀 제작실·발행 | ❌ 2차 | 워크플로에서 '건너뛰기' 가능 |
| 블로그 진단실 (Search Console) | ❌ 2차 | Google 계정 OAuth 승인 필요 |
| 블로그 자동 발행 | ❌ 미지원 | 티스토리 Open API 종료, 네이버 블로그 글쓰기 공식 API 없음 → 패키지를 내려받아 직접 게시 |
| Google 트렌드 | ❌ 미지원 | 공식 API 없음 |

원칙 준수:
- 실제 조회하지 않은 검색량·트렌드 수치를 만들지 않습니다. AI 프롬프트에서 금지하고, AI가 만든 출처 URL은 사용자가 등록한 출처와 대조해 제거합니다.
- AI 검수는 웹 검색 없이 제공된 출처와 대조만 하며, 확실하지 않으면 '확인 필요'로 표시합니다.
- 외부 발행은 하지 않습니다. 최종 승인 후에도 패키지 생성까지만 수행합니다.

---

## 3. 제작 흐름

```
글감 수집 → [주제 승인] → 기획안 작성(AI) → [기획 승인] → 원고 작성(AI) → AI 교차 검수(다른 AI)
→ [원고 승인] → 이미지 제작(2차·현재 수동) → [이미지 승인] → 발행 패키지(자동)
→ 인스타 캐러셀(2차·건너뛰기) → [최종 승인] → 발행 준비 완료
```
`[ ]` 단계에서 승인하면 다음 작업이 서버에서 자동 실행됩니다. 각 승인 단계에서
승인 / 수정 요청(→AI 재작성) / 직접 수정 / 다른 AI로 재검수 / 이전 버전 복원 / 작업 재실행 / 반려를 지원합니다.

**사용자 수정 보호**: 원고를 직접 고친 뒤 AI 재작성이 끝나면 AI 결과는 덮어쓰지 않고 '제안'으로 보관됩니다.
비교 후 '적용' 또는 '내 원고 유지'를 고르세요. 에디터는 revision 번호로 동시 수정 충돌도 감지합니다.

**승인 후 변경**: 원고 승인 이후 본문을 고치면 '재검수 필요'가 표시되고, 재검수하거나 '변경 내용 확인함'을 체크해야 최종 승인됩니다.

---

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
