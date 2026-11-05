# 인수인계 (HANDOFF) — AI 콘텐츠 오피스

다른 AI 코딩 도구(Codex 등)가 이어서 작업할 때 **가장 먼저 읽을 문서**입니다. 기준 날짜: 2026-11-04.

## 0. 사용자와 일하는 규칙 (꼭 지킬 것)

- 사용자는 비개발자, **한국어로 쉽게** 설명. 화면 문구도 한국어.
- 돈 이야기는 **달러 + 괄호 원화, 환율 1,400원** 기준. 예: `$0.18 (₩252)`. 앱의 `fmtUsd()`도 같은 형식.
- **API 키·로그인·외부 배포·유료 결제·되돌릴 수 없는 삭제는 먼저 물어본다.** 키 값은 절대 출력·커밋하지 않는다(`.env.local`).
- 사용자는 "직접 해줘"를 선호: 터미널 작업도 대신 해 주기를 원함.
- 블로그 자동 발행은 하지 않음(티스토리 Open API 종료, 네이버 글쓰기 API 없음). 사용자가 복사해서 직접 올림.
- 이미지 생성은 **버튼을 누를 때만**(크레딧 차감). 자동 생성 금지.
- 실제 앱(포트 3000)과 실제 DB를 테스트로 더럽히지 말 것 → `tests/run-isolated.sh` 사용(아래 4번).

## 1. 제품 흐름 (현재 동작)

| 단계 | 누가 | 동작 |
|---|---|---|
| ① 키워드 추천 | AI | 네이버 검색광고(검색량·연관어)·데이터랩(추세)·유튜브 인기·시즌 달력·크리에이터 어드바이저(붙여넣기) + **이미 쓴 글 제목(RSS+앱 기록)으로 중복 회피** |
| ② 키워드 선택 | 사용자 | 블로그별 표에서 1개 이상 체크 → **고른 키워드들로 글 1개**(첫 키워드가 메인) |
| ③ SEO 제목 | AI → 사용자 | 후보 6개 뽑고 **멈춤**. 사용자가 고르고 "이 제목으로 글 쓰기"를 눌러야 ④ 시작 |
| ④ 글 작성 | AI | 말투 예시·문체·블로그 RSS 실제 글 목록(‘함께 보면 좋은 글’ 링크) 반영. 사용자는 **수정 요청사항** 칸에 적으면 그 부분만 AI가 수정(`edit_request`) |
| ⑤ 이미지 | 사용자 버튼 | 블로그 설정 `image_source`: `ai`=Higgsfield(모델 6종 선택+견적), `official`=제조사 공식 페이지에서 이미지 찾기·고르기(출처 표기) |
| ⑥ 검수 | AI(Claude) | 지적마다 "수정 요청"(AI가 그 부분만 수정, `fix_issues`) / "다시 검수" |
| ⑦ 발행 | 사용자 | 복사·HTML/MD 다운로드 → 직접 게시 → "발행 완료" |

그 밖: **메인(`/`) = 대시보드**(`src/lib/dashboard.ts` — 실제 기록만: 발행·1차 검수 통과율(첫 검수 80점↑)·완성 글 검색량·AI 비용·10주 추이·블로그별·키워드 TOP5·운영 상태, 수익은 정산 숫자 직접 입력 → `settings` 테이블 `revenue` 키). 글 만들기(①②)는 `/new`. **트렌드 뷰어 `/trends`**(`src/lib/trends.ts`: 유튜브 한국 급상승 카테고리별 30분 캐시, 스크랩 `trend_scraps`, '글감으로' → `/new?hint=`). 대시보드 방문자 비교는 `src/lib/visits.ts`(네이버 `m.blog.naver.com/rego/BlogInfo.naver`, 티스토리 PC 화면 카운터, 1시간마다 `blog_visits`). 진행 현황 체크박스 → **휴지통**(되살리기·완전 삭제), 진행 현황 맨 위 **오늘 쓴 AI 비용**(단계별·모델별, 접기), 설정 > 단계별 AI(모델 드롭다운·가격).

## 2. 코드 구조 (`content-office/`)

