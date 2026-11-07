#!/usr/bin/env python3
"""시험용 edge-tts: 인터넷 없이 1.5초짜리 무음 소리 파일을 만듦 (인자 형식은 진짜와 같음)"""
import struct
import sys

args = sys.argv[1:]
out = args[args.index("--write-media") + 1]
assert "--voice" in args and "-f" in args
rate, n = 16000, 16000 * 3 // 2
with open(out, "wb") as f:
    f.write(b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", n * 2) + b"\0\0" * n)
