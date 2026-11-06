"""테스트용 받아쓰기 (모델을 내려받지 않음) — 3초 시험 영상에 문장 3개"""
import json

print(json.dumps({"language": "ko", "segments": [
    {"start": 0.0, "end": 0.9, "text": "첫 문장 훅이에요"},
    {"start": 1.0, "end": 1.9, "text": "두 번째 설명"},
    {"start": 2.0, "end": 2.9, "text": "마지막 마무리"},
]}, ensure_ascii=False))
