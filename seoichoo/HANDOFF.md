# 작업 인계: 서이추 자동 프로그램

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
