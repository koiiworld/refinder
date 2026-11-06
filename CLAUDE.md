# Claude Code 메모 (자동으로 읽힘)

- 앱은 `content-office/`. 작업 전에 **`content-office/HANDOFF.md`**(사용자 규칙·구조·남은 일)와 **`content-office/CODEMAP.md`**(파일 지도)를 먼저 읽는다.
- 파일을 추가·이름 변경했으면 `cd content-office && node scripts/codemap.mjs` 로 지도를 다시 만든다.
- 사용자와는 한국어로 쉽게. 키 값은 절대 출력·커밋하지 않고, 키 입력은 맥 팝업 또는 Render 설정으로.
- 테스트는 실제 앱을 건드리지 않는 `zsh content-office/tests/run-isolated.sh` 로.
