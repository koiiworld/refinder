# 인수인계 (HANDOFF) — AI 콘텐츠 오피스

다른 AI 코딩 도구(Codex 등)가 이어서 작업할 때 **가장 먼저 읽을 문서**입니다. 기준 날짜: 2026-11-06. **파일 찾기는 `CODEMAP.md`(자동 생성: `node scripts/codemap.mjs`)를 먼저 보세요.**

### Claude 작업 (2026-11-10)
- 사용자는 **윈도우 PC + Render 주소**로 씀. 확장 프로그램은 설정 → 🧩 → zip 내려받기(`/api/extension-zip`)로 설치. 확장 1.2.0.
- **서이추 기능 전부 삭제**(사용자 요청): `/seoichoo`, `/api/seoichoo`, `/api/ext/seoichoo`, `seoichoo.ts`, 확장의 seoichoo.*·seo-core.js·scripting 권한, 테스트. 실제 DB의 `seoichoo_jobs` 표는 건드리지 않음(스키마에서만 뺌).
- **📱 인스타 운영** `/instagram` (`ig-ops.ts`, `ig-ops-types.ts`, 표 `ig_ops`, 휴지통 접두사 `igo_`): 릴스 대본(후킹 26공식·점수·초 단위 구성) · 댓글 답글(6분류) · 프로필 점수(12항목 100점, 합계는 코드가 계산) · 주간 계획 · 잘 된 영상(계정 중앙값 대비 배수는 코드 계산, 3배↑만 AI). '내 말투'는 settings key `ig_voice`. 담당 AI는 carousel 단계. 출처: instagram-agent-skill(MIT). 맥 `~/.claude/skills/ig-*`에도 원본 스킬 13개 설치.
- **해시태그 입력**: `components/HashtagInput.tsx` + `lib/caption-styles.ts`(formatHashtags/hashtagTokens). 스페이스·쉼표·엔터·붙여넣기 → 자동 `#`. 블로그 글·캐러셀·캐러셀 AI 새 안 모두 사용. 새 해시태그 칸을 만들면 이걸 쓸 것.
- **캐러셀**: 채널 변환 '캐러셀로 만들기'는 카드 문구까지만(캡션·해시태그 비움). 캡션은 스타일 선택(CAPTION_STYLES) 후 사용자가 버튼으로 생성. 사진 ✕ 지우기 → `style.removedImages`(30일) → 되살리기, 카드 사진 번호 자동 당김(`removeImage`/`restoreImage`). 새 캐러셀 화면: 이미 만든 글도 순위에 '✅ 열기'로 남김, 검색칸(로컬 필터 + `/api/carousels/sources/search` 예전 글). 검색 로직 공용 `lib/blog-post-search.ts`.
- **🎞 모션 캐러셀** (`carousels/MotionPanel.tsx`, `motion-video.ts`, `render.ts`의 `renderMotionFrame`): 브라우저에서 카드별 MP4(WebCodecs H.264 + `mp4-muxer`, 1080×1350·30fps, 3/5/7초). 사진은 카드 안에서 확대/축소/좌우 이동, 글자는 제목→본문 순서로 떠오름. 서버·맥·AI 비용 없음. 미지원 브라우저는 MediaRecorder.
- **🎬 카드 AI 영상** (`carousel-video.ts`, `carousel-video-types.ts`, `CardVideoBox.tsx`): 카드 사진 → Higgsfield Wan 2.6(5초·720p·약 $0.5, 비용 확인 후). `slide.video`(jobId·url·status) 저장, saveCarousel은 서버 쪽 video 상태를 jobId로 유지. 영상은 `/api/carousels/:id/video/:jobId`(같은 출처 프록시)로 모션 내보내기 배경에 씀. Higgsfield 결과 주소는 만료될 수 있음(만료 시 '영상 빼기' 후 재생성). 모션 글자 움직임은 기본 '고정'.
- 캘린더 목록: 완료한 할 일은 아래 '✅ 완료' 칸(회색·가운데 줄), ↺ 되돌리기 = PUT /api/todos/:id {done:false}.
- 캐러셀 사진은 `?k=사진주소해시`로 불러옴(번호로 캐시하면 지운 뒤 옛 사진이 보이는 버그가 있었음). 블로그에서 지워진 사진(404)은 '⚠️ 블로그에서 지워진 사진'으로 표시.
- Render 배포 확인: `/api/health`의 `version`(RENDER_GIT_COMMIT 앞 7자리). Render 무료 빌드가 가끔 16분쯤 진행하다 실패함 → 새 커밋을 올리면 자동 재배포.
- 맥 앱 지킴이: `~/Library/LaunchAgents/com.contentoffice.watchdog.plist`(1분마다 `~/.ai-content-office/watchdog.sh`, 포트 3000이 꺼져 있으면 `npm start`). `restart-app.sh`는 `~/.ai-content-office/restarting` 잠금 파일로 지킴이와 겹치지 않음.
- ⚠️ 맥 재시작 빌드가 `.next/types`(옛 페이지 참조) 때문에 실패할 수 있음 → 페이지를 지운 뒤엔 `rm -rf .next/types` 후 재시작.
- 글 편집기 본문은 높이 조절 가능한 스크롤 칸(`.editor-body`, localStorage `editor-body-height`).
- 테스트: 격리 2 + 10 + 86 통과. ⚠️ UI 확인용 서버를 /tmp/co-test에서 띄웠으면 반드시 끄고 테스트(같은 PGlite 파일을 잡아 DB가 깨짐).

