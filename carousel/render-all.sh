#!/usr/bin/env bash
# 모든 슬라이드를 인스타그램 캐러셀용 MP4(1080x1350, H.264)로 렌더링합니다.
set -euo pipefail
cd "$(dirname "$0")"
ids=$(npx remotion compositions --quiet)
for id in $ids; do
  npx remotion render "$id" "out/$id.mp4" --codec=h264 --crf=16 --pixel-format=yuv420p --log=error
  echo "rendered out/$id.mp4"
done
