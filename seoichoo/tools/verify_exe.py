"""Windows exe 자체로 Tk GUI와 Playwright 드라이버를 검증. 네이버 접속/신청 없음."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

exe = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/seoichoo.exe").resolve()
with tempfile.TemporaryDirectory(prefix="seoichoo-exe-test-") as directory:
    report = Path(directory) / "report.json"
    env = os.environ.copy()
    env.pop("PYTHONHOME", None)
    env.pop("PYTHONPATH", None)
    # 빌드 Python이 PATH에 있어도 사용하지 않도록 제거한 상태에서 exe만 실행.
    env["PATH"] = os.pathsep.join(p for p in env.get("PATH", "").split(os.pathsep) if "python" not in p.lower())
    completed = subprocess.run([str(exe), "--self-test", "--report", str(report)], env=env, timeout=45, check=False)
    if not report.is_file():
        raise SystemExit(f"exe 자체 진단 보고서가 없어요 (종료 코드 {completed.returncode})")
    result = json.loads(report.read_text(encoding="utf-8"))
    print(json.dumps(result, ensure_ascii=False))
    if completed.returncode or not all(result.get(k) for k in ("ok", "frozen", "gui", "driver", "worker_thread")):
        raise SystemExit("Windows exe 실행 검증 실패")