## ★ 지금 바로 이어서 (2026-11-07 밤, Claude 마지막 상태)

### 캐러셀 검색 확장·목록 복원·조회수 정렬 (2026-11-10 한국 시간)
- 검색 아래 최근 글 목록을 항상 표시(선택된 글 ✓), 원본 최근 RSS 요청 한도15→50. 검색어 입력은 로컬 필터, ‘예전 글도 검색’은 기존 네이버 검색 API로 공개 색인 글 검색. 본 캐러셀에 연결된 소유 블로그의 실제 글 URL만 허용, 다른 계정/위장 도메인 제외. 100개 단위 더보기(검색 API 최대 start1000), 직접 URL 입력 유지. 전체 비공개/미색인 글 검색을 보장하지 않음. AI 추가 호출 없음, 새 키 발급 없음.
- 사용자가 ‘진단에서 사용한 조회수’를 요청. 진단은 공개 조회수가 아니라 view_captures 최근7개 일간 기록을 합산함을 확인. captured-post-views.ts로 동일 집계를 진단·캐러셀에 공유, 블로그별 분리·기간/기록 개수 표시. 일치하는 제목에 실제 합계만 연결, 잘린 제목은 충분히 길고 유일할 때만 매칭. 숫자 없는 글은 기록 없음으로 분리, 공감·댓글 보조 정렬. 누적 공개조회수와 기간 합계를 섞지 않음. 검증: 격리10+82, 단위4 통과(총96). Chromium으로 RSS 밖 예전 글 검색·하단 목록 유지·선택URL 사진가져오기·375px 입력창·캡처 합계1000/50 정렬/기간/기록없음 분리 확인. 운영 DB·실제 유료 AI 호출 없음.

### 캐러셀 사진 원본 검색 (2026-11-10 한국 시간)
- 편집기의 사진 가져오기 드롭다운을 ‘블로그 글 검색하기’로 교체. 불러온 최근 글 목록의 제목/블로그명에서 공백 구분 단어를 모두 포함하는 검색, 유니코드·대소문자 정규화, 결과 수·빈 결과·현재 선택 표시. 결과 선택은 URL만 바꾸고, 사진 수집은 기존 버튼으로 명시 실행. 직접 URL 입력은 항상 제공. 서버 전체 글 검색/AI 호출을 추가하지 않음. 최종 격리 테스트 93개 통과, Chromium으로 제목·블로그명 검색/빈 결과/선택 URL/명시적 사진 가져오기 요청/375px 입력창 확인(외부는 모의 응답).

### 서이추 확장 1.1.1 수정 (2026-11-09)
- 사용자 실사용 오류 `No tab with id` 확인: 실행창 전역 tabId가 사용자가 닫은 네이버 탭을 계속 참조. 다음 open에서 탭 존재 확인, get/update 사이 닫힘도 화면 열기만 새 탭으로 복구. 로드 대기/스크립트 실행 중 닫힘은 ID 초기화·한국어 안내·중단. 신청 클릭 재시도 없음, 전송 직전 중복 방지 기록 보존.
- 확장 버전 1.1.1. 기존 설치는 웹에서 ZIP을 새로 받아 기존 확장 파일을 교체→chrome://extensions 새로고침→기존 실행창을 닫고 새 실행창 열기 필요(웹 배포만으로 이미 설치된 확장 JS는 바뀌지 않음).
- 모의 Chrome API로 이전 탭 삭제, get/update 사이 삭제, 전송 단계 탭 삭제/다음 작업 중복 제외 회귀 검증 통과. 실제 네이버 계정 전송 테스트는 수행하지 않음.

