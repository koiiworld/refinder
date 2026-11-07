# 인수인계 (HANDOFF) — AI 콘텐츠 오피스

다른 AI 코딩 도구(Codex 등)가 이어서 작업할 때 **가장 먼저 읽을 문서**입니다. 기준 날짜: 2026-11-06. **파일 찾기는 `CODEMAP.md`(자동 생성: `node scripts/codemap.mjs`)를 먼저 보세요.**

## ★ 지금 바로 이어서 (2026-11-07 밤, Claude 마지막 상태)

- 저장소: `https://github.com/koiiworld/refinder` · 브랜치 **`feature/ai-content-office`** · 앱 폴더 **`/Users/minemone/project/refinder/content-office`** (이 맥 폴더가 기준)
- 배포: 이 브랜치에 push 하면 **Render 자동 배포**. 맥 앱 재시작: `osascript -e 'tell application "Terminal" to do script "zsh ~/.ai-content-office/restart-app.sh"'`
- 사용자 허락: **사용자가 요청한 변경은 테스트 통과 후 바로 배포(push)해도 됨.** 키·외부 결제·운영 데이터 삭제는 물어볼 것.
- 테스트: `bash tests/run-isolated.sh` (5~10분, /tmp/co-test 에 복사해 모의 AI로 돌림, 실제 DB 안 건드림). 마지막 통과: 10 + 60.
- **커밋 안 된 작업 없음.** 모든 작업이 커밋·배포됨 (마지막: 블로그 진단 개선 — 테스트 10 + 60 통과, 브라우저 확인 완료).
  - 블로그 진단(`diagnose.ts`, `DiagnoseView.tsx`): AI 진단 JSON 에 `problems[].steps/example`, `fixes[]`(점검표 줄별 고치는 법·실제 제목 기존→개선 예시), `growth[]`(조회수·유입 늘리기, 대시보드 조회수 캡처 `topPosts` 근거). 점검표 줄마다 "💡 고치는 법"·"🔄 다시 진단하기"(AI 없이 수치만). 이번 주 할 일 문구 수정(`POST /api/diagnose {blogId, next}`) + 체크 → 할 일로 보내기 팝업(`/api/todos`)
- 다음 요청 예정(사용자가 코덱스에 직접 요청): **앱 안 ChatGPT (chat 모드 / work 모드)** — OpenAI 키 사용이라 대화마다 비용 발생, 사용자와 범위 확인 후 시작.
- 최근(11-07) 끝낸 것: 캡컷형 영상 편집 `/edit` + 2단계 AI 도구(배경 제거 rembg·화질 Real-ESRGAN·슬로모션 RIFE·AI 음성 edge-tts, 모두 맥 `~/.ai-content-office/` 의 무료 도구, 작업 종류 `edit_fx`/`edit_tts` 는 맥 전용), 문서→마크다운 `/convert`(MarkItDown, 맥 전용 `doc_convert`), 텔레그램 탭 `/telegram`(보낸·받은 메시지함), 휴지통 통합(`trash.ts`·`trash-snap.ts`, 30일 뒤 자동 완전 삭제), 글 편집기 ✂️캡처·✨AI 수정(표는 HTML 그대로 수정), 애드포스트 하루 입력, 인기 글 TOP10 날짜·기간 지정, 진단 줄별 다시 진단하기.
- 그 밖에 아직 안 한 것: 루틴 '승인 대기·AI 오류 알림'(기획안 문서의 다음 단계), 영상 편집의 속도 곡선·마스크·템플릿 자동 편집.
- 개발 팁: 맥 Bash 명령은 한 줄씩 단순하게(복잡한 파이프·변수는 거절될 수 있음). UI 확인은 `/tmp/co-ui/*.mjs`(playwright-core + 맥 크롬) 방식, 테스트 서버는 `tests/run-isolated.sh` 가 만든 `/tmp/co-test` 에서 포트 3102.

## 0. 사용자와 일하는 규칙 (꼭 지킬 것)

- 사용자는 비개발자, **한국어로 쉽게** 설명. 화면 문구도 한국어.
- 돈 이야기는 **달러 + 괄호 원화**. 환율: **지출(AI 비용 등) $1 = ₩1,500**, **수익(애드센스 등) $1 = ₩1,200**. 예: `$0.18 (₩270)`. 앱의 `fmtUsd()`(지출용)도 같은 형식, 수익은 `REVENUE_KRW_PER_USD`.
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

## 1-1. 2026-11-05~06 추가된 기능 (화면 · 핵심 파일)

