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
| `brand.ts` | 왼쪽 위 로고 (아이콘 글자·이름·색) — settings 'brand' | Brand, DEFAULT_BRAND, getBrand, saveBrand |
| `calendar.ts` | 📅 마케팅 달력 | CalCat, CalEvent, CAT_LABEL, krHolidays, monthEvents, addCalendarEvent, deleteCalendarEvent |
| `carousel-design-types.ts` | 캐러셀 디자인 참고함과 실제 캔버스에 적용하는 값 (브라우저·서버 공용) | DesignRecipe, DesignAnalysis, DesignReference, BASE_RECIPE, cleanRecipe, LEARN_CATEGORIES, LearnCategory, LearningAnalysis … |
| `carousel.ts` | 📱 인스타 캐러셀(카드뉴스) | Slide, CarouselImage, TypeVersion, CarouselStyle, Carousel, CONTENT_TYPES, ContentTypeId, FORMATS … |
| `convert.ts` | 📄 문서 → 마크다운 (마이크로소프트 MarkItDown, 맥에서 무료) | CONVERT_EXT, MAX_CONVERT_BYTES, Conversion, createConversion, listConversions, getConversion, runConversion |
| `coupang.ts` | 쿠팡파트너스 Open API: 이번 달 수익·클릭·주문 자동 집계 | coupangConnected, coupangAuth, syncCoupang, lastCoupangSync |
| `creator.ts` | 네이버 크리에이터 어드바이저 '유입 트렌드' — 공식 API가 없어 사용자가 화면에서 복사해 붙여 넣은 목록을 저장 | CreatorTrend, parseTrendText, saveCreatorTrend, listCreatorTrends, creatorTrendContext |
| `dashboard.ts` | 메인 대시보드 데이터 — 모두 앱 DB의 실제 기록만 사용 (지어낸 숫자 없음) | PASS_SCORE, RevenueChannel, RevenueEntry, MonthRevenue, monthKey, getRevenue, saveRevenue, saveDailyRevenue … |
| `db.ts` | 데이터베이스 어댑터 | getDb, q, q1, dbKind, newId, j |
| `diagnose.ts` | 🩺 블로그 진단 | naverBlogSearch, naverSearch, postKey, blogKey, Check, diagnoseBlog, Diagnosis, DiagnoseState … |
| `edit.ts` | 🎞 영상 편집 (캡컷형) — 편집은 화면에서(자동 저장), 무거운 일은 맥에서 | EditProject, RESOLUTIONS, listEdits, getEdit, createEdit, deleteEdit, saveEdit, startEditRender … |
| `estimate.ts` | 돈 드는 버튼을 누르기 전 보여 줄 예상 비용 (토큰 × 단가 추정) | StepEstimate, estimateSteps, postEstimates |
| `exporter.ts` | 표를 단순 마크다운 표로 변환 | htmlToMarkdown, plainText, buildPackage, packageHtmlFile, escapeHtml |
| `factcheck.ts` | ③-2 기획안 '확인 필요' 사실을 AI가 확인 (무료 Gemini + 네이버 뉴스·블로그 검색 결과) | ClaimIn, PERSONAL_RE, wantsOfficial, Verdict, verifyClaims |
| `features.ts` | 설정 > 기능 켜기·끄기 (settings 'features' = { off: ['g:insta', '/diagnose', ...] }) | getFeatureOff, saveFeatureOff |
| `health.ts` | 기능별 고장 알림: 외부 서비스에 기대는 기능이 연속으로 실패하면 대시보드 맨 위에 '점검 필요' | FEATURES, Feature, markOk, markFail, healthProblems, clearProblem |
| `hf-models.ts` | 공식 문서에서 요청 형식(스키마)을 확인한 모델 | HF_MODELS, HfModelId, HF_IMAGE_MODELS |
| `higgsfield.ts` | Higgsfield 공식 API (이미지·영상 생성 전용) — https://docs.higgsfield.ai | HF_ENV, hfConnected, HiggsfieldError, hfTest, HfSubmitResult, hfCreateReference, hfGetReference, hfEstimate … |
| `hook-rules.ts` | 후킹은 구체적인 정보 약속. 과장·공포·근거 없는 수치는 제외. | HOOK_RULES, groundedHook |
| `hot-report.ts` | 📋 블로그 글감 추천 리포트 | Issue, ReportItem, HotReport, googleTrends, createReport, lastReport, approveItem, restoreItem … |
| `ideas.ts` | 💡 아이디어 노트: 한 줄 메모 + 블로그 + 참고 링크 | Idea, listIdeasNotes, getIdea, createIdea, updateIdea, deleteIdea |
| `image-gen.ts` | ChatGPT(OpenAI Images API)·Gemini(이미지 출력) 로 바로 생성 → DB에 저장 → /api/img/<아이디> 로 공개 | ImageGenError, generateDirect, getGeneratedImage |
| `image-models.ts` | refs: 레퍼런스 이미지를 몇 장까지 받는지 (0 = 못 받음, 스타일 문구만 반영) · soul: Higgsfield Soul ID(내 캐릭터) 사용 가능 | ImageModel, IMAGE_MODELS, IMAGE_PROVIDER_NAMES, imageModel |
| `image-prompt.ts` | 🖼 이미지 프롬프트 도우미 (무료 Gemini, 이미지는 만들지 않음) | hasHangul, toEnglishPrompt, editPrompt, recommendModels |
| `image-refs.ts` | 🎨 이미지 레퍼런스 | ImageKit, Soul, MAX_REFS, saveRefImage, refFromUrl, loadRefs, publicBase, refUrl … |
| `instagram-design.ts` | 게시물 본문·캐러셀을 함께 읽음. 대표 이미지 메타데이터는 부분 수집으로 표시. | instagramPostUrl, referenceUrl, parseInstagramPost, importInstagramImages |
| `jobs.ts` | 서버 측 작업 큐 | enqueue, ensureWorker, VIDEO_JOBS, MAC_ONLY_JOBS, jobLabel |
| `keystore.ts` | 설정 화면에서 직접 넣는 API 키 | KEY_FIELDS, KeyEnv, applyStoredKeys, startKeySync, keyStatus, canSaveKeys, saveKey, removeKey |
| `keywords.ts` | 60일 안에 준비하거나 진행 중인 시즌 | KeywordPick, recommendKeywords, addUserKeyword, listPicks |
| `learning-context.ts` | 최근·선호 자료를 우선 참고. 원문의 사실을 새 글의 근거로 쓰지 않음. | learningContext |
| `learning-tasks.ts` |  | LearningTask, TASK_KINDS, listLearningTasks, learningTaskAction |
| `learning.ts` |  | categoryOf, listLearning, getLearning, LearningInput, addLearning, learningEstimate, analyzeLearning, updateLearning … |
| `media.ts` | 모델별 요청 본문 (공식 문서 스키마 기준: docs.higgsfield.ai 모델별 generate 페이지) | MediaJob, buildBody, pathFor, estimateMedia, createMediaJob, getMediaJob, listMediaJobs, refreshMediaJob … |
| `menu.ts` | 끈 기능 목록: 그룹은 'g:insta', 페이지는 '/hot' 처럼 | MenuItem, MenuGroup, MENU_TOP, MENU_GROUPS, MENU_BOTTOM, FeatureOff, isOffPath, itemOff |
| `model-catalog.ts` | 이미지 모델 단가 (USD / 100만 토큰, 각 사 가격표 2026-11 확인) — 이미지 출력 토큰이 비용 대부분 | CatalogModel, MODEL_CATALOG, IMAGE_PRICING, catalogPricing |
| `official-images.ts` | 제조사 공식 페이지에서 제품 이미지 후보 찾기 | extractImages, findOfficialImages, checkImageUrl |
| `post-bundle.ts` | 글 상세 화면 데이터. 생성 중인 이미지는 Higgsfield 에 상태를 물어 갱신 | postBundle, PostBundle |
| `posts-types.ts` | 📰 핫이슈 리포트에서 승인한 글감 (제목·글 작성에 함께 전달) | PostPlan, PostOutline, PostBrief, PostImage, PostExtras |
| `pricing-refresh.ts` | AI 단가 새로고침: 공개 가격표(LiteLLM model_prices_and_context_window.json)에서 각 모델 단가를 찾아 | NEW_DAYS, PriceUpdate, pricingUpdates, refreshPricing |
| `radar-sources.ts` |  | RadarPost, sourceAddress, radarFetch, collectRadarSource |
| `radar.ts` |  | RadarSource, RadarItem, radarWeek, nextRadarRun, radarState, saveRadarSettings, saveRadarSource, queueRadarSource … |
| `readiness.ts` | 발행 준비 판정 (서버·화면 공용) — 항상 '지금 원고' 기준 | ReadyState, READY_LABEL, Readiness, placeholderNumbers, readiness |
| `reel-study.ts` | 🔍 릴스 분석기 (맥 전용 처리, AI는 무료 Gemini) | StudyReel, StudyAnalysis, STUDY_CATEGORIES, listStudies, getStudy, addStudies, deleteStudy, setCategory … |
| `reels.ts` | ✂️ 릴스 편집기 (맥 전용 처리) | ReelProject, FONT_FILE, listReels, getReel, createReel, deleteReel, saveDoc, run … |
| `remote-read-limit.ts` | 웹사이트가 보낸 429를 존중. 같은 서버·계정들의 반복 읽기도 함께 잠시 멈춤. | remoteReadHost, RemoteReadLimited, assertRemoteReadAllowed, stopOnRemote429, remoteReadLimits |
| `repo.ts` | 말투 예시 파일(사용 중인 것)을 붙인 블로그 — AI 작업 전용 | listBlogs, getBlog, getBlogForAi, getProject, getDocument, getVersion, listVersions, listIdeas … |
| `repurpose-channels.ts` | 📣 블로그 글 → 다른 채널 (클라이언트·서버 공용) | CHANNELS, ChannelId |
| `repurpose.ts` | 📣 채널 변환: 블로그 글 하나 → 다른 채널용 초안 (원소스 멀티유즈) | RepurposeResult, RepurposeDoc, loadSource, listRepurpose, getRepurposeDoc, deleteRepurpose, repurpose |
| `research.ts` | 경쟁·참고 콘텐츠 URL에서 제목/설명을 실제로 수집 (수집일 기록) | fetchUrlMeta, naverConnected, naverTrend |
| `routines.ts` | 🔁 루틴 관리 + 텔레그램 알림 (기획안: 루틴 관리 및 텔레그램 알림 자동화) | ROUTINE_CATS, ChecklistItem, Routine, RunItem, Run, Policy, DEFAULT_POLICY, listRoutines … |
| `sample-html.ts` | 말투 예시용 HTML(블로그 글 저장 파일·편집기 HTML) → 마크다운 텍스트 | findNaverPost, fetchNaverPostHtml, importPostFromUrl, importPostWithImages, postImages, isHtmlFile, sampleHtmlToText |
| `searchad.ts` | 네이버 검색광고 API - 키워드 도구 (월간 검색량·경쟁도·연관 키워드) | naverAdConnected, signature, KeywordStat, keywordStats, cachedStats |
| `seasons.ts` | y년 m월의 n번째 요일(0=일) | SeasonTag, SeasonEvent, addDays, seasonEvents, LUNAR_YEARS, blogTags, seedsFor, KIND_LABEL |
| `seed.ts` | 기본 역할 배정: 기획=Gemini, 원고=Claude, 검수=ChatGPT, 부분수정=Claude, 글감추천=Gemini | DEFAULT_MODELS, DEFAULT_ROLES, seedIfEmpty |
| `series.ts` | 📺 시리즈 기획: 주인공·친구·주제 → N화를 한 번에 (화마다 제목·줄거리 3줄·8초 장면 프롬프트·유튜브 설명 2줄) | Episode, Series, listSeries, getSeries, createSeries, continueSeries, editEpisode, setCharacters … |
| `settings.ts` | 기본 단가 (USD / 100만 토큰). 설정에서 직접 고치면 그 값이 우선합니다. | AppSettings, DEFAULT_PRICING, getSettings, saveSettings |
| `steps.ts` | 글(프로젝트) 진행 단계 | StepKey, STEP_AI_LABEL, DEFAULT_STEP_AI, FALLBACK_MODELS, POST_STAGES, STEP_NAMES, stageLabel, stageStep |
| `studio.ts` | 🎬 영상 제작 스튜디오 (쇼츠·릴스) | StudioImage, StudioClip, StudioScene, StudioPlan, StudioCharacter, StudioOptions, StudioProject, STUDIO_STYLES … |
| `telegram.ts` | 💬 텔레그램 메시지함: 앱이 보낸 메시지(보낸 메시지함)와 봇에게 온 메시지·버튼(받은 메시지함)을 기록 | TgMessage, TG_KIND, tgBase, logTg, listTg, tgCounts, markInboxSeen, sendManual |
| `todos.ts` | ✅ 할 일 + 🔔 텔레그램 알림 | TODO_CATEGORIES, TodoCategory, categoryOf, Todo, kstToday, kstToDate, telegramConnected, listTodos … |
| `top-posts.ts` | 블로그별 인기 글 TOP 10 | ViewItem, ViewKind, ViewsBlock, ReactionTop, viewsOf, captureDays, viewsOnDay, viewsInRange … |
| `trash-snap.ts` | 🗑 휴지통 (나머지 항목용): 지울 때 그 줄(+딸린 기록)을 통째로 trash_items 에 보관하고 원래 표에서 뺌 | SNAP_KINDS, SnapKind, snapKindOf, TRASH_DAYS, snapToTrash, restoreSnaps, purgeSnaps |
| `trash.ts` | 휴지통에 30일 넘게 있던 것 자동 완전 삭제 (1시간마다) | purgeExpired, moveToTrash, restoreFromTrash, purge |
| `trends.ts` | 트렌드 뷰어 탭 | TrendTabDef, TREND_TABS, TrendVideo, TrendTabData, trendTab, TrendScrap, listScraps, addScrap … |
| `types.ts` | 이미지 방식: ai = Higgsfield로 생성, official = 제조사 공식 홈페이지 이미지 사용 | ProviderId, RoleKey, RoleAssignment, AiRoles, Blog, Source, Idea, PlanImage … |
| `usage.ts` | ai_runs.purpose → 화면에 보일 단계 이름 | ModelUsage, StepUsage, todayUsage |
| `video-store.ts` | 영상 저장소 | MAX_VIDEO_BYTES, storageKind, putFile, getFile, signedUrl, deleteFiles, dbFile |
| `videos.ts` | 🎬 영상공장 | Box, Video, EditOptions, ffmpegPath, probe, updateYtdlp, listVideos, getVideo … |
| `visits.ts` | 블로그 방문자 수 수집 (공개 정보만) | VisitSnapshot, naverBlogId, parseCounter, fetchVisits, collectVisits, visitDaily, visitSummary |
| `work.ts` | 📊 전체 작업 현황: 블로그 글·캐러셀·영상 스튜디오·영상공장을 공통 5단계로 모아 보기 | WorkType, WorkCol, WorkItem, WORK_COLS, WORK_TYPES, workItems, setPosted |
| `workflow.ts` | ② 고른 키워드(1개 또는 여러 개)로 글 1개를 만들고 ③ 제목 후보만 뽑음 — 글쓰기는 사용자가 버튼으로 시작 | WorkflowError, createPosts, startWriting, requestOutline, cleanClaims, cleanSections, saveOutlineDraft, approveOutline … |
| `youtube.ts` | YouTube Data API v3 (공식) | youtubeConnected, YT_CATEGORIES, YtVideo, searchRecent, videosByIds, trendingVideos, frequentTerms, trending … |