### Codex 추가 작업 (2026-11-09 · 서이추 웹앱)
- 사용자가 exe의 반복 로그아웃 때문에 웹앱+크롬 확장 프로그램 방식을 선택. Python PC 연결 시안은 사용하지 않음. `/seoichoo`를 블로그 관리 하위 메뉴에 추가.
- 웹에서 블로그별 후보 검색 요청, 전체 선택(최대20)/해제, 문구·대상 확인 후 신청 요청, 중지·작업 기록·한국 시간 제공. 네이버 자료 URL은 확장 프로그램이 현재 크롬에서 열고 사용자 확인 뒤 본문을 보내며, 웹에서 확인/복사 가능. 실제 크리에이터 어드바이저 판독 성공을 보장하지 않음.
- 확장 프로그램 1.1.0: 기존 앱 연결 코드 재사용, `scripting` 권한 추가. 팝업 ‘서이추 실행창’에서 명시적으로 대기 작업 수신. 평소 크롬 세션 사용(로그인/로그아웃·쿠키 조작 없음). 내 블로그 확인·선택 블로그 주소와 계정 대조, 신청 전 대상·문구 재확인. 30~120초/회차20/하루100 유지. 다른 도구로 오늘 보낸 수는 시작 전 입력. 확장 프로그램 기록은 exe 기록과 별개.
- 전송 직전 확장 local storage에 중복 방지 기록. 결과 불명·보호 화면·연결 실패 시 추가 전송 중단. 결과 업로드 실패는 결과만 보관·재전송, 신청 자동 재시도 없음. 서버 작업 claim은 원자적, 활성 작업 유일 인덱스. 미확인 실행은 사용자가 실제 확인 후 마감, 자동 재할당 없음. heartbeat로 부분 결과·취소 반영.
- 검증: 최종 격리 테스트 10+80 및 확장 단위 테스트2 통과(총92, 기존 루틴 테스트1은 자정 근처 조건으로 건너뜀). 실제 Chromium 모의 폼 2명 연속완료·미전송 준비·문구변경/읽기전용/다른URL 차단 확인. 웹 UI 검색결과·전체선택/해제·신청확인/취소·375px 메뉴 확인. 클라우드 Chromium 정책 `Loading of unpacked extensions is disabled by the administrator`로 실제 확장 로드 자체는 차단됨. 우회하지 않음. 컨트롤러 Chrome API를 모의해 승인/전송1회/중복/계정불일치/오프라인결과보존 검증. 실제 네이버 계정 신청은 이 환경에서 검증하지 않음.

