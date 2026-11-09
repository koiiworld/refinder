# 작업 인계: 서이추 자동 프로그램

## 2026-11-09 추가 작업

- **배포 완료:** Windows 빌드·포장된 exe의 GUI/드라이버 검사·릴리스 게시 모두 성공. https://github.com/koiiworld/refinder/actions/runs/42629139666
- 최신 릴리스: https://github.com/koiiworld/refinder/releases/latest (`seoichoo-v1.1`). ZIP 48.8MiB, ZIP/내부 파일 SHA256 전부 검증, Windows MZ 실행파일 확인. SHA256 `67c03e7343a5d7f6d3a949c6ca10775c1cac9629abfa7c7b725410f09ab02f13`.
- **미완료:** 실제 네이버 계정으로 2~3명 신청 및 실제 폼/결과 문구 대조. 이 클라우드에서 네이버는 프록시 403 차단, 실제 로그인 세션 없음. 빌드 성공을 실계정 검증 성공으로 혼동하지 말 것.

- Windows GitHub Actions 자동 빌드·exe 자체 GUI/드라이버 검사·ZIP/SHA256·Releases latest 게시 구성 추가. Chrome/Edge만 사용하며 브라우저를 번들/자동 다운로드하지 않음. `build_exe.bat`로 로컬 빌드도 가능.
- `--self-test --report <path>`는 임시 폴더에서 GUI를 만들고 전용 Worker에서 Playwright 드라이버만 시작/종료. 네이버 접속/신청 없음.
- 현재 로컬 검증: 단위·로컬 가상 폼 테스트 10개 통과, Python 문법·YAML 구조 검증. 이 Linux 환경은 DISPLAY가 없지만 GUI 자체 실행은 Windows CI에서 별도로 통과함.
- 성공 판정 보수화: 명시적인 완료 문구 없으면 `unconfirmed`, 자동 신청 중단·중복 제외·일일 횟수 보수 반영. 입력란 입력 실패 시 전송하지 않음. 숨긴 라디오 대신 보이는 라벨 선택. 단순 폼 이동/확인 질문은 성공이 아님.
- `신청 폼 진단(전송 안 함)` 추가: 선택자 일치·입력 요소 메타데이터만 diagnostics.json에 저장. 비밀번호/쿠키/입력값/본문은 기록하지 않음.
- 실제 네이버 계정 테스트는 여전히 미완료. 이 환경의 네이버 도메인 요청이 프록시 403으로 차단되며 로그인 세션 없음. 실제 선택자/완료 문구를 검증했다고 주장하지 말 것.
- 이 아래 내용은 이전 인계 기록. CI/릴리스 상태는 실제 Actions 결과를 확인해서 갱신할 것.

- 브랜치: `claude/seoichoo-automation-program-50awjg`
- 폴더: `seoichoo/`
- 참고한 글: https://m.blog.naver.com/lifestyle1015/224468480582
  - 흐름: 브라우저 로그인 → 검색어로 대상 찾기 → 공용 신청문구 → 후보 전체 선택 → 자동 신청 → 로그아웃
  - 네이버 정책상 하루 최대 100명

## 현재 구조

| 파일 | 역할 |
|---|---|
| `seoichoo.py` | tkinter GUI. Playwright 는 전용 `Worker` 스레드 하나에서만 실행, UI 갱신은 `ui_q` 큐로 메인 스레드에 전달 |
| `naver.py` | `NaverBot`: 브라우저 열기(크롬 → 엣지 → 크로미움 순), 로그인 확인, 검색, 서이추 신청, 로그아웃 |
| `start.bat` / `start.sh` | venv 만들고 의존성 설치 후 실행 |
| `requirements.txt` | `playwright>=1.40` |
| `history.json`, `settings.json`, `browser_profile/` | 실행 중 생성되는 로컬 데이터 (gitignore 됨). exe 실행 시 exe 폴더에 저장 |

현재 기본값: 1회 최대 20명(성공 기준), 신청 간격 30~120초 랜덤, 하루 최대 100명.

## 검증 상태

- **검증됨:** 검색 (`section.blog.naver.com/ajax/SearchList.naver`, 응답 앞에 `)]}',` 접두어가 붙음). 실제 API 로 후보 수집과 내 블로그 제외를 확인함.
- **검증 안 됨:**
  - 로그인 확인 (`blog.naver.com/MyBlog.naver` 리다이렉트를 파싱해 내 블로그 ID 를 얻는 방식)
  - 서이추 신청: `m.blog.naver.com/BuddyAddForm.naver?blogId=...` 폼. 로그인해야 보이는 화면이라 선택자를 확인하지 못했고 `DEFAULT_SELECTORS` 는 추정값임. `selectors.json` 으로 덮어쓸 수 있음.
  - 신청 결과 판별: `naver.py` 의 `_classify` 와 `TEXT_*` 문구가 추정값
  - GUI 실행 (작업 환경에 tkinter 가 없었음)

## 남은 작업

1. **Python 없이 실행되는 Windows exe 만들기 + 쉬운 배포** (사용자 요청)
   - 제안안: GitHub Actions `windows-latest` 에서 PyInstaller 로 빌드
     - `pyinstaller --onefile --windowed --name seoichoo --collect-all playwright seoichoo.py`
     - `seoichoo.exe` 와 README 를 zip 으로 묶어 GitHub Release 에 올림 (태그 예: `seoichoo-v<run_number>`, make_latest)
     - 배포는 `https://github.com/koiiworld/refinder/releases/latest` 링크 하나로 함
   - 브라우저는 내장하지 않음. 시스템의 크롬/엣지를 씀 (`naver.py` 에 이미 반영됨)
   - 메모: Claude 세션에서는 이 워크플로우(`contents: write` 권한) 추가와 푸시가 자동 안전 검사에서 거부됨. 저장소 소유자 확인 후 진행할 것.
   - 대안: 윈도우 PC 에서 직접 exe 를 만드는 `build_exe.bat`
2. 실제 네이버 계정으로 2~3명 신청해 보며 `BuddyAddForm` 선택자와 결과 판별 문구 맞추기
3. README 에 exe 설치 방법 추가
