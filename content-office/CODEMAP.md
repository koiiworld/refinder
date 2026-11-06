# 코드 지도 (자동 생성)

`node scripts/codemap.mjs` 로 다시 만듭니다. 파일마다 맨 위 설명 한 줄과 내보내는 이름입니다.
작업 전에 이 지도에서 관련 파일을 먼저 찾고, 자세한 규칙은 HANDOFF.md 를 보세요.

## src/lib

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `api.ts` |  | Ctx, ok, fail, handle, body |
| `balances.ts` | AI별 잔액 (충전액 − 앱에서 쓴 금액) | BALANCE_PROVIDERS, BalanceProvider, balances, addTopUp, setActualUsed, removeTopUp |
| `benchmark.ts` | 인기 글 분석 → 내 블로그에 적용 | PostStats, statsOf, analyzePopular, lastBenchmark |
| `blog-hot.ts` | 📰 블로그 핫이슈: 네이버 블로그 홈 '주제별 보기'에 지금 올라오는 글 중 반응(공감·댓글) 많은 글 | HOT_TABS, HotPost, HotTabData, topWords, hotTab |
| `blog-posts.ts` | 내 블로그의 실제 최근 글 목록 (블로그 RSS) | BlogPostLink, rssUrlOf, parseRss, recentPosts, writtenTitles, PostStat, naverPostStats |
| `carousel.ts` | 📱 인스타 캐러셀(카드뉴스) | Slide, CarouselImage, TypeVersion, CarouselStyle, Carousel, CONTENT_TYPES, ContentTypeId, FORMATS … |
| `coupang.ts` | 쿠팡파트너스 Open API: 이번 달 수익·클릭·주문 자동 집계 | coupangConnected, coupangAuth, syncCoupang, lastCoupangSync |
| `creator.ts` | 네이버 크리에이터 어드바이저 '유입 트렌드' — 공식 API가 없어 사용자가 화면에서 복사해 붙여 넣은 목록을 저장 | CreatorTrend, parseTrendText, saveCreatorTrend, listCreatorTrends, creatorTrendContext |
| `dashboard.ts` | 메인 대시보드 데이터 — 모두 앱 DB의 실제 기록만 사용 (지어낸 숫자 없음) | PASS_SCORE, RevenueChannel, RevenueEntry, MonthRevenue, monthKey, getRevenue, saveRevenue, dashboardData … |
| `db.ts` | 데이터베이스 어댑터 | getDb, q, q1, dbKind, newId, j |
| `diagnose.ts` | 🩺 블로그 진단 | naverBlogSearch, naverSearch, postKey, blogKey, Check, diagnoseBlog, Diagnosis, DiagnoseState … |
| `exporter.ts` | 표를 단순 마크다운 표로 변환 | htmlToMarkdown, plainText, buildPackage, packageHtmlFile, escapeHtml |
| `hf-models.ts` | 공식 문서에서 요청 형식(스키마)을 확인한 모델 | HF_MODELS, HfModelId, HF_IMAGE_MODELS |
| `higgsfield.ts` | Higgsfield 공식 API (이미지·영상 생성 전용) — https://docs.higgsfield.ai | HF_ENV, hfConnected, HiggsfieldError, hfTest, HfSubmitResult, hfEstimate, hfSubmit, HfStatus … |
| `hot-report.ts` | 📋 블로그 글감 추천 리포트 | Issue, ReportItem, HotReport, googleTrends, createReport, lastReport, approveItem, restoreItem … |
| `image-gen.ts` | ChatGPT(OpenAI Images API)·Gemini(이미지 출력) 로 바로 생성 → DB에 저장 → /api/img/<아이디> 로 공개 | ImageGenError, generateDirect, getGeneratedImage |
| `image-models.ts` | 이미지 생성 모델 목록 (클라이언트·서버 공용) — Higgsfield · ChatGPT(OpenAI) · Gemini(Google) | ImageModel, IMAGE_MODELS, IMAGE_PROVIDER_NAMES, imageModel |
| `jobs.ts` | 서버 측 작업 큐 | enqueue, ensureWorker, VIDEO_JOBS, jobLabel |
| `keywords.ts` | 60일 안에 준비하거나 진행 중인 시즌 | KeywordPick, recommendKeywords, addUserKeyword, listPicks |
| `media.ts` | 모델별 요청 본문 (공식 문서 스키마 기준: docs.higgsfield.ai 모델별 generate 페이지) | MediaJob, buildBody, estimateMedia, createMediaJob, getMediaJob, listMediaJobs, refreshMediaJob, cancelMediaJob |
| `model-catalog.ts` | 단계별 AI에서 고를 수 있는 모델 목록 (클라이언트·서버 공용) | CatalogModel, MODEL_CATALOG, catalogPricing |
| `official-images.ts` | 제조사 공식 페이지에서 제품 이미지 후보 찾기 | extractImages, findOfficialImages, checkImageUrl |
| `post-bundle.ts` | 글 상세 화면 데이터. 생성 중인 이미지는 Higgsfield 에 상태를 물어 갱신 | postBundle, PostBundle |
| `posts-types.ts` | 📰 핫이슈 리포트에서 승인한 글감 (제목·글 작성에 함께 전달) | PostPlan, PostBrief, PostImage, PostExtras |
| `repo.ts` | 말투 예시 파일(사용 중인 것)을 붙인 블로그 — AI 작업 전용 | listBlogs, getBlog, getBlogForAi, getProject, getDocument, getVersion, listVersions, listIdeas … |
| `research.ts` | 경쟁·참고 콘텐츠 URL에서 제목/설명을 실제로 수집 (수집일 기록) | fetchUrlMeta, naverConnected, naverTrend |
| `sample-html.ts` | 말투 예시용 HTML(블로그 글 저장 파일·편집기 HTML) → 마크다운 텍스트 | findNaverPost, fetchNaverPostHtml, importPostFromUrl, importPostWithImages, postImages, isHtmlFile, sampleHtmlToText |
| `searchad.ts` | 네이버 검색광고 API - 키워드 도구 (월간 검색량·경쟁도·연관 키워드) | naverAdConnected, signature, KeywordStat, keywordStats, cachedStats |
| `seasons.ts` | y년 m월의 n번째 요일(0=일) | SeasonTag, SeasonEvent, addDays, seasonEvents, LUNAR_YEARS, blogTags, seedsFor, KIND_LABEL |
| `seed.ts` | 기본 역할 배정: 기획=Gemini, 원고=Claude, 검수=ChatGPT, 부분수정=Claude, 글감추천=Gemini | DEFAULT_MODELS, DEFAULT_ROLES, seedIfEmpty |
| `settings.ts` | 기본 단가 (USD / 100만 토큰). 설정에서 직접 고치면 그 값이 우선합니다. | AppSettings, DEFAULT_PRICING, getSettings, saveSettings |
| `steps.ts` | 글(프로젝트) 진행 단계 | StepKey, STEP_AI_LABEL, DEFAULT_STEP_AI, FALLBACK_MODELS, POST_STAGES, STEP_NAMES, stageLabel, stageStep |
| `studio.ts` | 🎬 영상 제작 스튜디오 (쇼츠·릴스) | StudioImage, StudioClip, StudioScene, StudioPlan, StudioCharacter, StudioOptions, StudioProject, STUDIO_STYLES … |
| `top-posts.ts` | 블로그별 인기 글 TOP 10 | ViewItem, ViewKind, ViewsBlock, ReactionTop, viewsOf, topPosts, saveViewsFromCapture, lastCaptureDay |
| `trash.ts` | 휴지통으로 옮기기 (대기 중인 AI 작업은 취소, 키워드는 그대로 '사용됨'으로 둠) | moveToTrash, restoreFromTrash, purge |
| `trends.ts` | 트렌드 뷰어 탭 | TrendTabDef, TREND_TABS, TrendVideo, TrendTabData, trendTab, TrendScrap, listScraps, addScrap … |
| `types.ts` | 이미지 방식: ai = Higgsfield로 생성, official = 제조사 공식 홈페이지 이미지 사용 | ProviderId, RoleKey, RoleAssignment, AiRoles, Blog, Source, Idea, PlanImage … |
| `usage.ts` | ai_runs.purpose → 화면에 보일 단계 이름 | ModelUsage, StepUsage, todayUsage |
| `video-store.ts` | 영상 저장소 | MAX_VIDEO_BYTES, storageKind, putFile, getFile, signedUrl, deleteFiles, dbFile |
| `videos.ts` | 🎬 영상공장 | Box, Video, EditOptions, ffmpegPath, probe, listVideos, getVideo, addVideoLink … |
| `visits.ts` | 블로그 방문자 수 수집 (공개 정보만) | VisitSnapshot, naverBlogId, parseCounter, fetchVisits, collectVisits, visitDaily, visitSummary |
| `workflow.ts` | ② 고른 키워드(1개 또는 여러 개)로 글 1개를 만들고 ③ 제목 후보만 뽑음 — 글쓰기는 사용자가 버튼으로 시작 | WorkflowError, createPosts, startWriting, rerun, selectTitle, setHashtags, setImage, insertImage … |
| `youtube.ts` | YouTube Data API v3 (공식) | youtubeConnected, YT_CATEGORIES, YtVideo, searchRecent, videosByIds, trendingVideos, frequentTerms, trending … |