## src/lib/ai

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `prompts.ts` | 블로그 말투 예시 파일 → 프롬프트 블록 (토큰 비용을 위해 총 글자 수 제한) | blogContext, MAX_SAMPLE_CHARS, styleSamplesText, planPrompt, planTemplate, draftPrompt, revisePrompt, draftTemplate … |
| `providers.ts` | 공식 HTTP API 직접 호출 (SDK 미사용, 서버에서만 실행) | AiRequest, AiResponse, AiError, PROVIDER_LABELS, providerKey, isConnected, connectionStatus, callProvider … |
| `run.ts` |  | RunOptions, RunResult, resolveAssignment, runAI, extractJson, sanitizeHtml, StepRunResult, runStep |
| `step-prompts.ts` | ───────── ① 키워드 추천 ───────── | keywordsPrompt, titlesPrompt, outlinePrompt, writePrompt, hashtagsPrompt, postReviewPrompt, fixPrompt |

## src/app

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `DashboardParts.tsx` | 입력칸 숫자에 천 단위 쉼표 | TrendChart, CostDays, RevenueCard, BlogTopButton, AiBalances, TopKeywordsCard, HealthFeature, HealthButton … |
| `api/ai/edit/route.ts` | 선택한 문단만 AI 수정 — 결과는 제안으로만 반환하고, 적용은 사용자가 결정 | POST |
| `api/ai/models/route.ts` | 연결 상태 및 공식 API 기준 사용 가능한 모델 목록 | GET |
| `api/blogs/[id]/kit/route.ts` | 🎨 블로그 이미지 컨셉 키트 (레퍼런스·스타일 문구·Soul ID·켜기) | GET, PUT |
| `api/blogs/[id]/route.ts` |  | GET, PUT |
| `api/blogs/[id]/samples/[sid]/route.ts` | 사용 여부 전환 | PATCH, DELETE |
| `api/blogs/[id]/samples/route.ts` | HTML에서 뽑은 글이 이보다 짧으면 네이버 글 번호로 본문을 다시 찾아봄 | GET, POST |
| `api/blogs/route.ts` |  | GET, POST |
| `api/calendar/route.ts` | 행사 직접 추가 { title, start, end, kind: official/irregular, link, memo } · 지우기 { remove: id } | GET, POST |
| `api/carousels/[id]/img/[n]/route.ts` | 캐러셀 사진을 같은 주소로 전달 (브라우저 캔버스에 그려 저장하려면 같은 출처여야 함) | GET |
| `api/carousels/[id]/route.ts` | 장면·캡션·해시태그·디자인 저장 | GET, PUT, POST, DELETE |
| `api/carousels/ideas/route.ts` | 알고리즘 타기 쉬운 캐러셀 주제 추천 | POST |
| `api/carousels/route.ts` | 새 캐러셀: { projectId } 블로그 글에서 · { topic, niche, format, blogId } 주제로 | GET, POST |
| `api/convert/[id]/route.ts` | 결과 보기 · ?download=1 이면 .md 파일로 받기 | GET, DELETE |
| `api/convert/route.ts` | 파일 올리기 (폼 'file', 여러 개 가능) → 맥에서 마크다운으로 | GET, POST |
| `api/dashboard/balances/route.ts` | 충전 기록 추가: { provider, usd, at?, note? } · 지우기: { provider, remove: index } | GET, POST |
| `api/dashboard/health/route.ts` | 점검 알림 닫기 (고쳤다고 표시) | GET, POST |
| `api/dashboard/revenue/capture/route.ts` | 수익 화면 캡처(애드포스트 등) → AI가 화면의 수익 숫자를 읽어 돌려줌 | POST |
| `api/dashboard/revenue/coupang/route.ts` | 쿠팡파트너스 이번 달 수익 지금 불러오기 | POST |
| `api/dashboard/revenue/route.ts` | 이번 달 수익 직접 입력 (쿠팡파트너스·애드포스트·애드센스 정산 화면 숫자) | GET, PUT, POST |
| `api/dashboard/top/route.ts` | ?blogId · &day=YYYY-MM-DD (그날 일간) · &from=&to= (기간 지정 합계) | GET, POST |
| `api/dashboard/visits/route.ts` | 블로그 방문자 수 (?refresh=1 이면 지금 바로 다시 수집) | GET |
| `api/diagnose/route.ts` | 🩺 블로그 진단 시작 (서버 작업 큐에서 진행 — 화면을 떠나도 계속) | GET, POST |
| `api/edit/[id]/route.ts` | { doc, title } 저장 | GET, PUT, POST, DELETE |
| `api/edit/route.ts` | { videoIds, title } 새 편집 | GET, POST |
| `api/export/route.ts` | 전체 백업 내보내기 (API 키는 DB에 저장하지 않으므로 포함되지 않음) | GET |
| `api/health/route.ts` |  | GET |
| `api/hot/route.ts` | action: report(새 리포트) · approve(승인 → 글 만들기 시작) · skip(넘기기) | GET, POST |
| `api/ideas/[id]/route.ts` |  | GET, PUT, DELETE |
| `api/ideas/route.ts` | 아이디어 저장 (AI 호출 없음) | GET, POST |
| `api/img/[id]/route.ts` | ChatGPT·Gemini로 만든 이미지 (로그인 없이 공개 — 블로그 글에 넣어도 보이도록. 아이디는 추측하기 어려움) | GET |
| `api/keywords/route.ts` | recommend(① AI 추천) / add(직접 입력) / dismiss(목록에서 빼기) | GET, POST |
| `api/learn/[id]/image/route.ts` |  | GET |
| `api/learn/[id]/route.ts` |  | POST, PATCH |
| `api/learn/route.ts` |  | GET, POST |
| `api/learn/tasks/route.ts` |  | GET, POST |
| `api/login/route.ts` |  | POST |
| `api/media/[id]/route.ts` | 상태 조회 (진행 중이면 Higgsfield 에 물어 갱신) | GET, POST |
| `api/media/route.ts` | Higgsfield 생성 요청 (크레딧 차감) | GET, POST |
| `api/posts/[id]/route.ts` |  | GET, POST, DELETE |
| `api/posts/route.ts` | ② 선택한 키워드로 글 만들기 → ③④⑥ 자동 진행 | GET, POST |
| `api/projects/[id]/document/route.ts` | 에디터 자동 저장 (revision 으로 동시 수정 충돌 감지) | GET, PUT |
| `api/projects/[id]/export/route.ts` | ⑦ 발행용 내려받기: format=html / md / json | GET |
| `api/projects/[id]/versions/[vid]/route.ts` | 이 버전으로 되돌리기 | GET, POST |
| `api/projects/[id]/versions/route.ts` | 원고 버전 목록 (내용 미리보기는 앞부분만) | GET, POST |
| `api/radar/route.ts` |  | GET, POST |
| `api/reels/[id]/render/route.ts` | 내보내기 (맥에서 Remotion으로 만들어 영상공장에 저장) | POST |
| `api/reels/[id]/route.ts` | { doc, title? } 편집 저장 | GET, PUT, DELETE |
| `api/reels/font/route.ts` | 미리보기용 글꼴 (내보내기와 같은 Noto Sans KR) | GET |
| `api/reels/route.ts` | { videoId } 영상공장 영상으로 릴스 편집 시작 (맥이 받아쓰기로 초안) | GET, POST |
| `api/refs/route.ts` | 🎨 레퍼런스 사진 저장: 폼 'files'(최대 5장) 또는 JSON { url } (만든 이미지에서 고르기) → { ids } | POST |
| `api/repurpose/[id]/route.ts` |  | GET, DELETE |
| `api/repurpose/route.ts` | action: load {postId/url} → 글 미리보기 · make {id?, title, text, blogId, postId, url, channels} → 초안 | GET, POST |
| `api/research/benchmark/route.ts` | 인기 글 주소(최대 5개) 분석 → 내 블로그 적용 제안 | GET, POST |
| `api/research/creator/image/route.ts` | 크리에이터 어드바이저 캡처 → AI가 화면의 유입 검색어 목록을 읽어 붙여넣기 형식(한 줄에 하나)으로 돌려줌 | POST |
| `api/research/creator/route.ts` | 크리에이터 어드바이저 유입 트렌드 붙여넣기 저장 | GET, POST, DELETE |
| `api/routines/[id]/route.ts` |  | PUT, DELETE |
| `api/routines/capture/[id]/route.ts` | 루틴 캡처 (비공개: 로그인한 사람만 — /api/img 와 달리 비밀번호 확인을 거침) | GET |
| `api/routines/policy/route.ts` |  | GET, PUT |
| `api/routines/route.ts` | 새 루틴 · { action: "tick" } 지금 바로 한 번 처리 (실행 만들기·마감·발송) | GET, POST |
| `api/routines/runs/[id]/route.ts` | JSON { action: item {itemId, done} / complete / snooze } · 폼 { itemId, file } 캡처 등록 | GET, POST |
| `api/routines/runs/route.ts` | 실행 기록: ?from=&to=&status=&routine= | GET |
| `api/series/[id]/route.ts` | action: continue {count} · edit {n, request} · characters {text} · queue {ns?} | GET, POST, DELETE |
| `api/series/route.ts` | { hero, friend, theme, style, count } → N화 한 번에 | GET, POST |
| `api/settings/brand/route.ts` | { name, mark, color } 저장 · { reset: true } 기본값으로 | GET, POST |
| `api/settings/features/route.ts` | { off: ['g:insta', '/diagnose'] } — 끈 기능 전체 목록으로 저장 | GET, POST |
| `api/settings/keys/route.ts` | API 키 상태 (키 값은 돌려주지 않음, 끝 4자리만) | GET, POST |
| `api/settings/pricing/route.ts` | 단가 새로고침 (공개 가격표와 비교해 바뀐 모델만 반영) | POST |
| `api/settings/route.ts` |  | GET, PUT |
| `api/souls/route.ts` | Higgsfield Soul ID(내 캐릭터) 목록 — 학습 중이면 상태를 새로 물어봄 | GET, POST |
| `api/studio/[id]/route.ts` | 상태 (진행 중인 장면 영상은 Higgsfield에 확인해 갱신) | GET, PUT, POST, DELETE |
| `api/studio/route.ts` | ① 프롬프트로 기획 시작 | GET, POST |
| `api/study/[id]/route.ts` |  | GET, PUT, DELETE |
| `api/study/route.ts` | { urls: [...], mine } 릴스 링크 넣기 (맥에서 받아쓰기·장면 사진 → 무료 Gemini 분석) | GET, POST |
| `api/telegram/route.ts` | ?box=in/out → 메시지함 · 없으면 연결 상태 | GET, POST |
| `api/todos/[id]/route.ts` | 수정 · 완료(done: true/false) · 알림 켜기/끄기 | PUT, DELETE |
| `api/todos/route.ts` |  | GET, POST |
| `api/trash/route.ts` | action: trash(휴지통으로) / restore(되살리기) / purge(완전 삭제) / empty(휴지통 비우기) | GET, POST |
| `api/trends/route.ts` | ?c=카테고리ID&refresh=1 · ?scraps=1 | GET, POST |
| `api/videos/[id]/file/route.ts` | 영상·썸네일 파일: Supabase 저장소면 1시간짜리 서명 주소로 보냄, DB 보관이면 직접 전송 (구간 재생 지원) | GET |
| `api/videos/[id]/route.ts` | action: edit (편집본 만들기) | GET, POST, DELETE |
| `api/videos/route.ts` | 링크 넣기 → 받기 시작 | GET, POST |
| `api/videos/upload/route.ts` | 내 영상 파일 올리기 (폼 'file') → 영상공장에 저장 · 50MB 넘으면 줄여서 | POST |
| `api/work/posted/route.ts` | { type: carousel/studio/video, id, posted: true/false } — 실제로 올렸는지 직접 표시 (자동 게시 아님) | POST |
| `api/work/route.ts` |  | GET |
| `blogs/[id]/page.tsx` |  | dynamic |
| `blogs/page.tsx` |  | dynamic |
| `calendar/CalendarView.tsx` | 연간 시즌 행사는 행사마다 확실히 다른 색 (그 달에 보이는 순서대로 하나씩 → 같이 보이는 행사끼리는 안 겹침) |  |
| `calendar/page.tsx` |  | dynamic |
| `carousels/DesignPicker.tsx` |  |  |
| `carousels/NewCarousel.tsx` |  |  |
| `carousels/[id]/CarouselEditor.tsx` |  |  |
| `carousels/[id]/page.tsx` |  | dynamic |
| `carousels/page.tsx` |  | dynamic |
| `carousels/render.ts` | 글자 너비에 맞춰 줄바꿈 (띄어쓰기 우선, 긴 단어는 글자 단위) | W, H, FONT, renderSlide, canvasBlob |
| `convert/ConvertBoard.tsx` | 📄 문서 → 마크다운: 올리기 · 목록 · 결과 보기(복사·.md 받기·채널 변환으로) |  |
| `convert/page.tsx` |  | dynamic |
| `diagnose/DiagnoseView.tsx` | 네이버 홈피드(홈판) 체크포인트 — 네이버 공식 기준이 아니라 운영자들 사이에서 공통으로 말하는 요소 |  |
| `diagnose/page.tsx` |  | dynamic |
| `edit/NewEdit.tsx` | 새 편집: 영상공장 영상 여러 개 골라 순서대로 · 또는 내 영상 올리기 |  |
| `edit/[id]/CutEditor.tsx` | AI 음성 목소리 (서버 lib/edit.ts VOICES 와 같게) |  |
| `edit/[id]/page.tsx` | 이 편집에 쓴 사진도 목록에 | dynamic |
| `edit/page.tsx` |  | dynamic |
| `hot/HotReport.tsx` |  |  |
| `hot/page.tsx` |  | dynamic |
| `ideas/IdeaBoard.tsx` | 아이디어 → 할 일: 메모를 할 일 이름으로, 링크를 메모로 | todoHref, planHref, IDEA_CAT_LABEL |
| `ideas/page.tsx` |  | dynamic |
| `layout.tsx` | 발행 대기(검수까지 끝난) 글 수 | dynamic, generateMetadata, viewport |
| `learn/LearningBoard.tsx` |  |  |
| `learn/[category]/page.tsx` |  | dynamic |
| `learn/page.tsx` |  | dynamic |
| `learn/radar/RadarBoard.tsx` |  |  |
| `learn/radar/page.tsx` |  | dynamic |
| `learn/tasks/TasksBoard.tsx` |  |  |
| `learn/tasks/page.tsx` |  | dynamic |
| `login/page.tsx` |  |  |
| `manifest.ts` | 휴대폰 '홈 화면에 추가' 시 앱처럼 실행 |  |
| `new/KeywordStep.tsx` |  |  |
| `new/page.tsx` | 글 만들기는 '블로그 업로드'(/posts) 위쪽 '새 글 만들기'로 합쳐짐 — 예전 주소·링크(?blog=&hint=)는 그대로 넘김 |  |
| `not-found.tsx` |  |  |
| `page.tsx` |  | dynamic |
| `posts/AutoRefresh.tsx` | AI 작업 중일 때 목록을 주기적으로 새로고침 |  |
| `posts/PostGroups.tsx` | 진행 현황 목록: 체크박스로 골라 휴지통으로 보내기 | PostRow |
| `posts/[id]/PostView.tsx` |  |  |
| `posts/[id]/page.tsx` |  | dynamic |
| `posts/page.tsx` |  | dynamic |
| `reels/NewReel.tsx` | 새 릴스 편집: 영상공장 영상 고르기 또는 내 영상 올리기 |  |
| `reels/[id]/ReelEditor.tsx` | 문서 바꾸기 (되돌리기 기록) |  |
| `reels/[id]/ops.ts` | 시각 a 이후 자막을 d초만큼 밀기 (d<0 이면 당김) | nid, sceneAt, splitScene, deleteScene, duplicateScene, resizeScene, patchScenes, setBg … |
| `reels/[id]/page.tsx` |  | dynamic |
| `reels/page.tsx` |  | dynamic |
| `repurpose/RepurposeBoard.tsx` |  |  |
| `repurpose/page.tsx` | 내 블로그에 이미 올린 글 (RSS 최근 글) + 이 앱에서 만든 글 | dynamic |
| `routines/RoutineBoard.tsx` | 재알림 횟수만큼 시각 칸 (모자라면 앞 시각 +2시간으로 채움, 넘치면 자름) | scheduleText |
| `routines/page.tsx` |  | dynamic |
| `routines/run/[id]/RunView.tsx` |  |  |
| `routines/run/[id]/page.tsx` |  | dynamic |
| `settings/BrandCard.tsx` | 왼쪽 위 로고 아이콘·이름 바꾸기 |  |
| `settings/FeaturesCard.tsx` | 기능 켜기·끄기: 그룹 전체(예: 인스타 전체) 또는 페이지 하나(예: 블로그 진단) — 끄면 메뉴·현황에서 숨김, 데이터는 그대로 |  |
| `settings/KeysCard.tsx` | 🔑 API 키 직접 연결: 붙여 넣고 저장 → 암호화해서 저장, 맥·Render 둘 다 1분 안에 적용 |  |
| `settings/SettingsClient.tsx` | 세부 모델 선택: 추천 목록(가격 표시) + 불러온 모델 + 직접 입력 |  |
| `settings/SoulCard.tsx` | Higgsfield Soul ID(내 캐릭터): 같은 인물 사진으로 한 번 학습 → SOUL 모델에서 같은 캐릭터로 계속 생성 |  |
| `settings/page.tsx` |  | dynamic |
| `studio/NewSeries.tsx` | 📺 시리즈로 만들기: 주인공·친구·주제 → N화 한 번에 |  |
| `studio/NewStudio.tsx` |  |  |
| `studio/[id]/StudioEditor.tsx` |  |  |
| `studio/[id]/page.tsx` |  | dynamic |
| `studio/page.tsx` |  | dynamic |
| `studio/series/[id]/SeriesView.tsx` |  |  |
| `studio/series/[id]/page.tsx` |  | dynamic |
| `study/StudyBoard.tsx` |  |  |
| `study/page.tsx` |  | dynamic |
| `telegram/Mailbox.tsx` | 💬 받은 메시지함 · 보낸 메시지함 · 직접 보내기 |  |
| `telegram/NotifyCard.tsx` | 알림 설정: 텔레그램 연결 상태 · 시험 메시지 · 방해 금지 · 아침 브리핑 · 발송 기록 |  |
| `telegram/TelegramSetup.tsx` | 텔레그램 연결 도우미: 채팅 ID 찾기(메시지 안 보냄) · 시험 메시지(누를 때만) |  |
| `telegram/page.tsx` |  | dynamic |
| `todos/TodoBoard.tsx` |  |  |
| `todos/page.tsx` |  | dynamic |
| `trash/TrashList.tsx` | 30일 자동 완전 삭제까지 남은 날 | TrashRow, MediaTrashRow |
| `trash/page.tsx` |  | dynamic |
| `trends/TrendGrid.tsx` | 영상 제목 → 키워드 추천 방향 (해시태그·괄호·특수문자 정리) | TrendCardVideo |
| `trends/page.tsx` |  | dynamic |
| `videos/VideoFactory.tsx` |  | dur, mb |
| `videos/[id]/VideoEditor.tsx` | 영상 위에 끌어서 옮기고, 오른쪽 아래 모서리로 크기를 바꾸는 상자 |  |
| `videos/[id]/page.tsx` |  | dynamic |
| `videos/page.tsx` |  | dynamic |
| `work/WorkBoard.tsx` | 상세 한 줄: 지금 진행 현황처럼 단계 막대까지 |  |
| `work/page.tsx` |  | dynamic |