### Codex 추가 작업 (2026-11-08)
- 캐러셀 새 제작 원본 선택 오른쪽에 “블로그 글 업데이트” 버튼 추가. 선택 블로그 RSS의 6시간 메모리 캐시를 우회해 다시 읽은 뒤 목록 서버 갱신, 공개 목록 확인 수·한국 시간 표시. 실패하면 기존 캐시/목록 유지·실패 안내. AI 호출 없음.
- 핫이슈 리포트 “이걸로 쓰기”를 “이 주제 선택”으로 변경. 승인 API/자동 제목 생성은 유지하고 화면 이동 없이 해당 카드만 승인 상태·글 보러 가기 링크로 갱신. 여러 주제 연속 선택 가능, 선택 처리 후 busy 해제. 블로그 전환 시 이전 응답/키워드/알림이 섞이지 않게 정리.
- 캐러셀 카드 클릭 시 native dialog로 확대 미리보기. 현재 미저장 문구·사진·디자인을 동일 renderSlide로 표시. 이전/다음·좌우 화살표·닫기/배경/Esc, 모달 초점 보호·배경 스크롤 잠금. AI 호출 없음, 다운로드용 원본 canvas 참조는 별도로 보존.
- 캐러셀 캡션·해시태그 영역에 의견 입력 + “AI에게 다시 요청하기”, 각 카드에 의견 입력 + 개별 문구 재생성 추가. 현재 미저장 카드 내용과 수정 의견을 AI에 전달, 실제 주제/검색어에 맞는 3~5개 태그 지시(검색량·순위 측정 주장 없음). 비용 확인 후 1회 호출(재시도/대체 없음), 미리보기 확인·수정→해당 부분만 적용→기존 저장 버튼. 사진/다른 카드 보존. 미리보기 이후 원본 카드가 바뀌면 오래된 제안 적용을 막음.
- 캐러셀/음식 모드 검증: 격리 테스트 10 + 77 통과, 음식 예시 입력 안내 변경 후 최종 빌드 통과. Playwright로 채널 변환 실제 버튼→문구가 들어 있는 7장 캐러셀 편집기/새로고침 유지, 새 영상 음식 모드 기본 선택·실사 고정·캐릭터 단계 없음·장면 이미지 즉시 시작 가능 확인. 모의 AI로 이미지/영상 요청의 food-only·사람/손 제외와 캐러셀 연결 시 추가 AI 호출 없음 검증. 운영 DB·실제 유료 생성은 사용하지 않음.
- 채널 변환 “캐러셀로 만들기”는 목록 링크 대신 저장된 cards 문구를 장별 슬라이드로 파싱해 편집기 /carousels/[id]로 직접 이동. 추가 AI/원문 재수집 없이 문구 보존, 문구 버전별 동일 ID로 재클릭 시 기존 편집본 재사용. 글 직접 붙여넣기·앱 글·URL 원본 모두 연결.
- 영상 스튜디오 음식 클로즈업 모드 추가(새 화면 기본 선택, 기존 API/기존 프로젝트는 캐릭터 모드 호환). 실사 음식/조리 과정·탑뷰/매크로 기획, 캐릭터 단계 숨김/생성 요청 차단, 음식 이미지부터 진행. 이미지·영상 실제 요청에 사람/손/얼굴/캐릭터 제외, 필요하면 첫 음식 장면 이미지를 다음 장면 참고로 사용. 문구 재작성에도 모드 전달. 기존 캐릭터/시리즈 모드 유지. 실제 유료 생성은 개발 검증에서 호출하지 않음.
- 원격 변경 통합 후 최종 빌드·격리 테스트 10 + 75 모두 통과. 공통 규칙/영상 재작성과 기존 확장 프로그램·직접 작성·수동 검수·이미지 기획 경로를 함께 검증.
- 배포 직전 원격 8개 커밋(이미지 기획·수동 검수/직접 작성·옆 창·크롬 확장 등)을 함께 통합. 공통 규칙을 새 이미지 기획과 ChatGPT/제미나이 옆 창 복사 내용에도 연결. 통합 상태로 전체 테스트 재실행.
- 공통 규칙/영상 재작성 검증: 빌드·격리 테스트 10 + 72 통과. 대상/플랫폼/분야별 AI 맥락 분리, 새 블로그 상속, 개별 설정 보존, 이미지 실제 요청에 규칙 포함, 영상 재작성 확인 필수·프로젝트/미디어 생성 없음 확인. Playwright로 공통 규칙 저장/새로고침/수정/사용 끄기/상속 표시/320px 너비, 영상 비용 확인 취소·승인/미리보기/적용/되돌리기 확인. 실제 외부 유료 호출·운영 DB 수정 없음.
- 영상 제작 스튜디오 새 영상 입력에 문구·구성 다시 생성 추가. 수정 요청 + 기존 내용으로 studio 담당 AI 1회(자동 재시도/대체 없음), 모델/달러·원화 추정 비용 확인 후 실행. 새 안 미리보기→명시 적용/닫기/이전 입력 되돌리기. 이 단계는 프로젝트/이미지/영상 생성·기존 자료 변경 없음. 실제 기획 시작은 기존 버튼으로 별도 실행.
- 블로그 관리 설명 아래 공통 규칙 관리 추가: 규칙/금지 사항, 키워드·제목·본문·이미지·검수 분야 필터, 전체(새 블로그 포함)/플랫폼/선택 블로그 대상. blog_common_rules에 별도 보관하고 getBlog에서 적용 중인 규칙을 동적으로 상속(개별 설정 덮어쓰기 없음). 블로그 설정/제목 설정에서 공통 적용 사항 표시, 중앙 수정·사용 끄기 지원. 프롬프트는 분야별 공통 규칙만 전달, 검수는 해당 제목/본문/이미지 규칙도 점검. 제목 금지 검사·이미지 실제 생성 프롬프트에도 연결. 기존 글 변경/자동 AI 호출 없음.
- 제목 아이디어 적용/트렌드 정리 검증: 빌드·격리 테스트 10 + 70 통과. 검색어 숫자 보존·변동 표시 제거, 모의 OCR에 노이즈가 있어도 응답 정리, 선택 제목 그대로 대기 글 생성/동시 재클릭 재사용/다른 블로그·제목 불일치 거절/추가 AI 요청 없음 확인. Playwright로 실제 버튼→글 이동→선택 제목·재접속 유지 확인. 외부는 모의 서버, 운영 DB·유료 호출 없음.
- 인기 글 분석의 제목 아이디어에 “이 제목으로 새 글 시작” 추가. 저장된 분석 스냅샷·블로그·제목 번호/문구 검증 후 선택 제목 그대로 ③ 단계 대기 글 생성. 본문 자동 작성·추가 제목 AI 호출 없음. 기획 메모에 작성 팁/원본 링크(구성 참고용) 연결. 같은 분석/제목 재클릭은 동일 글 재사용. 새 분석의 제목 아이디어에도 저장된 금지 표현 적용.
- 유입 트렌드 캡처: AI 지시에서 오른쪽 변동 열(NEW/new/신규·화살표·숫자·유지 표시) 제외. 판독 응답·직접 붙여넣기 저장·기존 기록 조회에 공통 cleanCreatorKeyword 적용. 검색어 자체의 3분/1인분/2026년/아이폰17/NEW YORK 등은 보존. 기존 DB 기록은 변경하지 않고 조회/추천에서 정리. 별도 AI 재호출 없음.
- 크리에이터 분리 검증: 빌드·격리 테스트 10 + 70 통과. 모의 AI 요청에서 요리/테크 자료가 상대 블로그에 전달되지 않음 확인. Playwright로 A/B 초안 유지·OCR 대기 중 블로그 전환해도 원래 블로그에만 반영·각 블로그 저장 목록 확인. 별도 DB·모의 판독 사용, 실제 유료 호출/운영 데이터 변경 없음.
- 크리에이터 어드바이저 블로그별 분리: 입력창·OCR 결과·저장 목록을 블로그별 컴포넌트로 유지해 전환 중 섞임 방지(화면 내 미저장 초안 유지). 소유 블로그 이름 표시. 서버 조회와 추천 맥락은 blog_id 정확히 일치한 자료만 사용, 이전 NULL 공용 자료는 보존하되 추천에서 제외. 블로그 미지정/없는 블로그 저장·OCR 차단. 키워드 목록의 늦게 도착한 타 블로그 응답 표시도 방지.
- 제목 규칙 검증: 빌드·격리 테스트 10 + 69 통과(블로그별 저장/분리, 잘못된 입력 거절, 금지 기호 정리·단어 후보 제외·추천 재계산, 수정 후 재생성, 직접 입력 제목의 검수 지적). Playwright로 블로그 설정 저장/새로고침·키워드 단계에서 동일 설정 편집·320px 입력칸 너비 확인. 키워드 화면 기존 다른 컨트롤의 가로 넘침은 별도 기존 이슈. 실제 유료 호출·운영 DB 수정 없음.
- 제목 규칙 직접 설정: blogs.title_rules/title_forbidden(JSONB), 블로그 설정·키워드 단계·글 상세 제목 단계에서 편집/영구 저장. 기본 |/｜ 금지. blogContext로 제목 생성·수정·검수에 전달. AI 후보의 금지 기호는 공백 정리, 금지 단어 포함 후보 제외/추천 번호 재계산, 전부 제외되면 자동 재호출 없이 중단. 사용자가 직접 입력한 제목은 보존하되 검수 시 금지 문자 포함을 앱에서도 rule issue로 기록(SEO 점수·검색 순위 감점 단정 없음). 자연어 규칙은 AI 생성/검수 지시로 적용, 완전한 자동 판정 아님. 기존 제목 자동 변경 없음.
- 바로가기 전환/트렌드 시간 검증: 빌드·격리 테스트 10 + 68 통과. Playwright로 학습지 카드/분야 링크 제거, 계정 저장·수정·원본 새 창 링크, 게시물 본문 직접 저장, 320px 화면, 우측 핫이슈 버튼 제거, 상단 한국 시간·캐시 표시 시각 유지·탭별 30분/6시간 안내 확인. 외부 API 모의, 실제 유료 호출·운영 DB 수정 없음.
- 트렌드 뷰어: 우측 블로그 핫이슈 버튼 제거. 순위 목록 위에 실제 자료 조회 시각(`data.at`, 캐시 재사용/실패 시 이전 시각 유지)·한국 시간 표시. API 순서/주제별 시간당 조회수 정렬 및 30분/6시간 경과 후 방문 시 갱신 안내.
- **최신 변경: 트렌드 레이더는 관심 계정 바로가기**. 학습지 홈·분야 내비게이션에서 제거, 전체 메뉴에는 유지. 기존 계정 보존, 이름/주소 수정·새 창 바로가기. 주간 스케줄러 제거, 대기 중 radar_collect/radar_learn 작업은 외부/AI 호출 없이 종료, 예전 수집·학습 API 차단. 기존 수집/학습/비용 기록은 삭제하지 않음. 게시물 직접 추가는 유지하되 기타 학습지에 자료만 저장하고, 비용 확인 후 기존 수동 학습 사용. 아래 자동 학습 설명은 이전 구현 기록.
- 인스타 HTTP 429 대응 검증: 빌드·격리 테스트 10 + 69 통과(모의 429, Retry-After 초/날짜/미제공, 다른 계정·개별 글 재요청 차단, 마크다운 보충, AI 생성 호출·비용 없음). 실제 인스타 접근은 클라우드 네트워크 제한으로 검증하지 못함.
- 인스타 HTTP 429: `remote-read-limit.ts`와 `remote_read_limits`로 서버가 준 Retry-After(초/날짜)를 보존. 헤더가 없으면 1시간 대기. 레이더와 개별 게시물/이미지 읽기에 공유하고, 인스타 여러 계정·서버 재시작에도 적용. 대기 중 확인 버튼 비활성·대기 시각 표시, API에서도 재요청 차단. AI 생성 전에 실패하므로 읽기 제한만으로 AI 비용 없음. 본문/마크다운 직접 보충은 허용. 공유 IP 제한 등 인스타 측 사유를 우회하지 않으며 대기 후 성공을 보장하지 않음.
- 최신 검증: 빌드·격리 테스트 10 + 68 모두 통과. Playwright로 레이더 첫 카드, 대표 이미지 자료 생성 차단, 실제 본문 표시, 마크다운 파일 보충, 지식·조건 출력, 계정 등록/일정 수정/새 글 확인/자동 학습/예산 합계, 320px 모바일 너비와 JS 오류 없음 확인. 외부 AI·피드는 모의 서버를 사용했으며 실제 유료 호출·운영 DB 수정 없음.
- **학습 방식 수정**: 모든 분야에서 먼저 본문의 지식·도구·방법·조건·근거·적용점을 `analysis.knowledge`에 저장. 이미지/도표는 필요할 때 함께 읽음. 이전 스타일 분석만 있는 자료는 '내용 재학습 필요'로 표시. `coverage`가 확인되지 않은 기존 자료와 OG 대표 이미지만 읽힌 자료는 생성·학습 컨텍스트에 사용하지 않음. 본문/마크다운·텍스트 파일 보충과 원본 다시 읽기 제공, 이전 분석은 `previous_analysis`에 보관.
- **트렌드 레이더 `/learn/radar`**: 학습지 첫 카드. 인스타 계정·유튜브 채널·블로그/RSS/Atom 등록, 요일·한국 시간 설정, 매주 최근 5개 중 최근 7일의 새 글 확인. DB 작업 큐 `radar_collect`/`radar_learn`, 서버 시작 뒤 분당 일정 확인. 브라우저/맥 불필요, 잠든 Render는 재개 뒤 밀린 확인. 게시물 고유키로 중복 방지. 게시 날짜/본문 미확인은 자동 학습하지 않음.
- 사용자 승인 자동 학습 기본 한도 **주당 $1 (₩1,500)**. 계정은 아직 자동 등록하지 않음. Gemini 텍스트 모델만 공식 countTokens로 입력을 확인하고, 출력 최대 6,000 토큰을 포함한 앱 단가 비용을 원자적으로 예약. 성공한 호출만 예약 시점 단가와 실제 사용량으로 정산. 실패·응답 불확실은 예약금을 남기고 자동 재호출하지 않음. 다른 페이지의 수동 실행은 이 한도 밖(별도 확인). `radar_settings`, `radar_sources`, `radar_items`, `radar_weeks`, `radar_attempts` 표.
- 공개 인스타 목록이 막히면 '계정 읽기 실패', 본문이 부족하면 '자료 보충 필요'. 직접 게시물 링크 추가·마크다운 보충 가능. 유튜브는 API의 제목·설명만(영상 전체·자막 아님), RSS는 공개 본문·요약만 읽었다고 표시. 외부 유료 크롤러·로그인·쿠키 우회 없음.
- 사용자 제공 실제 사례 `https://www.instagram.com/p/Dexw2nvGXfB/`: 오픈소스 도구 6개 및 별도 비용·수익 미보장 조건을 포함한 캡션이 핵심. 이 클라우드의 Instagram 도메인 차단으로 실시간 직접 검증은 못 함. 허용 도메인 초안은 저장했으나 적용·게시 필요. 모의 공개 JSON/캡션·RSS·YouTube·토큰 API와 사용자 제공 내용으로 격리 검증.
- 모바일 내비게이션: 하단 4개 바로가기 + 전체 메뉴, 상단 메뉴 버튼. 오른쪽 슬라이딩 전체 메뉴는 PC와 같은 그룹·모든 켜진 기능·대시보드·휴지통을 제공. 과제물도 독립 메뉴에 추가. 링크/닫기/바깥 터치/Escape/오른쪽 스와이프로 닫기, 초점 보호·배경 스크롤 잠금·PC 너비 전환 시 자동 닫기. 격리 테스트 10 + 65 통과, Playwright로 전체 메뉴 일치·320px 너비·스와이프/바깥 터치/Escape·이동/PC 전환 닫기 검증.
- **AI 학습지 `/learn`**: 후킹 문구·이미지 생성·디자인·블로그·기타(`/learn/[category]`), **과제물 `/learn/tasks`**. 기타는 AI가 복수 분야에 배정, 사용자가 수정 가능.
- 링크 수집: 공개 인스타 게시물/릴스의 정지 이미지, 핀터레스트 핀·pin.it, 네이버/티스토리 본문. 로그인 우회 없음. 막히면 PNG/JPG/WEBP 캡처(최대 6장, 장당 4MB). 읽힌 이미지 수를 표시하며 전체 게시물·인기도·최신 유행을 봤다고 주장하지 않음.
- 자료 가져오기는 AI 호출 없음 → 예상 비용(달러/원화)을 보고 학습 버튼으로 분석. 설정의 **릴스 분석 AI**를 재사용(기본 무료 Gemini 텍스트 키). 유료 AI로 자동 대체·자동 재시도 없음. 완료 자료 재클릭은 기존 결과 반환. 실제 유료 API 호출은 개발 검증에서 하지 않음.
- `ai_learning_refs`(분야·비공개 원본 이미지·원칙·좋아한 점·선호/켜기), `ai_learning_tasks`(체크·할 일/아이디어 연결) 표 추가. 자료 이미지 `/api/learn/[id]/image`는 로그인 보호. 기존 공개 이미지 API에 저장하지 않음.
- 학습 원칙은 켜진 자료 중 선호·최근 자료를 분야별 최대 3개 참고. `learning-context.ts` → 캐러셀/SEO 제목/블로그 작성·검수/이미지 프롬프트. 원문 수치·고유 문구는 다른 콘텐츠의 근거로 복사하지 않음. 현재 요청·블로그 설정 우선.
- 캐러셀 편집기: 학습한 디자인의 실제 배색·여백·글자 강약·배치(editorial/split/poster)를 캔버스에 반영. 기존/학습/변형 3시안 비교는 AI 호출 없음, 선택 후 저장. 기존 틀로 돌아갈 땐 `design:null`로 해제.
- 후킹: 과장·공포·근거 없는 수치 금지 프롬프트, 대표 과장 표현/원문에 없는 숫자 후보 제외. 완전한 사실 검증기는 아니므로 최종 문구를 확인할 것.
- 과제는 같은 학습 호출에서 제안. 필수 점검/더 공부/설정/방향. 선택해서 오늘 할 일·아이디어로 보내며 중복 생성 방지. 실제 키·결제·삭제·알림은 실행하지 않음. 과제 체크와 할 일 완료는 별개.
- 격리 테스트를 Linux/macOS 공용으로 수정: 복사 시 node_modules 심볼릭 링크 보존(절대 경로가 되면 React가 중복 로드됨), 실제 키·DB 제외, 각 테스트의 실패 종료 상태 보존. 로컬 비전 모델은 명시적 모의 프로세스(`tests/fake-visual-tool.cjs`)로 파일 변환/큐 통합 검증, 실제 모델 품질 검증과 구분. Remotion·MarkItDown은 실제 도구 사용. 실제 비전 도구로도 실행하려면 `AI_TOOLS_PYTHON`, `ESRGAN_BIN`, `RIFE_BIN` 지정.
- Linux 테스트의 선택 환경: `REMOTION_RUNTIME`(@remotion/bundler·renderer 4.0.538), `REMOTION_BROWSER`(Chromium 경로), `MARKITDOWN_BIN`. 맥 기본 경로는 유지. 실제 맥 프로세스 재시작은 클라우드에서 할 수 없음.
- 검증: 빌드·격리 테스트 10 + 64 통과. Playwright로 다섯 분야·캡처 저장·과제 체크/이동·디자인 미리보기/저장/복귀·390px 모바일 너비 확인. API/로컬 AI 모의, Remotion/MarkItDown 실제. Render 완료 확인은 클라우드 네트워크의 onrender.com 차단으로 미확인(허용 초안 추가).
- **앱 내 ChatGPT chat/work 기능은 아직 미구현**: 사용자와 모델·비용 범위를 먼저 정해야 함.


