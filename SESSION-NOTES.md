# 작업 이어가기 메모 (2026-11-23 대화 요약)

새 대화에서 "SESSION-NOTES.md 읽고 이어서 해줘"라고 하면 됩니다.
브랜치: `claude/quirky-clarke-2aov2j` (koiiworld/refinder)

## 만든 것
- `carousel/` — Remotion 모션 캐러셀 (1080x1350 MP4)
  - 반품 특가 7장: 표지 → 상품 5개(공식 사진 누끼 + 가격 카드 모션) → 마무리
    - 마음에 든 부분: 가격 카드 (새 상품가 취소선 → 반품가 카운트다운 → 막대 줄어듦 → -% 배지·"○만원 아껴요")
    - 렌더: `cd carousel && ./render-all.sh` / 상품 데이터는 `src/Root.tsx`
    - 사진: `public/products/` (브랜드 공식 이미지, 커밋 안 함). mp4도 넣을 수 있음
    - 남은 것: 갤럭시 링(저해상도·색상 다름), 실크펜슬 사진 없음
  - 사진 나열형(오늘의 아이템) 템플릿: `posts/<이름>.json` → `node render-post.mjs posts/<이름>.json`
- `alerts/make-alert.mjs` — 카톡 알림방·스레드 글 자동 생성
  - `node alerts/make-alert.mjs` (미리보기) / `--links` (파트너스 링크, API 1회만) / `--mark-sent` / `--hook 0~4`
  - 스레드: 첫 줄 훅 → 둘째 줄 [광고] → 본문 → 링크는 첫 댓글

## 결정한 것
- 반품 데이터(index.html)는 10/12 기준으로 오래됨. 예전에 쿠팡을 대량 자동 조회해서 링크가 이틀 막힘 → **쿠팡 페이지 자동 크롤링은 하지 않기**
- 반품 검색 사이트(GitHub Pages)는 내림 (11/23)
- 앞으로: ① 골드박스 API(하루 1회)로 매일 특가 자동 ② 반품은 사용자가 브라우저에서 보다가 "담기"(북마클릿) — 아직 미구현
- 채널: 스레드(어그로형) + 카카오톡 "반품특가 알림방"(직접 운영, 대가성 문구 크게)
- 쿠팡 키: Mac `content-office/.env.local` (COUPANG_ACCESS_KEY/SECRET_KEY). 값 출력·커밋 금지

## 스레드 프로필 (설정 대기)
이름: 반품특가 줍줍 | REFINDER
소개:
정가 주고 사면 지는 거임
쿠팡 반품마켓에서 n십만원 싼 거 매일 털어옴 🧹
⬇️ 품절 전에 보려면 알림방 ㄱㄱ
📢 [광고] 이 계정은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.

## 스레드 게시
- ✅ 11/25 연결 완료: 메타 앱 '콘텐츠오피스'(Threads API 액세스, 테스터 koi._.world 수락) → 토큰을 맥 .env.local THREADS_ACCESS_TOKEN 에 저장. 맥 `node ~/.ai-content-office/post-threads.mjs` (--check 토큰 확인 / 미리보기 / --yes 게시). 토큰 약 60일 유효 → 만료 전 갱신 필요
- 본문 첫 줄에 #광고, 첫 댓글에 정식 대가성 문구 + 링크
- `alerts/post-threads.mjs`: 미리보기 → `--yes` 로 본문+첫 댓글 게시 (THREADS_ACCESS_TOKEN 필요, Meta 개발자 앱에서 발급)

## 텔레그램 업무 보고
- 새 봇 @upmoo3bot → 받는 사람 "Mh". 답장 = 다음 업무 지시
- 맥: 보내기 `node ~/.ai-content-office/report.mjs <파일>` · 답장 읽기 `node ~/.ai-content-office/inbox.mjs` (처리 후 `--ack`)
- 키: 맥 `content-office/.env.local` 의 REPORT_TELEGRAM_BOT_TOKEN / REPORT_TELEGRAM_CHAT_ID (출력 금지)
- **보고 규칙 (사용자 지정 11/24)**: 매번 보고 X. ① 그날 모은 데이터 ② 업무 마칠 때 ③ 스레드 게시 직전 — 이때만 보고
- 사용자가 대화를 직접 보고 있는 날은 업무 마무리 보고 생략 (11/26)
- 반품 담기: 사용자가 쿠팡 앱 '반품 상품' 화면 캡처 + 공유 링크를 @upmoo3bot 에 보냄 → inbox.mjs 가 사진을 ~/.ai-content-office/inbox/ 에 저장 → 캡처 읽어서 상품명·반품가·등급·새 상품가 추출 (북마클릿은 앱에서 안 돼서 이 방식)
- 이 세션은 예약 작업 불가(컴퓨터 연결 세션) → 사용자가 여기서 "확인"하면 텔레그램 답장 읽고 진행