## src/components

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `BackButton.tsx` | 상세 화면 왼쪽 위 '뒤로' 버튼 — 항상 해당 목록 화면으로 돌아감 |  |
| `BlogForm.tsx` |  |  |
| `DocEditor.tsx` | 문서의 from~to 를 HTML 로 (표·목록·굵게 그대로) | EditorDoc |
| `FeatureGate.tsx` | 설정에서 끈 기능의 페이지로 들어오면 내용 대신 안내 (데이터는 그대로 남아 있음) |  |
| `FileToMarkdown.tsx` | 파일 올리기 → 맥에서 마크다운으로 바꿔질 때까지 기다림 | CONVERT_ACCEPT, convertFiles |
| `KitCard.tsx` | 🎨 블로그 이미지 컨셉 키트: 레퍼런스 사진 + 스타일 문구 + 내 캐릭터 → 이미지 만들 때마다 자동으로 붙음 |  |
| `Nav.tsx` |  |  |
| `PostedButton.tsx` | ✅ 게시함 표시: 인스타·유튜브에 실제로 올린 뒤 직접 누름 (앱이 대신 올리지 않음) |  |
| `RefPicker.tsx` | 🎨 레퍼런스 사진 고르기: 올리기 · 만든 이미지에서 고르기 · 빼기 (사진은 /api/refs 에 저장되고 아이디만 돌려받음) | uploadRefs, refFromUrl |
| `StyleSamples.tsx` |  |  |
| `TodayCost.tsx` | 오늘 쓴 AI 비용 (한국 시간 0시부터) — 단계별·모델별 (대시보드) |  |
| `TrashButton.tsx` | 상세 화면의 🗑 휴지통으로 버튼 → 옮긴 뒤 목록으로 |  |
| `TrashableList.tsx` | 목록 + 체크박스 → 🗑 휴지통으로 (휴지통에서 되살리기·완전 삭제) | TrashableItem |
| `client-utils.tsx` | AI 선택기 (다른 AI로 재실행/재검수) | PROVIDERS, api, htmlToText, Diff, Modal, useToast, AiPicker |
| `ui.tsx` | 원화 환산 기준 환율 | fmtDate, KRW_PER_USD, REVENUE_KRW_PER_USD, fmtUsd, BlogTag, Steps |