## src/lib/ai

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `prompts.ts` | 블로그 말투 예시 파일 → 프롬프트 블록 (토큰 비용을 위해 총 글자 수 제한) | blogContext, MAX_SAMPLE_CHARS, styleSamplesText, planPrompt, planTemplate, draftPrompt, revisePrompt, draftTemplate … |
| `providers.ts` | 공식 HTTP API 직접 호출 (SDK 미사용, 서버에서만 실행) | AiRequest, AiResponse, AiError, PROVIDER_LABELS, providerKey, isConnected, connectionStatus, callProvider … |
| `run.ts` |  | RunOptions, RunResult, resolveAssignment, runAI, extractJson, sanitizeHtml, StepRunResult, runStep |
| `step-prompts.ts` | ───────── ① 키워드 추천 ───────── | keywordsPrompt, titlesPrompt, writePrompt, hashtagsPrompt, postReviewPrompt, fixPrompt |

## src/app

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `DashboardParts.tsx` | 입력칸 숫자에 천 단위 쉼표 | TrendChart, CostDays, RevenueCard, BlogTopButton, AiBalances, TopKeywordsCard |
| `api/ai/edit/route.ts` | 선택한 문단만 AI 수정 — 결과는 제안으로만 반환하고, 적용은 사용자가 결정 | POST |
| `api/ai/models/route.ts` | 연결 상태 및 공식 API 기준 사용 가능한 모델 목록 | GET |
| `api/blogs/[id]/route.ts` |  | GET, PUT |
| `api/blogs/[id]/samples/[sid]/route.ts` | 사용 여부 전환 | PATCH, DELETE |
| `api/blogs/[id]/samples/route.ts` | HTML에서 뽑은 글이 이보다 짧으면 네이버 글 번호로 본문을 다시 찾아봄 | GET, POST |
| `api/blogs/route.ts` |  | GET, POST |
| `api/carousels/[id]/img/[n]/route.ts` | 캐러셀 사진을 같은 주소로 전달 (브라우저 캔버스에 그려 저장하려면 같은 출처여야 함) | GET |
| `api/carousels/[id]/route.ts` | 장면·캡션·해시태그·디자인 저장 | GET, PUT, POST, DELETE |
| `api/carousels/ideas/route.ts` | 알고리즘 타기 쉬운 캐러셀 주제 추천 | POST |
| `api/carousels/route.ts` | 새 캐러셀: { projectId } 블로그 글에서 · { topic, niche, format, blogId } 주제로 | GET, POST |
| `api/dashboard/balances/route.ts` | 충전 기록 추가: { provider, usd, at?, note? } · 지우기: { provider, remove: index } | GET, POST |
| `api/dashboard/revenue/capture/route.ts` | 수익 화면 캡처(애드포스트 등) → AI가 화면의 수익 숫자를 읽어 돌려줌 | POST |
| `api/dashboard/revenue/coupang/route.ts` | 쿠팡파트너스 이번 달 수익 지금 불러오기 | POST |
| `api/dashboard/revenue/route.ts` | 이번 달 수익 직접 입력 (쿠팡파트너스·애드포스트·애드센스 정산 화면 숫자) | GET, PUT |
| `api/dashboard/top/route.ts` | 조회수 순위 캡처 → AI가 읽어 저장 | GET, POST |
| `api/dashboard/visits/route.ts` | 블로그 방문자 수 (?refresh=1 이면 지금 바로 다시 수집) | GET |
| `api/diagnose/route.ts` | 🩺 블로그 진단 시작 (서버 작업 큐에서 진행 — 화면을 떠나도 계속) | GET, POST |
| `api/export/route.ts` | 전체 백업 내보내기 (API 키는 DB에 저장하지 않으므로 포함되지 않음) | GET |
| `api/health/route.ts` |  | GET |
| `api/hot/route.ts` | action: report(새 리포트) · approve(승인 → 글 만들기 시작) · skip(넘기기) | GET, POST |
| `api/img/[id]/route.ts` | ChatGPT·Gemini로 만든 이미지 (로그인 없이 공개 — 블로그 글에 넣어도 보이도록. 아이디는 추측하기 어려움) | GET |
| `api/keywords/route.ts` | recommend(① AI 추천) / add(직접 입력) / dismiss(목록에서 빼기) | GET, POST |
| `api/login/route.ts` |  | POST |
| `api/media/[id]/route.ts` | 상태 조회 (진행 중이면 Higgsfield 에 물어 갱신) | GET, POST |
| `api/media/route.ts` | Higgsfield 생성 요청 (크레딧 차감) | GET, POST |
| `api/posts/[id]/route.ts` |  | GET, POST, DELETE |
| `api/posts/route.ts` | ② 선택한 키워드로 글 만들기 → ③④⑥ 자동 진행 | GET, POST |
| `api/projects/[id]/document/route.ts` | 에디터 자동 저장 (revision 으로 동시 수정 충돌 감지) | GET, PUT |
| `api/projects/[id]/export/route.ts` | ⑦ 발행용 내려받기: format=html / md / json | GET |
| `api/projects/[id]/versions/[vid]/route.ts` |  | GET |
| `api/projects/[id]/versions/route.ts` | 현재 원고(또는 기획안)를 수동으로 버전 저장 | POST |
| `api/research/benchmark/route.ts` | 인기 글 주소(최대 5개) 분석 → 내 블로그 적용 제안 | GET, POST |
| `api/research/creator/image/route.ts` | 크리에이터 어드바이저 캡처 → AI가 화면의 유입 검색어 목록을 읽어 붙여넣기 형식(한 줄에 하나)으로 돌려줌 | POST |
| `api/research/creator/route.ts` | 크리에이터 어드바이저 유입 트렌드 붙여넣기 저장 | GET, POST, DELETE |
| `api/settings/route.ts` |  | GET, PUT |
| `api/studio/[id]/route.ts` | 상태 (진행 중인 장면 영상은 Higgsfield에 확인해 갱신) | GET, PUT, POST, DELETE |
| `api/studio/route.ts` | ① 프롬프트로 기획 시작 | GET, POST |
| `api/trash/route.ts` | action: trash(휴지통으로) / restore(되살리기) / purge(완전 삭제) / empty(휴지통 비우기) | GET, POST |
| `api/trends/route.ts` | ?c=카테고리ID&refresh=1 · ?scraps=1 | GET, POST |
| `api/videos/[id]/file/route.ts` | 영상·썸네일 파일: Supabase 저장소면 1시간짜리 서명 주소로 보냄, DB 보관이면 직접 전송 (구간 재생 지원) | GET |
| `api/videos/[id]/route.ts` | action: edit (편집본 만들기) | GET, POST, DELETE |
| `api/videos/route.ts` | 링크 넣기 → 받기 시작 | GET, POST |
| `blogs/[id]/page.tsx` |  | dynamic |
| `blogs/page.tsx` |  | dynamic |
| `carousels/NewCarousel.tsx` |  |  |
| `carousels/[id]/CarouselEditor.tsx` |  |  |
| `carousels/[id]/page.tsx` |  | dynamic |
| `carousels/page.tsx` |  | dynamic |
| `carousels/render.ts` | 글자 너비에 맞춰 줄바꿈 (띄어쓰기 우선, 긴 단어는 글자 단위) | W, H, FONT, renderSlide, canvasBlob |
| `diagnose/DiagnoseView.tsx` | 네이버 홈피드(홈판) 체크포인트 — 네이버 공식 기준이 아니라 운영자들 사이에서 공통으로 말하는 요소 |  |
| `diagnose/page.tsx` |  | dynamic |
| `hot/HotReport.tsx` |  |  |
| `hot/page.tsx` |  | dynamic |
| `layout.tsx` | 발행 대기(검수까지 끝난) 글 수 | dynamic, metadata, viewport |
| `login/page.tsx` |  |  |
| `manifest.ts` | 휴대폰 '홈 화면에 추가' 시 앱처럼 실행 |  |
| `new/KeywordStep.tsx` |  |  |
| `new/page.tsx` |  | dynamic |
| `not-found.tsx` |  |  |
| `page.tsx` |  | dynamic |
| `posts/AutoRefresh.tsx` | AI 작업 중일 때 목록을 주기적으로 새로고침 |  |
| `posts/PostGroups.tsx` | 진행 현황 목록: 체크박스로 골라 휴지통으로 보내기 | PostRow |
| `posts/[id]/PostView.tsx` |  |  |
| `posts/[id]/page.tsx` |  | dynamic |
| `posts/page.tsx` |  | dynamic |
| `settings/SettingsClient.tsx` | 세부 모델 선택: 추천 목록(가격 표시) + 불러온 모델 + 직접 입력 |  |
| `settings/page.tsx` |  | dynamic |
| `studio/NewStudio.tsx` |  |  |
| `studio/[id]/StudioEditor.tsx` |  |  |
| `studio/[id]/page.tsx` |  | dynamic |
| `studio/page.tsx` |  | dynamic |
| `trash/TrashList.tsx` |  | TrashRow |
| `trash/page.tsx` |  | dynamic |
| `trends/TrendGrid.tsx` | 영상 제목 → 키워드 추천 방향 (해시태그·괄호·특수문자 정리) | TrendCardVideo |
| `trends/page.tsx` |  | dynamic |
| `videos/VideoFactory.tsx` |  | dur, mb |
| `videos/[id]/VideoEditor.tsx` | 영상 위에 끌어서 옮기고, 오른쪽 아래 모서리로 크기를 바꾸는 상자 |  |
| `videos/[id]/page.tsx` |  | dynamic |
| `videos/page.tsx` |  | dynamic |

