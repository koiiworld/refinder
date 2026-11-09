#!/usr/bin/env bash
# macOS / Linux 실행 스크립트
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt
.venv/bin/python -m playwright install chromium >/dev/null 2>&1 || true
exec .venv/bin/python seoichoo.py