## scripts

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `codemap.mjs` | 코드 지도(CODEMAP.md) 자동 생성: 폴더·파일마다 맨 위 설명 주석 한 줄 + 내보내는 함수 이름 |  |
| `migrate-pglite-to-postgres.mjs` | 맥의 내장 DB(PGlite) → Supabase/PostgreSQL 로 데이터 옮기기 (한 번만 실행) |  |
| `render-reel.mjs` | 맥 전용: 릴스 편집 문서를 Remotion으로 mp4 만들기 |  |
| `setup-bin.mjs` | 영상공장용 yt-dlp 실행 파일을 bin/ 에 받아 둠 (맥·리눅스 각각). 이미 있으면 건너뜀. 실패해도 빌드는 계속. |  |

## tests

| 파일 | 설명 | 내보내는 것 |
|---|---|---|
| `ai-providers.test.mjs` | 담당 AI가 대체되어도(ChatGPT→Gemini 등) 해당 단계 요청의 사용자 프롬프트를 찾음 |  |
| `fake-ai-python.sh` |  |  |
| `fake-esrgan.sh` |  |  |
| `fake-rife.sh` |  |  |
| `mock-ai-server.mjs` | 개발·테스트용 모의 AI 서버: OpenAI / Anthropic / Google 공식 API의 요청·응답 형식을 흉내 냅니다. |  |
| `run-isolated.sh` |  |  |
| `workflow.test.mjs` | 통합 테스트 (AI 미연결 상태): 7단계 흐름이 끊기지 않고, 데이터를 지어내지 않는지 확인 |  |
