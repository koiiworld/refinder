@echo off
chcp 65001 > nul
cd /d "%~dp0"
where python > nul 2>&1
if errorlevel 1 goto :python_missing
if not exist ".build-venv\Scripts\python.exe" python -m venv .build-venv
if errorlevel 1 goto :fail
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PYTHONUTF8=1
".build-venv\Scripts\python.exe" -m pip install -r build-requirements.txt
if errorlevel 1 goto :fail
".build-venv\Scripts\python.exe" -m PyInstaller --onefile --windowed --name seoichoo --collect-all playwright seoichoo.py
if errorlevel 1 goto :fail
".build-venv\Scripts\python.exe" tools\verify_exe.py dist\seoichoo.exe
if errorlevel 1 goto :fail
".build-venv\Scripts\python.exe" tools\package_release.py
if errorlevel 1 goto :fail
echo [완료] dist\seoichoo-windows-x64.zip 을 배포하세요.
pause
exit /b 0
:python_missing
echo 빌드하는 PC에는 Python 3.12가 필요합니다. 완성된 exe를 받는 PC에는 필요 없습니다.
goto :fail
:fail
echo 빌드/검증 중 오류가 발생했습니다. 위 오류를 확인하세요.
pause
exit /b 1
