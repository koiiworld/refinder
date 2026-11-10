#!/usr/bin/env bash
# 실제 앱(포트 3000, 실제 DB·키)을 건드리지 않고 전체 테스트를 돌립니다.
# - 프로젝트를 /tmp/co-test 로 복사(.env.local·data 제외) → 빌드 → 모의 AI 서버(4110) + 테스트 서버 2개(3101: AI 없음, 3102: 모의 AI)
# 사용법: bash tests/run-isolated.sh   (content-office 폴더에서)
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST=/tmp/co-test
# 기존 서버를 재사용해 잘못 통과하지 않도록 격리 포트를 먼저 확인.
node <<'PORTS'
const net=require('node:net');
(async()=>{for(const port of [3101,3102,4110])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`격리 테스트 포트 ${port}가 이미 사용 중이에요. 기존 테스트 실행을 종료한 뒤 다시 실행해 주세요.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});})().catch(e=>{console.error(e.message);process.exit(1);});
PORTS
mkdir -p "$DST"
# macOS와 Linux 모두 Node의 복사 API 사용. 실제 설정·DB·키는 제외.
node - "$SRC" "$DST" <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const [src,dst]=process.argv.slice(2);
if(dst !== '/tmp/co-test' || src === dst) throw Error('격리 경로를 확인해 주세요.');
for(const name of fs.readdirSync(dst)) if(!['node_modules','.next'].includes(name))fs.rmSync(path.join(dst,name),{recursive:true,force:true});
for(const name of fs.readdirSync(src)) {
  if(['node_modules','.next','.next-new','data'].includes(name)||name.startsWith('.env'))continue;
  fs.cpSync(path.join(src,name),path.join(dst,name),{recursive:true});
}
if(path.isAbsolute(fs.existsSync(path.join(dst,'node_modules/.bin/next'))?fs.readlinkSync(path.join(dst,'node_modules/.bin/next')):'')||!fs.existsSync(path.join(dst,'node_modules/.copied-lock'))||!fs.readFileSync(path.join(src,'package-lock.json')).equals(fs.readFileSync(path.join(dst,'node_modules/.copied-lock')))) {
  fs.rmSync(path.join(dst,'node_modules'),{recursive:true,force:true});
  fs.cpSync(path.join(src,'node_modules'),path.join(dst,'node_modules'),{recursive:true,verbatimSymlinks:true});
  fs.copyFileSync(path.join(src,'package-lock.json'),path.join(dst,'node_modules/.copied-lock'));
}
NODE
cd "$DST"
node --test tests/carousel-sources.test.mjs && node --conditions=react-server --test tests/post-images.test.mjs
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build > build.log 2>&1 || { tail -40 build.log; exit 1; }
# 격리 복사본 이외의 데이터는 지우지 않음
[ "$PWD" = "/tmp/co-test" ] || exit 1
rm -rf data
TEST_FFMPEG="$(node -e 'console.log(require("ffmpeg-static"))')"
TEST_PYTHON="$(command -v python3)"
# 렌더러·문서 변환기는 실제 도구를 사용. 로컬 비전 모델은 모의 도구로 프로세스 경계 검증.
TEST_RUNTIME="${REMOTION_RUNTIME:-$HOME/.ai-content-office/remotion-runtime}"
TEST_MARKITDOWN="${MARKITDOWN_BIN:-$HOME/.ai-content-office/ai-tools-venv/bin/markitdown}"
TEST_BROWSER="${REMOTION_BROWSER:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TEST_AI_PY="${AI_TOOLS_PYTHON:-$DST/tests/fake-ai-python.sh}"
TEST_ESRGAN="${ESRGAN_BIN:-$DST/tests/fake-esrgan.sh}"
TEST_RIFE="${RIFE_BIN:-$DST/tests/fake-rife.sh}"
TEST_HOME="$DST/test-home"
mkdir -p "$TEST_HOME"
# 영상공장 테스트용 짧은 영상 (3초, 360x640, 소리 있음)
[ -f sample.mp4 ] || "$TEST_FFMPEG" -v error -y -f lavfi -i testsrc=size=360x640:rate=15 -f lavfi -i sine=frequency=440 -t 3 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac sample.mp4
SAMPLE_MP4="$DST/sample.mp4" MOCK_PORT=4110 node tests/mock-ai-server.mjs > mock.log 2>&1 &
MOCK=$!
env -i PATH="$PATH" HOME="$HOME" PGLITE_DIR=./data/wf ./node_modules/.bin/next start -p 3101 > wf.log 2>&1 &
WF=$!
env -i PATH="$PATH" HOME="$TEST_HOME" PGLITE_DIR=./data/ai \
  OPENAI_API_KEY=test-openai ANTHROPIC_API_KEY=test-anthropic GOOGLE_AI_API_KEY=test-google GOOGLE_AI_TEXT_API_KEY=test-google HIGGSFIELD_API_KEY=test-id:test-secret \
  OPENAI_BASE_URL=http://localhost:4110 ANTHROPIC_BASE_URL=http://localhost:4110 GOOGLE_AI_BASE_URL=http://localhost:4110 HIGGSFIELD_BASE_URL=http://localhost:4110 \
  NAVER_AD_API_KEY=test-ad-key NAVER_AD_SECRET_KEY=test-ad-secret NAVER_AD_CUSTOMER_ID=12345 NAVER_AD_BASE_URL=http://localhost:4110 \
  NAVER_CLIENT_ID=test-dl-id NAVER_CLIENT_SECRET=test-dl-key NAVER_DATALAB_URL=http://localhost:4110/search-trend/v1/search \
  YOUTUBE_API_KEY=test-yt-key YOUTUBE_BASE_URL=http://localhost:4110 NAVER_BLOG_BASE_URL=http://localhost:4110 NAVER_RSS_BASE_URL=http://localhost:4110 NAVER_MBLOG_BASE_URL=http://localhost:4110 OFFICIAL_IMAGES_ALLOW_LOCAL=1 VIDEO_ALLOW_LOCAL=1 PUBLIC_BASE_URL=https://app.example.test TELEGRAM_BOT_TOKEN=test-tg-token TELEGRAM_CHAT_ID=987654 TELEGRAM_API_BASE=http://localhost:4110 YTDLP_NO_UPDATE=1 INSTAGRAM_TEST_ORIGIN=http://localhost:4110 RADAR_TEST_ORIGIN=http://localhost:4110 KR_HOLIDAY_ICS_URL=http://localhost:4110/kr-holidays.ics \
  COUPANG_ACCESS_KEY=test-coupang-access COUPANG_SECRET_KEY=test-coupang-secret COUPANG_API_BASE_URL=http://localhost:4110 NAVER_SEARCH_URL=http://localhost:4110/v1/search/blog.json NAVER_SECTION_BASE_URL=http://localhost:4110 GOOGLE_TRENDS_RSS_URL=http://localhost:4110/trending/rss PRICING_SOURCE_URL=http://localhost:4110/model-prices.json KEYS_SECRET=test-keys-secret WHISPER_PYTHON="$TEST_PYTHON" WHISPER_SCRIPT=tests/fake-transcribe.py EDGE_TTS_BIN=tests/fake-edge-tts.py \
  REMOTION_RUNTIME="$TEST_RUNTIME" REMOTION_BROWSER="$TEST_BROWSER" MARKITDOWN_BIN="$TEST_MARKITDOWN" AI_TOOLS_PYTHON="$TEST_AI_PY" ESRGAN_BIN="$TEST_ESRGAN" RIFE_BIN="$TEST_RIFE" \
  ./node_modules/.bin/next start -p 3102 > ai.log 2>&1 &
AI=$!
trap 'kill "$MOCK" "$WF" "$AI" 2>/dev/null || true' EXIT
for i in {1..60}; do curl -sf localhost:3101/api/health >/dev/null && curl -sf localhost:3102/api/health >/dev/null && break; sleep 1; done
set +e
echo "=== workflow (AI 없음) ==="; BASE_URL=http://localhost:3101 node --test tests/workflow.test.mjs > wf-test.out 2>&1; WF_RESULT=$?; grep -E "^ℹ (pass|fail)|✖" wf-test.out
echo "=== ai (모의 AI) ==="; BASE_URL=http://localhost:3102 MOCK_URL=http://localhost:4110 node --test tests/ai-providers.test.mjs > ai-test.out 2>&1; AI_RESULT=$?; grep -E "^ℹ (pass|fail)|✖" ai-test.out
kill $MOCK $WF $AI 2>/dev/null
echo "자세한 결과: $DST/wf-test.out, $DST/ai-test.out"

[ "$WF_RESULT" -eq 0 ] && [ "$AI_RESULT" -eq 0 ]