- Next.js **16** App Router(+`src/proxy.ts`가 미들웨어 역할 · 비밀번호 `APP_PASSWORD`), React 19, TypeScript, TipTap 3, PGlite(내장 Postgres) 또는 `DATABASE_URL`(Supabase).
- **Next 16은 학습 데이터와 다름** → `AGENTS.md` 지시대로 `node_modules/next/dist/docs/` 확인.
- `db/schema.sql` — 앱 시작 시 자동 적용. 컬럼 추가는 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 파일 끝에.
- `src/lib/jobs.ts` — DB 작업 큐. 핸들러: `titles`, `write`, `review`, `fix`. 휴지통 글의 작업은 실행 안 함. 503/429 백오프 재시도.
- `src/lib/workflow.ts` — createPosts, startWriting, rerun, selectTitle, requestFix, requestEdit, insertImage(출처 문단 포함) 등.
- `src/lib/ai/run.ts` — runStep: 단계별 담당 AI + **자동 대체**(크레딧 없음/401/403 → 10분간 제외, 혼잡 → 다음 후보). JSON 잘림 복구, HTML 정화.
- `src/lib/ai/step-prompts.ts` — 단계별 프롬프트(키워드·제목·작성·검수·수정). 모의 서버가 **system 문구로 단계를 구분**하므로 "SEO 키워드 전문가", "SEO 제목 전문가", "전속 작가", "편집장이자 팩트체커" 문구를 바꾸면 `tests/mock-ai-server.mjs`도 같이 바꿀 것.
- `src/lib/steps.ts`(단계·기본 AI), `src/lib/model-catalog.ts`(텍스트 모델 목록·단가 → 기본 단가), `src/lib/settings.ts`, `src/lib/usage.ts`(오늘 비용).
- `src/lib/hf-models.ts` + `higgsfield.ts` + `media.ts` — Higgsfield 이미지 모델 6종(SOUL, SOUL V2, SOUL Cinema, Qwen Image 3, Ideogram 4, Z-Image Turbo). 요청 형식은 docs.higgsfield.ai 모델별 generate 페이지 기준. 견적: `POST /estimate/<경로>`(차감 없음).
- `src/lib/official-images.ts` — 공식 페이지 이미지 후보 추출(og:image, srcset 최대 크기, 로고·아이콘 제외). **내부망 차단(DNS 확인, 리다이렉트마다 재확인)**.
- `src/lib/sample-html.ts` — 말투 예시 HTML→마크다운, 네이버 저장 파일은 글 번호로 PostView 본문을 다시 가져옴, 글 주소로 가져오기(네이버·티스토리·등록 블로그 도메인만).
- `src/lib/blog-posts.ts` — 블로그 RSS(네이버 `rss.blog.naver.com/<id>.xml`, 그 외 `<origin>/rss`) 6시간 캐시, 안내 페이지 제외, 이중 인코딩 해제.
- `src/lib/trash.ts` + `src/app/api/trash` + `src/app/trash` — 휴지통(`projects.deleted_at`).
- 화면: `src/app/page.tsx`+`DashboardParts.tsx`(대시보드), `src/app/new/page.tsx`+`new/KeywordStep.tsx`(①②), `src/app/posts/page.tsx`+`PostGroups.tsx`(목록·체크박스·비용), `src/app/posts/[id]/PostView.tsx`(③~⑦ 전부), `src/components/*`.

## 3. 사용자의 맥에서 실행 중인 환경

- 프로젝트: `/Users/minemone/project/refinder` (브랜치 `feature/ai-content-office`, 원격 `koiiworld/refinder`)
- 키: `content-office/.env.local` (커밋 금지). 변수 이름: `OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY(결제 켜진 키 — Gemini **이미지 전용**), GOOGLE_AI_TEXT_API_KEY(선택: 결제 안 켠 프로젝트의 무료 키 — 있을 때만 Gemini 글쓰기·대체 실행에 사용, 사용자 요청), HIGGSFIELD_API_KEY(키ID:시크릿), NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID(=3618959, 광고계정ID 106077 아님), NAVER_CLIENT_ID/SECRET(데이터랩, API HUB 방식), YOUTUBE_API_KEY, APP_PASSWORD, PGLITE_DIR, DATABASE_URL(비어 있음)`
- 데이터: `PGLITE_DIR=/Users/minemone/.ai-content-office/pglite` (iCloud 밖. 블로그 설정·말투 예시·글·비용 기록이 모두 여기 — **코드가 아니라 DB에 있음**)
- 실행 스크립트(`~/.ai-content-office/`):
  - `restart-app.sh` — `.next-new`에 먼저 빌드(기존 앱 계속 동작) → 성공하면 교체 후 `npm start` (멈춤 수십 초). 빌드 실패 시 기존 앱 유지
  - `start-app.sh` — 빌드 없이 시작
  - `start-tunnel.sh` — Cloudflare 임시 터널(휴대폰 접속용). **재시작하면 주소가 바뀜** → `tunnel.log`에서 `https://*.trycloudflare.com` 확인 후 사용자에게 알려 주기
  - 터미널 창에서 돌리려면: `osascript -e 'tell application "Terminal" to do script "~/.ai-content-office/restart-app.sh"'`