## 애플 반품 메모
- 애플 반품은 신상품(브랜드 직매입) 페이지엔 안 뜨고 "Apple 정품 ○○" 같은 옛 상품 페이지에 붙음. 예전 데이터(index.html)에 애플 반품 67개 있음 (새 상품가는 전부 비어 있음)
- 체크리스트: 맥 ~/.ai-content-office/apple-check.txt (가격 큰 순 15개, 반품 탭 바로 열리는 일반 링크)

- 애플 반품: 일반 검색·상품 페이지·반품마켓 코너 어디에도 안 뜸. USED_DETAIL 링크는 '반품 매물 번호'로만 열림(신상품 번호로는 일반 페이지). 검색 필터 '상품 상태: 반품'으로 일부 뜸(신제품은 거의 없음)
- 반품파인더(refinder.xyz)는 다른 사람의 경쟁 사이트
- **운영 B안 (11/24 결정)**: 매일 08:10 텔레그램에 '반품 필터 루틴'(filter-routine.txt, 검색 5개 높은 가격순, 필터 주소: offerCondition=PACKAGE_DAMAGED,NON_ACTIVATED,REPACKAGING,REFURBISHED,RETURN) → 사용자가 2분 확인·캡처 → 1~2주 해보고 자동화(A안: 새 대화 + Claude in Chrome, 하루 2번·검색 5개·사람 속도) 검토

- ⛔ 11/24 새벽: 사용자가 사파리에서 필터 검색 링크 여러 개를 연달아 열자 쿠팡이 '요청하신 페이지의 사용권한이 없습니다'로 차단. → 루틴에서 링크 전부 제거, 앱에서 직접 필터 체크만. candidates(후보 링크)도 매일 보고에서 뺌
- 맥 디스크 여유 거의 없음(약 0.9GB)

