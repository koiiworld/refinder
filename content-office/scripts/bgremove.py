"""배경 제거 (rembg, 맥에서 무료) — 폴더 안 사진들을 사람만 남긴 투명 PNG로

사용: python bgremove.py <입력폴더 또는 사진> <출력폴더 또는 사진>
진행은 'progress 0.42' 줄로 알려줌
"""
import os
import sys

from PIL import Image
from rembg import new_session, remove


def main():
    src, dst = sys.argv[1], sys.argv[2]
    model = os.environ.get("REMBG_MODEL", "u2net_human_seg")
    session = new_session(model)
    if os.path.isfile(src):
        remove(Image.open(src).convert("RGB"), session=session).save(dst)
        print("progress 1", flush=True)
        return
    os.makedirs(dst, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.endswith(".png"))
    for i, f in enumerate(files):
        remove(Image.open(os.path.join(src, f)).convert("RGB"), session=session).save(os.path.join(dst, f))
        print(f"progress {(i + 1) / max(1, len(files)):.3f}", flush=True)


if __name__ == "__main__":
    main()