| 기능 | 화면 | 핵심 파일 | 메모 |
|---|---|---|---|
| 블로그 핫이슈 + 글감 리포트 | `/hot` | `blog-hot.ts`, `hot-report.ts` | 네이버 블로그 홈 `DirectoryPostList`(주제 번호 20 요리·29 맛집·15 육아·30 IT·27 국내여행…), AI(무료 Gemini) 관련성 필터 1시간 캐시, 구글 트렌드 KR RSS, 네이버 뉴스(API HUB). 리포트 승인 → `createPosts(…, brief)` → 제목·글 프롬프트에 기획 전달 |
| 인스타 캐러셀 | `/carousels` | `carousel.ts`, `app/carousels/render.ts` | 브라우저 캔버스 1080×1350로 그림(서버 부담 없음). 콘텐츠 유형 4종(장수·구성), 블로그 발행 글 사진 가져오기(`sample-html.ts` `postImages`) |
| 블로그 진단 | `/diagnose` | `diagnose.ts` | 검색 누락·키워드 순위(API HUB 블로그 검색), RSS 발행 리듬, 글 구조(굵은 한 줄 = 소제목) |
| 🎬 영상공장 | `/videos` | `videos.ts`, `video-store.ts` | yt-dlp(`bin/yt-dlp`, `scripts/setup-bin.mjs`로 설치) + ffmpeg(맥 brew / `ffmpeg-static`). AI가 화면 자막 위치(box_2d) 찾아 delogo. 저장: `SUPABASE_SERVICE_KEY` 있으면 Supabase Storage 'videos' 버킷, 없으면 `video_blobs` |
| 대시보드 추가 | `/` | `dashboard.ts`, `DashboardParts.tsx`, `top-posts.ts`, `balances.ts`, `coupang.ts` | 30일 방문자 그래프, 블로그 이름 → TOP10(반응 순위 + 조회수 캡처 `view_captures` 일·주·월), 블로그별 키워드 TOP5, AI별 잔액(충전 기록 − 앱 사용액), 쿠팡 API 3시간마다, 애드포스트 캡처(파일·드래그·Ctrl+V) |
| 핵심 규칙 | — | `jobs.ts` | 맥·Render가 같은 DB 작업 큐를 씀. 재시작해도 남의 작업 안 건드림(30분 넘게 멈춘 것만 재시도). 영상 작업은 저장소가 같은 서버만(맥에 Supabase 키 없으면 Render가 처리). 서버가 모르는 작업 종류는 안 가져감 |