- 저장소: `https://github.com/koiiworld/refinder` · 브랜치 **`feature/ai-content-office`** · 앱 폴더 **`/Users/minemone/project/refinder/content-office`** (이 맥 폴더가 기준)
- 배포: 이 브랜치에 push 하면 **Render 자동 배포**. 맥 앱 재시작: `osascript -e 'tell application "Terminal" to do script "zsh ~/.ai-content-office/restart-app.sh"'`
- 사용자 허락: **사용자가 요청한 변경은 테스트 통과 후 바로 배포(push)해도 됨.** 키·외부 결제·운영 데이터 삭제는 물어볼 것.
- 테스트: `bash tests/run-isolated.sh` (5~10분, /tmp/co-test 에 복사해 모의 AI로 돌림, 실제 DB 안 건드림). 마지막 통과: 10 + 60.
- **사용자 규칙(11-08): 글을 처음 쓴 뒤 검수를 자동으로 하지 않는다.** ④ 글 작성이 끝나면 `stage=reviewing, status=waiting`("확인·수정 후 검수 시작 대기")로 멈추고, 사용자가 ⑥의 "🔍 검수 시작"(= `rerun review`)을 눌러야 검수. (`jobs.ts` write 핸들러) 테스트의 `waitPost` 는 이 상태를 보면 검수 시작을 대신 눌러 줌.
- 글 이미지는 눌러서 크게 보기(`PostView.tsx` `ZoomImg`).
- **이미지 연결성(11-08)**: 글 작성 직후 `src/lib/image-plan.ts` `planImages` 가 ① 글 전체 컨셉 ② 레시피 재료(분량)·순서 ③ 이미지마다 장면+같은 컨셉 문단+꼭 보일 것/넣지 말 것 으로 프롬프트를 다시 만듦(`extras.imageConcept`, `images[].shows`). ⑤ 화면 "🎨 컨셉 다시 잡기"(`replan_images`). 2번째 이미지부터 1번 이미지를 레퍼런스로 자동 첨부(`matchFirst`, `image_match_first`). Gemini 이미지 모델 이름에 나노바나나 표기(Pro=3 Pro Image, 2=3.1 Flash Image, 원조=2.5 Flash Image).
- **ChatGPT·제미나이 (11-08 결정)**: 사용자는 *내 계정 로그인·대화 기록 그대로*를 원함. chatgpt.com·gemini.google.com 은 iframe 금지(구글은 로그인도 막음)라 앱 안에 못 넣음 → **옆 창 열기 + 복사·붙여넣기** 방식으로 확정(`AiSideOpen.tsx`: 열 때 글/컨셉·재료를 클립보드에 복사). API 키로 만든 앱 안 대화창은 사용자가 원하지 않아 되돌림(배포 안 함). 크롬 확장·맥 데스크톱 앱 방식은 보류.
- **🧩 크롬 확장 프로그램 (11-08)**: `content-office/chrome-extension/` (MV3, 압축해제 로드). ChatGPT·제미나이 답변 위 떠 있는 버튼(📥 글 보내기·🖼 사진 보내기), 드래그 선택 보내기, 오른쪽 클릭 메뉴. 아이콘 팝업에서 앱 주소·연결 코드·보낼 글 선택. 앱 쪽: `/api/ext/posts`·`/api/ext/inbox`(proxy.ts 에서 `x-co-ext` 헤더 = `extCode(APP_PASSWORD)` 확인), `src/lib/inbox.ts`(HTML 정리 `cleanChatHtml`, 사진은 앱 이미지로), 글 화면 `InboxPanel`(④ 커서 위치에 넣기/선택 바꾸기 — `co-editor-insert` 이벤트, ⑤ N번 자리에 쓰기), 설정 `ExtensionCard`(코드·설치 방법). 크롬 137+ 은 명령어로 확장 로드가 안 돼 자동 UI 시험은 못 함(background 는 가짜 chrome API 로 시험함).
- **붙여넣기 기록**: 편집기 붙여넣기마다 `POST /api/projects/:id/paste` → 붙이기 전 원고 버전("📋 붙여넣기 전", 1분 안 연속은 한 번) + 작업 기록 이벤트. ④ 아래 "📜 작업 기록"에서 확인. 사진 파일 붙여넣기도 커서 자리에 들어가고 저장 때 앱 이미지로 보관(`inline-images.ts`).
- **검수**: 본문에 직접 넣은 사진(앱 이미지·외부 https)을 최대 8장 사진으로 첨부하고, 프롬프트에 "본문 사진 N: 바로 앞 문장"을 알려 줘서 레시피 단계·컨셉 일치를 확인.
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

## 릴스 AI 대본 (2026-11-11)
- `src/lib/reel-script.ts`: 저장된 트렌드(research_snapshots trend_tab·blog_hot3 최근 3일, study_reels 훅)만 읽어 프롬프트에 넣음 — 새로 불러오지 않음(유튜브 할당량 X)
- 단계 `reelscript` 기본 Anthropic `claude-opus-5-5` ($4/$20, 설정 단계별 AI에서 변경 가능). 예상 비용 키 `reel_script`
- API `/api/reels/script` GET(예상 비용·트렌드 수) / POST(confirm:true 필수)
- UI `src/app/reels/AiScriptBox.tsx`: 새 프로젝트 폼 + 편집기 글자 탭 대본 상자
