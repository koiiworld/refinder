"""맥 전용: faster-whisper 로 말 받아쓰기 → JSON (무료, 처음 한 번 모델을 내려받음)
사용: FFMPEG=<ffmpeg 경로> python transcribe.py <영상·소리 파일> [모델 크기=small]
출력(stdout): {"language": "ko", "segments": [{"start": 0.0, "end": 2.1, "text": "..."}]}
- 소리는 ffmpeg 로 16kHz 모노로 직접 풀어서 넘김 (PyAV 버전 차이 문제 피함)
"""
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def load_audio(src: str) -> np.ndarray:
    ff = os.environ.get("FFMPEG", "ffmpeg")
    raw = subprocess.run([ff, "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def main():
    src = sys.argv[1]
    size = sys.argv[2] if len(sys.argv) > 2 else "small"
    audio = load_audio(src)
    if audio.size == 0:
        print(json.dumps({"language": "", "segments": []}))
        return
    model = WhisperModel(size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, language=None, vad_filter=True, beam_size=5)
    out = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments if s.text.strip()]
    print(json.dumps({"language": info.language, "segments": out}, ensure_ascii=False))


if __name__ == "__main__":
    main()