- 키 추가(이름만): `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`(맥·Render 둘 다 넣음), `SUPABASE_SERVICE_KEY`(Render만 — 맥엔 아직 없음).
- 무료 Gemini(`keywords`·`hashtags` 단계 기본)는 키워드·해시태그·화면 캡처 읽기·핫이슈 필터·진단에 씀. 제목(ChatGPT mini)·검수(Claude)는 유료 유지(사용자 결정).
- 🎬 영상 스튜디오 `/studio` (`studio.ts`): 기획(ChatGPT mini) → 캐릭터(Gemini, 참고 이미지로 같은 인물) → 장면 이미지 → Higgsfield Wan 2.6 장면 영상(공개 주소 필요: Render `RENDER_EXTERNAL_URL`) → ffmpeg 합치기(자막: `bin/NotoSansKR.ttf`) → 영상공장. ffmpeg는 `ffmpeg-static`을 먼저 씀(brew ffmpeg엔 drawtext 없음).
- ⚠️ 고장 알림 (`health.ts`): 방문자·쿠팡·핫이슈·구글 트렌드·네이버 검색·검색광고·영상 받기·AI·Higgsfield 성공/실패 기록 → 연속 실패 시 대시보드 맨 위. 종류: 직접 해결 / 코드 수정 필요 / 자동 복구. yt-dlp는 켜질 때 + 매주 `-U`, 사이트 변경으로 실패하면 즉시 업데이트 후 재시도.
- ✅ 할 일 `/todos` (`todos.ts`): 오늘/예정/완료, 업무내용(인스타·유튜브·블로그·개인일정, `category`·`ref_id`), 한국 날짜·시간 문자열 저장. 할 일은 달력에 "내 할 일"로 자동 표시. 대시보드 `🚨오늘할일🚨` 버튼 → 오늘 탭.
- 🔔 텔레그램 알림: `todo_notifications`(할 일당 대기 1개) + 작업 큐 `todo_notify`(run_after=알림 시각). 시간 변경=취소 후 재예약, 완료·삭제·끄기=취소. 발송 전 `pending→sending`으로 한 번만 가져감, 응답 불확실하면 재발송 안 함. 키: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (아직 미설정 — 사용자 승인 후).
- 💡 아이디어 `/ideas` (`ideas.ts`): 저장·이동만, AI 호출 없음. → `/todos?title=&blog=&idea=` · `/new?blog=&hint=`(채우기만).
- 📅 마케팅 달력 `/calendar` (`calendar.ts`): 시즌(`seasons.ts`) · 공식 공휴일(구글 한국 공휴일 ICS, 하루 캐시) · 비정기(선거·임시공휴일 + 직접 추가 `calendar_events`) · 내 발행(`projects.publish_date`, 발행일).
- 📅 캘린더(구 마케팅 달력): 시즌 행사는 행사별 색, 기간 행사는 시작·끝 날만 글자(사이는 점), 명절·하루짜리는 글자. 분류 이름: 연간 시즌 행사/공휴일·공식 행사/비정기 행사/콘텐츠 발행 일정/업무 일정.
- 대시보드 머리: 🚨오늘할일🚨(팝업, 체크로 완료) · ⚠️점검필요(숫자, 팝업 3칸 self/auto/code). 사이드 탭의 '대시보드'는 빼고 로고가 대시보드 링크.
- 🔑 설정 'API 키 직접 연결' (`keystore.ts`): settings `api_keys`에 AES-256-GCM 암호화(비밀 = `APP_PASSWORD`, 없으면 `KEYS_SECRET`). 시작 시·1분마다 process.env 에 반영, 앱 키가 환경변수보다 우선, 지우면 원래 환경변수. 맥·Render의 APP_PASSWORD가 다르면 한쪽은 '다시 입력 필요'. 백업에서 제외.
- 💲 단가 새로고침 (`pricing-refresh.ts`): LiteLLM 공개 가격표(`PRICING_SOURCE_URL`)와 비교해 바뀐 모델만 반영, settings `pricing_updates`로 7일간 NEW.
- 📊 전체 작업 현황 `/work` (`work.ts`): 블로그·캐러셀·스튜디오·영상공장을 plan/make/review/ready/done 5칸 칸반 + 아래 단계 막대 상세 목록, 카드 누르면 팝업. 캐러셀·영상은 `posted_at`(게시함 버튼 `PostedButton`, `/api/work/posted`)으로 완료. 3일 넘게 그대로거나 오류면 '막힌 것'.
- 블로그 업로드 `/posts` = 새 글 만들기(키워드 추천) + 진행 목록. `/new`는 `/posts?new=1`로 넘김.
- 메뉴(`Nav.tsx`): 전체 작업 현황 / 워크스페이스 / 콘텐츠 리서치 / 블로그 관리(업로드·진단·설정) / 영상 제작 / 인스타그램 관리(캐러셀) / 설정·휴지통. 그룹 접기·펼치기(localStorage `nav-open`), 지금 페이지 그룹은 자동 펼침.
- ✂️ 릴스 편집기 `/reels` (`reels.ts`, `src/remotion/*`, `app/reels/[id]/ReelEditor.tsx`·`ops.ts`): 영상공장 영상/내 영상 올리기(`/api/videos/upload`) → 맥 작업 `reel_analyze`(faster-whisper 받아쓰기 `scripts/transcribe.py` + ffmpeg 화면 전환·소리 모양) → 문장별 장면·자막 초안 → 편집(가이드/편집/완성 3단, 탭 내 파일·글자·장면·배경, 타임라인 자르기·지우기·복제·되돌리기, 자동 저장) → 맥 작업 `reel_render`(`scripts/render-reel.mjs`, Remotion, 결과는 영상공장 kind=reel). 맥 전용 작업(`MAC_ONLY_JOBS`)은 Render가 안 가져감. 맥 도구: `~/.ai-content-office/whisper-venv`(python3.12, faster-whisper), `~/.ai-content-office/remotion-runtime`(@remotion/bundler·renderer 4.0.538), 번들 캐시 `~/.ai-content-office/remotion-cache`. Remotion은 개인·3명 이하 무료.
- 🎨 이미지 레퍼런스 (`image-refs.ts`, `image-prompt.ts`, `RefPicker`·`KitCard`·`SoulCard`): 레퍼런스 사진은 generated_images(provider='reference', 공개 /api/img)에 저장. 블로그 컨셉 키트 `blogs.image_kit`(refs·style·soulId·on). 생성 시 `prepareImage`: 한국어→영어(무료 Gemini, step `imageprompt`), 키트+이번만 레퍼런스(최대 5), 스타일 문구. Gemini=inlineData, ChatGPT=/v1/images/edits, Higgsfield=공개 https 주소(SOUL image_reference_url 1장+custom_reference_id, Qwen 편집 3장, Grok 5장, Ideogram 1장). Soul ID: POST /v1/custom-references(학습 비용 문서에 없음 → 확인 후), 목록 settings `soul_ids`. 글 이미지: ✏️ 프롬프트 수정·🤖 모델 추천. 스튜디오도 같은 기능.
- 💰 이미지 비용: 예전엔 Gemini·ChatGPT 이미지가 cost 0으로 기록됨 → `IMAGE_PRICING`(model-catalog) 기본 단가 추가 + 생성 때 비용 기록. 과거 기록도 토큰×단가로 다시 계산돼 잔액에 잡힘.
- 📣 블로그 글 → 다른 채널 (`repurpose.ts`, `repurpose-channels.ts`, 글 화면 맨 아래): 릴스 대본·카드뉴스 7장·스레드·인스타 캡션·당근·네이버 플레이스·FAQ·카톡. 고른 것만 AI 1회(step carousel), `package.repurpose`에 저장.
- 🔍 릴스 분석 `/study` (`reel-study.ts`, 표 `study_reels`): 링크 → 영상공장으로 받기 → 맥 작업 `reel_study`(whisper·첫 3초+장면 사진 → generated_images provider='study') → 무료 Gemini(step `reelstudy`, 사진 data URL) 분석·카테고리.
- 📺 시리즈 기획 (`series.ts`, 표 `studio_series`, `/studio/series/[id]`): N화 한 번에, 캐릭터 생김새 문장을 모든 장면 프롬프트 맨 앞에 고정(`StudioOptions.lockCharacter`), 이어서·화별 고치기, 작업 `series_episode`로 화마다 스튜디오 기획 대기열. 스튜디오 기획 규칙에 "한 장면 한 동작" 추가.
- ③-2 기획안 사실 확인: 'AI 확인 요청'(네이버 뉴스·블로그 검색 + 무료 Gemini, `factcheck.ts`, step `factcheck`) → 확인완료(출처 채움·확인 필요 해제)/확인안됨. 왼쪽 체크박스로 삭제 → 승인 시 `outline.removed`로 빠짐, '삭제한 내용' 팝업에서 원상복구.
- 릴스 편집기 자막 등장 효과 `style.anim` (페이드·팝·올라오기·통통·타자).
- Claude Code 스킬 `.claude/skills/reel-reader` (저장소 루트): 링크 → `/tmp/reel-read/<id>/`에 설명·받아쓰기·장면 사진.
- **운영 규칙(사용자 지정, 2026-11-07)**: 운영 데이터 변경·실제 텔레그램 발송·유료 AI 호출·배포(푸시=Render 배포, 맥 앱 재시작=실제 DB 스키마 반영)는 **별도 승인 후**. 단, **사용자가 바꿔 달라고 요청한 변경은 승인 없이 배포**(2026-11-07 사용자 지시). 텔레그램 연결 완료(@Acontentofficebot).
- 사용자 보류: 역할별 AI 직원(에이전트) 구성. 후속: 쿠팡 반품상품 검색기. 범위 밖: 지인 배포·상용화. 사무실 화면(대시보드 픽셀 오피스) 제안만 함.

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
zsh tests/run-isolated.sh   # 복사본 빌드 + 모의 AI 서버로 전체 테스트 (현재 10 + 34 통과)
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
- [x] 상시 온라인 주소: Render + Supabase (완료).
- [ ] 🎬 영상 제작 스튜디오(프롬프트 기획 → 캐릭터 → 장면별 Higgsfield 영상 → ffmpeg 합치기 → 영상공장에 저장) — 다음 작업.
- [ ] 애드센스 API(OAuth) — 사용자가 Google Cloud 설정 후 `GOOGLE_ADSENSE_CLIENT_ID/SECRET` 주면 '연결' 버튼 만들기.
- [ ] 맥에도 `SUPABASE_SERVICE_KEY` 넣으면 영상 작업을 맥이 먼저 처리(더 빠름).
- [ ] 챈뽕노트 '오류' 글 4~5개(크레딧 충전 전 실패) — 사용자가 정리(휴지통) 또는 다시 실행.
- [ ] 진행 중이던 글: 알고키친 수제 초콜릿 글 — 재료에 **몰드(틀)** 누락. 사용자가 '수정 요청사항' 칸으로 직접 요청 예정.
- 참고: 검수(Claude Sonnet)가 글 1편 비용의 절반 이상. 비용 표는 토큰×단가 추정치.
