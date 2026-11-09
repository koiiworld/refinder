"""배포 파일만 ZIP에 포함. 로그인 프로필·설정·신청 기록은 넣지 않음."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
NAME = "seoichoo-windows-x64.zip"


def package(exe=None, output=None):
    exe = Path(exe) if exe else DIST / "seoichoo.exe"
    output = Path(output) if output else DIST / NAME
    if not exe.is_file():
        raise FileNotFoundError(f"exe를 먼저 빌드하세요: {exe}")
    output.parent.mkdir(parents=True, exist_ok=True)
    files = {"seoichoo.exe": exe, "README.md": ROOT / "README.md", "VALIDATION.md": ROOT / "VALIDATION.md"}
    sums = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}\n" for name, path in files.items())
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in files.items():
            archive.write(path, name)
        archive.writestr("SHA256SUMS.txt", sums)
    output.with_suffix(".zip.sha256").write_text(f"{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.name}\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    print(package())
