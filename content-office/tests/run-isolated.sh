#!/bin/zsh
# 실제 앱(포트 3000, 실제 DB·키)을 건드리지 않고 전체 테스트를 돌립니다.
# - 프로젝트를 /tmp/co-test 로 복사(.env.local·data 제외) → 빌드 → 모의 AI 서버(4110) + 테스트 서버 2개(3101: AI 없음, 3102: 모의 AI)
# 사용법: zsh tests/run-isolated.sh   (content-office 폴더에서)
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST=/tmp/co-test
mkdir -p "$DST"
rsync -a --delete --exclude node_modules --exclude .next --exclude data --exclude '.env*.local' --exclude '.env' "$SRC/" "$DST/"
# node_modules 는 복제(APFS 복사 시 공간 거의 안 씀). Turbopack 은 바깥을 가리키는 심볼릭 링크를 거부함
[ -d "$DST/node_modules" ] || cp -Rc "$SRC/node_modules" "$DST/node_modules"
cd "$DST"
./node_modules/.bin/next build > build.log 2>&1 || { tail -40 build.log; exit 1; }
set +e
rm -rf data
MOCK_PORT=4110 node tests/mock-ai-server.mjs > mock.log 2>&1 &
MOCK=$!
env -i PATH="$PATH" HOME="$HOME" PGLITE_DIR=./data/wf ./node_modules/.bin/next start -p 3101 > wf.log 2>&1 &
WF=$!
env -i PATH="$PATH" HOME="$HOME" PGLITE_DIR=./data/ai \
  OPENAI_API_KEY=test-openai ANTHROPIC_API_KEY=test-anthropic GOOGLE_AI_API_KEY=test-google GOOGLE_AI_TEXT_API_KEY=test-google HIGGSFIELD_API_KEY=test-id:test-secret \
  OPENAI_BASE_URL=http://localhost:4110 ANTHROPIC_BASE_URL=http://localhost:4110 GOOGLE_AI_BASE_URL=http://localhost:4110 HIGGSFIELD_BASE_URL=http://localhost:4110 \
  NAVER_AD_API_KEY=test-ad-key NAVER_AD_SECRET_KEY=test-ad-secret NAVER_AD_CUSTOMER_ID=12345 NAVER_AD_BASE_URL=http://localhost:4110 \
  NAVER_CLIENT_ID=test-dl-id NAVER_CLIENT_SECRET=test-dl-key NAVER_DATALAB_URL=http://localhost:4110/search-trend/v1/search \
  YOUTUBE_API_KEY=test-yt-key YOUTUBE_BASE_URL=http://localhost:4110 NAVER_BLOG_BASE_URL=http://localhost:4110 NAVER_RSS_BASE_URL=http://localhost:4110 NAVER_MBLOG_BASE_URL=http://localhost:4110 OFFICIAL_IMAGES_ALLOW_LOCAL=1 \
  COUPANG_ACCESS_KEY=test-coupang-access COUPANG_SECRET_KEY=test-coupang-secret COUPANG_API_BASE_URL=http://localhost:4110 NAVER_SEARCH_URL=http://localhost:4110/v1/search/blog.json \
  ./node_modules/.bin/next start -p 3102 > ai.log 2>&1 &
AI=$!
for i in {1..40}; do curl -sf localhost:3101/api/health >/dev/null && curl -sf localhost:3102/api/health >/dev/null && break; sleep 1; done
echo "=== workflow (AI 없음) ==="; BASE_URL=http://localhost:3101 node --test tests/workflow.test.mjs > wf-test.out 2>&1; grep -E "^ℹ (pass|fail)|✖" wf-test.out
echo "=== ai (모의 AI) ==="; BASE_URL=http://localhost:3102 MOCK_URL=http://localhost:4110 node --test tests/ai-providers.test.mjs > ai-test.out 2>&1; grep -E "^ℹ (pass|fail)|✖" ai-test.out
kill $MOCK $WF $AI 2>/dev/null
echo "자세한 결과: $DST/wf-test.out, $DST/ai-test.out"
