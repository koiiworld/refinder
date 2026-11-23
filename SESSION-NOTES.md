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
- `alerts/post-threads.mjs`: 미리보기 → `--yes` 로 본문+첫 댓글 게시 (THREADS_ACCESS_TOKEN 필요, Meta 개발자 앱에서 발급)

## 텔레그램 업무 보고
- 새 봇 @upmoo3bot → 받는 사람 "Mh". 답장 = 다음 업무 지시
- 맥: 보내기 `node ~/.ai-content-office/report.mjs <파일>` · 답장 읽기 `node ~/.ai-content-office/inbox.mjs` (처리 후 `--ack`)
- 키: 맥 `content-office/.env.local` 의 REPORT_TELEGRAM_BOT_TOKEN / REPORT_TELEGRAM_CHAT_ID (출력 금지)
- **보고 규칙 (사용자 지정 11/24)**: 매번 보고 X. ① 그날 모은 데이터 ② 업무 마칠 때 ③ 스레드 게시 직전 — 이때만 보고
- 반품 담기: 사용자가 쿠팡 앱 '반품 상품' 화면 캡처 + 공유 링크를 @upmoo3bot 에 보냄 → inbox.mjs 가 사진을 ~/.ai-content-office/inbox/ 에 저장 → 캡처 읽어서 상품명·반품가·등급·새 상품가 추출 (북마클릿은 앱에서 안 돼서 이 방식)
- 이 세션은 예약 작업 불가(컴퓨터 연결 세션) → 사용자가 여기서 "확인"하면 텔레그램 답장 읽고 진행

## 애플 반품 메모
- 애플 반품은 신상품(브랜드 직매입) 페이지엔 안 뜨고 "Apple 정품 ○○" 같은 옛 상품 페이지에 붙음. 예전 데이터(index.html)에 애플 반품 67개 있음 (새 상품가는 전부 비어 있음)
- 체크리스트: 맥 ~/.ai-content-office/apple-check.txt (가격 큰 순 15개, 반품 탭 바로 열리는 일반 링크)

## 골드박스 (맥 ~/.ai-content-office, 맥이 원본)
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