## src/components

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `BackButton.tsx` | 상세 화면 왼쪽 위 '뒤로' 버튼 — 항상 해당 목록 화면으로 돌아감 |  |
| `BlogForm.tsx` |  |  |
| `DocEditor.tsx` |  | EditorDoc |
| `Nav.tsx` |  |  |
| `StyleSamples.tsx` |  |  |
| `client-utils.tsx` | AI 선택기 (다른 AI로 재실행/재검수) | PROVIDERS, api, htmlToText, Diff, Modal, useToast, AiPicker |
| `ui.tsx` | 원화 환산 기준 환율 | fmtDate, KRW_PER_USD, REVENUE_KRW_PER_USD, fmtUsd, BlogTag, Steps |

## scripts

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `codemap.mjs` | 코드 지도(CODEMAP.md) 자동 생성: 폴더·파일마다 맨 위 설명 주석 한 줄 + 내보내는 함수 이름 |  |
| `migrate-pglite-to-postgres.mjs` | 맥의 내장 DB(PGlite) → Supabase/PostgreSQL 로 데이터 옮기기 (한 번만 실행) |  |
| `setup-bin.mjs` | 영상공장용 yt-dlp 실행 파일을 bin/ 에 받아 둠 (맥·리눅스 각각). 이미 있으면 건너뜀. 실패해도 빌드는 계속. |  |

## tests

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `ai-providers.test.mjs` | 담당 AI가 대체되어도(ChatGPT→Gemini 등) 해당 단계 요청의 사용자 프롬프트를 찾음 |  |
| `mock-ai-server.mjs` | 개발·테스트용 모의 AI 서버: OpenAI / Anthropic / Google 공식 API의 요청·응답 형식을 흉내 냅니다. |  |
| `run-isolated.sh` |  |  |
| `workflow.test.mjs` | 통합 테스트 (AI 미연결 상태): 7단계 흐름이 끊기지 않고, 데이터를 지어내지 않는지 확인 |  |