- 주의: `~/.npm` 캐시에 root 소유 파일이 있어 `npx`가 실패함 → `./node_modules/.bin/tsc`, `./node_modules/.bin/next`처럼 직접 실행.
- 타입 확인: `./node_modules/.bin/tsc --noEmit -p .`

## 3-1. 클라우드 배포 (상시 주소)

- **https://ai-content-office-m7sx.onrender.com** — Render 무료(Blueprint `render.yaml`, 브랜치 `feature/ai-content-office` 푸시 시 자동 배포). 키는 Render > Environment.
- DB: Supabase(서울, Session pooler). 맥 앱도 같은 `DATABASE_URL` 사용. Render에서는 PGlite 사용 금지(512MB 초과로 꺼짐) — `db.ts`에서 막음.
- 깨워 두기: Supabase **pg_cron** 작업 `keep-awake-ai-content-office`가 10분마다 `pg_net`으로 `/api/health` 호출 (컴퓨터 불필요). 확인: `select * from cron.job;`, 응답: `net._http_response`.

## 4. 테스트

```bash
cd content-office
zsh tests/run-isolated.sh   # 복사본 빌드 + 모의 AI 서버로 전체 테스트 (현재 9 + 17 통과)
```
- `tests/workflow.test.mjs` — AI 없이(템플릿) 흐름·휴지통·말투 예시
- `tests/ai-providers.test.mjs` — 모의 OpenAI/Anthropic/Gemini/네이버/유튜브/Higgsfield/RSS/공식 페이지 서버로 전체 경로
- 새 기능을 넣으면 테스트도 같이 추가. 담당 AI가 대체될 수 있으니 요청 찾기는 `stepPrompt("system 문구")` 헬퍼 사용.

## 5. 블로그 3개 (DB 설정 현황)

- `blog_tistory` **챈뽕노트** (https://chaenppong.tistory.com) — IT·전자제품, '~해요'체, 목차·비교표·FAQ, 글 끝 댓글 요청 금지 → RSS 실제 글로 "함께 보면 좋은 글". `image_source=official`. 말투 예시: 맥 미니 비교 글.
- `blog_algokitchen` **알고키친** (https://blog.naver.com/algo_kitchen) — 요리. 이미지: 흰 배경·흰 원형 접시, 메인 2:3 세로·나머지 4:3, 메인·완성 컷은 살짝 클로즈업. 말투 예시: 양배추 두부전(주소로 가져옴).
- `blog_naver_life` 네이버 육아·일상 — **블로그 주소 비어 있음**(RSS 기능 미적용).

## 6. 남은 일 / 확인 안 된 것

- [ ] Higgsfield SOUL 외 5개 모델: 견적만 실제 확인, **실제 생성은 미확인**. 처음 생성 결과 확인 필요.
- [ ] 공식 이미지 찾기: 애플·삼성 페이지에서 사진 추출 가능 확인(curl), 앱 화면에서 실제 사용은 미확인. 다이슨 등 봇 차단 사이트는 이미지 주소 직접 입력.
- [ ] 단계별 AI 추천 변경 제안(사용자 결정 대기): 글 작성 `gpt-6.1-sol`($2/$10, gpt-5.4보다 저렴), 키워드·제목 `gpt-6-luna`($0.1/$0.5).
- [ ] 상시 온라인 주소: Render + Supabase 배포(`render.yaml` 준비됨, 사용자 가입 필요). 지금은 맥 + 임시 터널.
- [ ] 챈뽕노트 '오류' 글 4~5개(크레딧 충전 전 실패) — 사용자가 정리(휴지통) 또는 다시 실행.
- [ ] 진행 중이던 글: 알고키친 수제 초콜릿 글 — 재료에 **몰드(틀)** 누락. 사용자가 '수정 요청사항' 칸으로 직접 요청 예정.
- 참고: 검수(Claude Sonnet)가 글 1편 비용의 절반 이상. 비용 표는 토큰×단가 추정치.
