#!/bin/zsh
# 릴스·쇼츠 링크 → /tmp/reel-read/<아이디>/ 에 설명글·받아쓰기·장면 사진 (맥 전용)
# 사용: zsh .claude/skills/reel-reader/read-reel.sh "<링크>" ["<링크>" ...]
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CO="$ROOT/content-office"
YTDLP="$CO/bin/yt-dlp"
FF="$CO/node_modules/ffmpeg-static/ffmpeg"
PY="$HOME/.ai-content-office/whisper-venv/bin/python"

for URL in "$@"; do
  ID=$(echo "$URL" | sed -E 's#.*/(reel|p|shorts|video)/([^/?]+).*#\2#; s#.*v=([^&]+).*#\1#' | tr -cd 'A-Za-z0-9_-' | cut -c1-40)
  [ -z "$ID" ] && ID=$(date +%s)
  OUT="/tmp/reel-read/$ID"
  mkdir -p "$OUT/frames"
  echo "=== $URL → $OUT"
  "$YTDLP" --no-playlist --no-warnings --retries 2 --socket-timeout 20 -f "b[height<=1080]/bv*+ba/b" \
    --ffmpeg-location "$FF" -o "$OUT/video.%(ext)s" --write-info-json "$URL" > "$OUT/download.log" 2>&1
  INFO=$(ls "$OUT"/*.info.json 2>/dev/null | head -1)
  if [ -n "$INFO" ]; then
    python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print('올린 사람:',d.get('uploader'));print('길이:',d.get('duration'));print();print(d.get('description') or '')" "$INFO" > "$OUT/info.txt"
  fi
  VIDEO=$(ls "$OUT"/video.* 2>/dev/null | grep -v info.json | head -1)
  if [ -z "$VIDEO" ]; then echo "영상 없음 (사진 게시물이거나 받기 실패) — $OUT/info.txt, download.log 확인"; continue; fi
  # 받아쓰기
  if [ -x "$PY" ]; then
    FFMPEG="$FF" "$PY" "$CO/scripts/transcribe.py" "$VIDEO" small 2>/dev/null \
      | python3 -c "import json,sys;d=json.load(sys.stdin);print('\n'.join(f\"[{s['start']:.1f}s] {s['text']}\" for s in d['segments']))" > "$OUT/transcript.txt" 2>/dev/null
  fi
  # 첫 3초 + 장면 바뀌는 곳 (최대 12장)
  i=0
  for T in 0.3 1.3 2.3; do "$FF" -v error -y -ss $T -i "$VIDEO" -frames:v 1 -vf "scale=360:-2" "$OUT/frames/$(printf %02d $i)_${T}s.jpg"; i=$((i+1)); done
  for T in $("$FF" -hide_banner -i "$VIDEO" -vf "select='gt(scene,0.3)',showinfo" -an -f null - 2>&1 | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | awk '$1>3' | awk 'NR==1||$1-p>=1.5{print;p=$1}' | head -12); do
    "$FF" -v error -y -ss $T -i "$VIDEO" -frames:v 1 -vf "scale=360:-2" "$OUT/frames/$(printf %02d $i)_${T}s.jpg"; i=$((i+1))
  done
  "$FF" -v error -y -pattern_type glob -i "$OUT/frames/*.jpg" -vf "scale=240:-2,tile=6x3" -frames:v 1 "$OUT/sheet.jpg"
  echo "완료: $(ls "$OUT/frames" | wc -l | tr -d ' ')장 · 받아쓰기 $(wc -l < "$OUT/transcript.txt" 2>/dev/null | tr -d ' ')줄"
done