## ✅ Render 이전 (11/26, feature/ai-content-office 89a6500 배포)
- content-office/src/lib/deals.ts + /api/deals: 매일 08:10 골드박스→업무 보고(Render에서만, 하루 1번), 답장·사진 읽기, 검색, 짧은 링크, 게시 전 점검, 스레드 게시
- 키는 앱 'API 키 직접 연결'에 저장: THREADS_ACCESS_TOKEN, REPORT_TELEGRAM_BOT_TOKEN, REPORT_TELEGRAM_CHAT_ID, DEALS_AGENT_TOKEN(맥 .env.local 에도 있음)
- 클라우드에서 호출: 헤더 x-co-agent-token. 환경 설정 > Network secrets 에 host ai-content-office-m7sx.onrender.com / header x-co-agent-token 으로 저장하면 새 세션부터 Mac 없이 사용
- 맥의 08:10 launchd(com.refinder.daily-goldbox)는 끔(파일은 ~/.ai-content-office/*.plist.off)

## 11/26 진행
- 스레드 게시: 샥즈 오픈런 프로2(골드박스, 해외구매라 정가 비교 X) DgM8dhzm0qD / 아이폰 Air 1TB 반품-미개봉 DgNF8gAGxRd
- 광고 표시는 [광고] (해시태그 #광고 쓰면 주제 태그가 '광고'가 됨), 주제 태그는 본문 끝 #러닝/#애플 같이 1개
- 댓글 자동 답글 배포(10분마다, threads_read_replies 권한 추가한 토큰)
- 클라우드 환경 Network secret 저장 완료: 새 세션은 curl https://ai-content-office-m7sx.onrender.com/api/deals 를 헤더 없이 바로 호출 가능 (Mac 불필요)
- 링크: 사용자가 쿠팡 파트너스에서 직접 딴 링크를 주면 그걸 우선 사용

## 콘셉트 (미정, 11/27)
- 사용자 지시: 콘셉트 아직 고정하지 말 것. '반품 판독기'(사도 됨/거름/조건부 판정)는 후보로 시험 중 (아이맥 판독 글 DgNd3Rnmysg)
- 같은 날 게시: 아이폰 Air 새 흐름(본글→댓글1→마지막 댓글 링크) DgNb-fKG42n

## 텔레그램 답장 자동 확인
- 예약 작업 trig_01HvZrhhj7GrY3GFGMgtEnJa: 매일 09:23~23:23(KST) 매시간 새 세션 실행. 먼저 ?action=awaiting 확인 → false 면 바로 종료 (사용자 지시 11/27: 내가 보고를 보냈을 때만 답장 확인). true 면 inbox → 처리 → ack → report. 게시는 텔레그램에서 '게시해' 받은 원고만
- 사용자 지시 11/27: 보고 뒤엔 5분 간격 확인. 예약 작업은 최소 1시간이라, 대화 중 보고를 보냈으면 그 세션에서 백그라운드로 5분마다 ?action=inbox 확인(최대 2시간, 새 메시지 오면 처리). 그 외엔 1시간 예약 작업
- threads_delete·threads_keyword_search: 대시보드엔 "테스트 준비 완료"지만 API는 "Application does not have permission"(403). 테스터 재초대·토큰 재생성해도 동일 → 메타 앱 검수(고급 액세스) 필요로 판단. 삭제는 사용자가 앱에서 직접. 아이폰 첫 버전 DgNF8gAGxRd 앱에서 삭제 요청함
- awaiting: report 보내면 24시간 켜짐(noWait:true 면 안 켬), 답장을 ack 처리하면 꺼짐
- 스레드 인기 주제 API는 KR 빈 결과(US만 나옴). keyword_search 는 403(권한/검수 필요)

## 글쓰기 플레이북
- THREADS-PLAYBOOK.md (7단계: 첫 줄 후보 10개·상황 팔기·후기형(메모 있을 때만)·본글→댓글1→마지막 댓글 링크·상품 고르기·시리즈·직전 점검)

## 글 검수 규칙 (11/26 확정, 추가 비용 없음)
1. Gemini 무료 키 (맥 ~/.ai-content-office/tone-review.mjs --passes=1): 첫 줄 훅·말투
2. ig-human (~/.claude/skills/ig-human detect.py/humanize.py): 보이지 않는 문자·대시 등 AI 흔적만 (한국어 단어 점수는 무시). ZWJ 이모지(🏃‍♂️ 등) 쓰지 말 것
3. Claude 최종: #광고 위치, 숫자·비교 대상, 한 글 안 말투·구조 통일
- 유료 API(OpenAI·Anthropic) 검수 쓰지 않기. 말투는 글마다 자유지만 한 글 안에서는 통일
- 비교는 같은 조건끼리만 (해외구매 vs 국내 정가 비교 금지). 골드박스 판매자 상품은 해외구매일 수 있음 → 로켓 우선

## 골드박스 (맥, 이전 방식) ~/.ai-content-office, 맥이 원본)
- `goldbox.mjs`: 골드박스 API 하루 1회 → goldbox-YYYYMMDD.json (가격 기록 = 이 파일들)
- `goldbox-post.mjs [--pick 1,4,7]`: 스레드 초안(threads.txt). 사실 기반 문구만: 지난 기록 대비 내림 / 기록 중 최저가 / 직접 확인한 정가(list-prices.json) 대비 -%
  - 짧은 링크: 링크 생성 API 하루 1회(일반 상품 주소로 변환해야 됨), short-links.json
- `candidates.mjs`: keywords.txt(지금: Apple 정품 아이폰 / Apple 정품 아이패드 / 애플워치 / 에어팟) 키워드마다 검색 API 1회 → 반품 확인 후보 + 일반 쿠팡 링크(내 파트너스 링크는 내가 누르면 안 됨) → 텔레그램
- 매일 08:10 자동: launchd `com.refinder.daily-goldbox` → daily-goldbox.sh → 텔레그램에 "오늘 모은 데이터" 보고 (로그 daily.log)
- API는 정가·할인율을 안 줌. 정가 짐작 금지(표시광고법)

## 다음 할 일
1. 스레드 프로필 입력 + 고정 게시물
2. 카톡 알림방 개설(이름·소개·공지 초안 있음) → 링크를 스레드 프로필에
3. 골드박스 API 연결 (Mac에서, 처음 1회 호출로 응답 확인)
4. 반품 "담기" 북마클릿 (반품 상품 페이지 캡처 필요)
