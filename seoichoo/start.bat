@echo off
chcp 65001 > nul
cd /d "%~dp0"

where python > nul 2>&1
if errorlevel 1 (
  echo [!] Python 이 설치되어 있지 않습니다. https://www.python.org 에서 설치하세요.
  echo     설치 시 "Add python.exe to PATH" 를 꼭 체크하세요.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] 가상환경 만드는 중...
  python -m venv .venv || goto :fail
)

echo [2/3] 필요한 패키지 설치/확인 중...
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt || goto :fail
".venv\Scripts\python.exe" -m playwright install chromium > nul 2>&1

echo [3/3] 프로그램 실행
start "" ".venv\Scripts\pythonw.exe" seoichoo.py
exit /b 0

:fail
echo [!] 설치 중 오류가 발생했습니다.
pause
exit /b 1
