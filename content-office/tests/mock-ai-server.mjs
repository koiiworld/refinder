// 개발·테스트용 모의 AI 서버: OpenAI / Anthropic / Google 공식 API의 요청·응답 형식을 흉내 냅니다.
// 실제 API 키 없이 앱의 'AI 연결됨' 경로(요청 형식, 응답 파싱, 재시도, 토큰·비용 기록)를 검증합니다.
// 사용법: node tests/mock-ai-server.mjs  (기본 포트 4010)
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const log = [];
const hfJobs = new Map();

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://x");
    log.push({ method: req.method, path: url.pathname, headers: req.headers, body });

    if (url.pathname === "/__log") return send(res, 200, log);
    if (url.pathname === "/__reset") {
      log.length = 0;
      return send(res, 200, { ok: true });
    }

    // 네이버 데이터랩 (NAVER API HUB 방식)
    if (url.pathname === "/search-trend/v1/search") {
      if (req.headers["x-ncp-apigw-api-key-id"] !== "test-dl-id" || req.headers["x-ncp-apigw-api-key"] !== "test-dl-key")
        return send(res, 401, { error: { errorCode: "200", message: "Authentication Failed" } });
      const results = body.keywordGroups.map((g, i) => ({ title: g.groupName, keywords: g.keywords, data: [20, 22, 25, 30, 80, 100].map((r, k) => ({ period: "w" + k, ratio: r - i })) }));
      return send(res, 200, { startDate: body.startDate, endDate: body.endDate, timeUnit: body.timeUnit, results });
    }
    // 네이버 검색광고 키워드 도구 (서명 검증)
    if (url.pathname === "/keywordstool") {
      const ts = req.headers["x-timestamp"];
      const expect = crypto.createHmac("sha256", "test-ad-secret").update(`${ts}.GET./keywordstool`).digest("base64");
      if (req.headers["x-api-key"] !== "test-ad-key" || req.headers["x-customer"] !== "12345" || req.headers["x-signature"] !== expect)
        return send(res, 403, { title: "Invalid signature", code: 1018 });
      const hints = (url.searchParams.get("hintKeywords") ?? "").split(",");
      if (hints.some((h) => /\s/.test(h))) return send(res, 400, { title: "invalid keyword", code: 7003 });
      const list = hints.map((h, i) => ({ relKeyword: h, monthlyPcQcCnt: 1200 + i, monthlyMobileQcCnt: 8800, compIdx: "높음" }));
      list.push({ relKeyword: "김장양념레시피", monthlyPcQcCnt: "< 10", monthlyMobileQcCnt: 320, compIdx: "낮음" });
      list.push({ relKeyword: "김장날짜", monthlyPcQcCnt: "< 10", monthlyMobileQcCnt: "< 10", compIdx: "낮음" });
      return send(res, 200, { keywordList: list });
    }
    // 제조사 공식 페이지 (이미지 후보 찾기)
    if (url.pathname === "/official/mac-mini") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<html><head><meta property="og:image" content="https://www.apple.com/v/mac-mini/images/meta/mac-mini_og.jpg?2026"></head><body>
        <img src="/v/mac-mini/images/logo.svg"><img src="/v/mac-mini/images/icon_small.png">
        <picture><source srcset="/v/mac-mini/images/hero_small.jpg 734w, /v/mac-mini/images/hero_large.jpg 1440w"><img src="/v/mac-mini/images/hero_small.jpg" alt=""></picture>
        <img data-src="https://cdn.example.com/ports.webp"></body></html>`);
    }
    // 네이버 블로그 정보 (방문자 수) · 티스토리 첫 화면 방문자 카운터
    if (url.pathname === "/rego/BlogInfo.naver") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(`)]}',\n` + JSON.stringify({ result: { blogId: url.searchParams.get("blogId"), dayVisitorCount: 146, totalVisitorCount: 979 } }));
    }
    if (url.pathname === "/tistory-home") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<html><body><div class="visitor"><span>방문자수</span>Total<p class="total">1,229</p><ul><li>Today : 12</li><li>Yesterday : 31</li></ul></div><script>var Today = 999;</script></body></html>`);
    }
    // 쿠팡파트너스 리포트 (HMAC 서명 확인)
    const cp = url.pathname.match(/^\/v2\/providers\/affiliate_open_api\/apis\/openapi\/v1\/reports\/(commission|clicks|orders)$/);
    if (cp) {
      const m = /CEA algorithm=HmacSHA256, access-key=test-coupang-access, signed-date=(\d{6}T\d{6}Z), signature=([0-9a-f]+)/.exec(req.headers.authorization ?? "");
      const expect = m && crypto.createHmac("sha256", "test-coupang-secret").update(m[1] + "GET" + url.pathname + url.search.slice(1)).digest("hex");
      if (!m || m[2] !== expect) return send(res, 401, { rCode: "401", rMessage: "invalid signature" });
      if (!/^\d{8}$/.test(url.searchParams.get("startDate") ?? "") || !/^\d{8}$/.test(url.searchParams.get("endDate") ?? "")) return send(res, 400, { rCode: "400", rMessage: "bad date" });
      const data = cp[1] === "commission" ? [{ date: "20261101", commission: 1200 }, { date: "20261102", commission: 3400 }] : cp[1] === "clicks" ? [{ date: "20261101", click: 50 }, { date: "20261102", click: 70 }] : [{ date: "20261102", quantity: 3 }];
      return send(res, 200, { rCode: "0", rMessage: "", data });
    }
    // 네이버 블로그 홈 주제별 글 (블로그 핫이슈)
    if (url.pathname === "/ajax/DirectoryPostList.naver") {
      const seq = url.searchParams.get("directorySeq");
      const pg = Number(url.searchParams.get("pageNo"));
      const mk = (i, title, likes, comments) => ({ domainIdOrBlogId: `u${seq}_${pg}_${i}`, logNo: 100 + i, nickname: `닉${i}`, title, briefContents: "요약 <b>내용</b> " + "김장철을 맞아 직접 담가 본 김치 이야기와 양념 비율, 보관 방법까지 자세히 정리했습니다.", directory: { seq: 20, name: "요리·레시피" }, postUrl: `https://blog.naver.com/u${seq}_${pg}_${i}/${100 + i}`, sympathyCnt: likes, commentCnt: comments, addDate: Date.now() - i * 3600000, thumbnails: [{ url: `https://blogthumb.pstatic.net/t${i}.jpg` }] });
      const list = pg === 1 ? [mk(1, "김장 김치 담그는 법 후기", 10, 1), mk(2, "김장 양념 황금비율", 3, 9), mk(3, "굴보쌈 김장 날 메뉴", 50, 0), mk(4, "<b>붕어빵</b> 만들기 &amp; 팁", 1, 0), { ...mk(5, "머,,", 249, 22), briefContents: "" }, { ...mk(6, "오늘 하루 일상 기록 남겨봐요", 300, 30), directory: { seq: 14, name: "일상·생각" } }, mk(7, "80세가 4주만에 20세가 된다는 역노화 실험", 2566, 122), mk(8, "[일상] 해골 x100 1아승기 모음", 916, 186)] : [];
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(`)]}',\n` + JSON.stringify({ result: { totalCount: list.length, postList: list } }));
    }
    // 네이버 모바일 블로그 글 목록 (글별 공감·댓글)
    if (url.pathname === "/api/blogs/algo_kitchen/post-list") {
      return send(res, 200, { isSuccess: true, result: { items: [
        { logNo: 224000000001, sympathyCnt: 3, commentCnt: 0, readCount: null, titleWithInspectMessage: "굴보쌈 황금레시피" },
        { logNo: 224000000002, sympathyCnt: 40, commentCnt: 5, readCount: null, titleWithInspectMessage: "깍두기 담그는 법 &amp; 양념 비율" },
        { logNo: 224000000003, sympathyCnt: 9, commentCnt: 1, readCount: null, titleWithInspectMessage: "김장 준비" },
      ] } });
    }
    // 영상공장: 직접 받을 수 있는 영상 파일
    if (url.pathname === "/sample.mp4" && process.env.SAMPLE_MP4) {
      const buf = (await import("node:fs")).readFileSync(process.env.SAMPLE_MP4);
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(buf.length) });
      return res.end(req.method === "HEAD" ? undefined : buf);
    }
    // 구글 트렌드 한국 RSS
    if (url.pathname === "/trending/rss") {
      res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
      const item = (t, traffic, nt, nu) => `<item><title>${t}</title><ht:approx_traffic>${traffic}</ht:approx_traffic><pubDate>${new Date().toUTCString()}</pubDate><ht:news_item><ht:news_item_title>${nt}</ht:news_item_title><ht:news_item_url>${nu}</ht:news_item_url><ht:news_item_source>모의뉴스</ht:news_item_source></ht:news_item></item>`;
      return res.end(`<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>${item("김장 배추값", "2000+", "올해 배추값 &apos;뚝&apos;", "https://news.example.com/kimchi")}${item("야구", "1000+", "야구 결승", "https://news.example.com/baseball")}</channel></rss>`);
    }
    // 네이버 뉴스 검색 API
    if (url.pathname === "/v1/search/news.json") {
      if (req.headers["x-naver-client-id"] !== "test-dl-id") return send(res, 401, { errorMessage: "auth" });
      const qy = url.searchParams.get("query") ?? "";
      return send(res, 200, { total: 2, items: [
        { title: `<b>${qy}</b> 관련 새 소식`, originallink: `https://news.example.com/${encodeURIComponent(qy)}`, link: "https://n.news.naver.com/x", description: "요약 &quot;내용&quot;", pubDate: new Date().toUTCString() },
        { title: "오래된 뉴스", originallink: "https://news.example.com/old", link: "", description: "", pubDate: new Date(Date.now() - 10 * 86400000).toUTCString() },
      ] });
    }
    // 네이버 블로그 검색 API
    if (url.pathname === "/v1/search/blog.json") {
      if (req.headers["x-naver-client-id"] !== "test-dl-id") return send(res, 401, { errorMessage: "auth" });
      const qy = url.searchParams.get("query") ?? "";
      const other = (n) => Array.from({ length: n }, (_, i) => ({ title: `<b>다른 글</b> ${i}`, link: `https://blog.naver.com/other${i}/22300000${i}`, bloggerlink: `blog.naver.com/other${i}`, postdate: "20261101" }));
      const mine = (logNo) => ({ title: "내 글", link: `https://blog.naver.com/algo_kitchen/${logNo}`, bloggerlink: "blog.naver.com/algo_kitchen", postdate: "20261101" });
      if (qy.startsWith("굴보쌈 황금레시피")) return send(res, 200, { total: 3, items: [...other(1), mine("224000000001")] });
      if (qy.startsWith("깍두기")) return send(res, 200, { total: 30, items: other(10) });
      if (qy.startsWith("김장 준비")) return send(res, 200, { total: 5, items: [mine("224000000003")] });
      const items = other(100);
      items.splice(4, 0, mine("224000000009"));
      return send(res, 200, { total: 52000, items: items.slice(0, Number(url.searchParams.get("display") ?? 10)) });
    }
    // 네이버 블로그 RSS
    if (url.pathname === "/algo_kitchen.xml") {
      res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
      return res.end(`<?xml version="1.0"?><rss><channel><title>알고키친</title>
        <item><title><![CDATA[굴보쌈 황금레시피｜집에서 만드는 법]]></title><link>https://blog.naver.com/algo_kitchen/224000000001?fromRss=true</link><pubDate>${new Date(Date.now() - 2 * 86400000).toUTCString()}</pubDate></item>
        <item><title><![CDATA[깍두기 담그는 법 & 양념 비율]]></title><link>https://blog.naver.com/algo_kitchen/224000000002</link><pubDate>${new Date(Date.now() - 9 * 86400000).toUTCString()}</pubDate></item>
        <item><title>김장 준비 &amp;middot; 절임배추 &amp;ndash; 정리</title><link>https://blog.naver.com/algo_kitchen/224000000003</link></item>
        <item><title>개인정보처리방침</title><link>https://blog.naver.com/algo_kitchen/1</link></item>
      </channel></rss>`);
    }
    // 네이버 블로그 글 본문 (PostView)
    if (url.pathname === "/PostView.naver") {
      if (url.searchParams.get("blogId") !== "algo_kitchen" || url.searchParams.get("logNo") !== "224458356410") return send(res, 404, {});
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<html><head><meta property="og:title" content="양배추 두부전 만들기 : 네이버 블로그"></head><body><div class="blog_menu">카테고리 이웃추가</div>
        <div class="se-main-container"><div class="se-component"><p class="se-text-paragraph">안녕하세요 : ) 알고키친입니다. 오늘은 밀가루 없이 만드는 양배추 두부전을 소개해 드릴게요. 양배추는 채 썰고 두부는 물기를 꼭 짜 주세요 ㅎㅎ</p>
        <img src="https://postfiles.pstatic.net/a/b.jpg?type=w80_blur" data-lazy-src="https://postfiles.pstatic.net/MjAy/cabbage1.jpg?type=w80_blur" alt=""><img src="https://storep-phinf.pstatic.net/sticker.png"><h3>양배추 두부전 재료</h3><img data-lazy-src="https://postfiles.pstatic.net/MjAy/cabbage2.jpg?type=w773"><ul><li>양배추 200g</li><li>두부 반 모</li><li>달걀 2개</li></ul><p>약불에서 앞뒤로 노릇하게 구우면 완성이에요 !</p></div></div>
        <div class="comment">댓글 3</div></body></html>`);
    }
    // YouTube Data API
    if (url.pathname.startsWith("/youtube/v3/")) {
      if (url.searchParams.get("key") !== "test-yt-key") return send(res, 400, { error: { code: 400, message: "API key not valid", errors: [{ reason: "keyInvalid" }] } });
      const vid = (id, title, views, tags = []) => ({ id, snippet: { title, channelTitle: "채널" + id, publishedAt: "2026-11-01T00:00:00Z", tags, thumbnails: { medium: { url: "https://i.ytimg.com/" + id + ".jpg" } } }, statistics: { viewCount: String(views) } });
      if (url.pathname === "/youtube/v3/search") return send(res, 200, { items: [{ id: { videoId: "s1" } }, { id: { videoId: "s2" } }] });
      if (url.searchParams.get("chart") === "mostPopular")
        return send(res, 200, { items: [vid("v1", "김장 김치 황금레시피 공개", 900000, ["김장", "김치"]), vid("v2", "김장 절임배추 고르는 법", 500000, ["김장"]), vid("v3", "겨울 캠핑 브이로그", 100000)] });
      return send(res, 200, { items: [vid("s2", "김장 양념 비율 정리", 300000, ["김장"]), vid("s1", "김장 하는 날 브이로그", 700000, ["김장"])] });
    }

    // Higgsfield (이미지·영상)
    if (/^\/(v1\/text2image|higgsfield-ai\/|higgsfield\/|wan\/|requests\/|alibaba\/|ideogram\/|z-image\/|recraft\/|xai\/|marketing-studio\/|estimate\/)/.test(url.pathname)) {
      if (req.headers.authorization !== "Key test-id:test-secret") return send(res, 401, { detail: "Invalid credentials" });
      if (url.pathname === "/v1/text2image/soul-styles") return send(res, 200, [{ id: "s1", name: "Mock style" }]);
      if (url.pathname.startsWith("/estimate/")) return send(res, 200, { type: "estimate", credits: "0.090", usd: url.pathname.includes("soul/standard") ? "0.188" : "0.006", discount: null });
      if (req.method === "POST" && (["/higgsfield-ai/soul/standard", "/higgsfield-ai/soul/v2/standard", "/higgsfield-ai/soul/cinema", "/alibaba/qwen-image-3/text-to-image", "/ideogram/v4.0", "/z-image/turbo", "/wan/v2.6/image-to-video", "/xai/grok-imagine-image-2.0", "/higgsfield/ads-studio/v1.0"].includes(url.pathname) || /^\/(recraft|marketing-studio)\//.test(url.pathname))) {
        const id = "req" + (hfJobs.size + 1);
        hfJobs.set(id, { polls: 0, video: url.pathname.startsWith("/wan/"), body, path: url.pathname, idem: req.headers["idempotency-key"] });
        return send(res, 200, { status: "queued", request_id: id, status_url: `http://localhost:${PORT}/requests/${id}/status`, cancel_url: `http://localhost:${PORT}/requests/${id}/cancel` });
      }
      const m2 = url.pathname.match(/^\/requests\/(\w+)\/(status|cancel)$/);
      if (m2 && hfJobs.has(m2[1])) {
        const jb = hfJobs.get(m2[1]);
        if (m2[2] === "cancel") { res.writeHead(202); return res.end(); }
        jb.polls++;
        if (jb.polls < 2) return send(res, 200, { status: "in_progress", request_id: m2[1] });
        return send(res, 200, jb.video
          ? { status: "completed", request_id: m2[1], video: { url: "https://cdn.example.com/out.mp4" }, expires_at: "2026-11-10T00:00:00Z" }
          : { status: "completed", request_id: m2[1], images: [{ url: "https://cdn.example.com/out.png" }], expires_at: "2026-11-10T00:00:00Z" });
      }
      return send(res, 404, { detail: "not found" });
    }

    // ── 텍스트 AI 3사: 시스템 프롬프트 내용으로 단계별 응답 ──
    const answer = (system, prompt) => {
      if (system.includes("SEO 키워드 전문가")) return JSON.stringify({ keywords: [{ keyword: "김장 양념", reason: "김장철", season: "김장철" }, { keyword: "절임배추", reason: "수요 큼", season: "김장철" }, { keyword: "굴보쌈", reason: "제철", season: "" }] });
      if (system.includes("SEO 제목 전문가")) return JSON.stringify({ candidates: [{ title: "절임배추 20kg 김장 양념 황금비율", reason: "검색량 큰 연관어" }, { title: "초보 김장 가이드", reason: "입문자" }], best: 0, bestReason: "메인 키워드 앞배치", subKeywords: ["김장양념", "절임배추20kg"] });
      if (system.includes("해시태그 담당자")) return JSON.stringify({ hashtags: ["#김장", "절임배추", "김장 양념"] });
      if (system.includes("전속 작가")) return JSON.stringify({ html: "<h2>김장 준비</h2><p>본문 " + (prompt.includes("말투마커") ? "말투반영" : "") + "</p><p>[이미지 1]</p><h2>양념</h2><p>[이미지 2]</p><script>x()</script>", images: [{ prompt: "Top-down kimchi", alt: "김치", aspect: "4:3" }, { prompt: "Seasoning bowl", alt: "양념", aspect: "1:1" }] });
      if (system.includes("편집장이자 팩트체커")) return JSON.stringify({ summary: "모의 검수", score: 88, issues: [{ type: "fact", severity: "low", quote: "본문", comment: "확인", suggestion: "" }], factChecks: [], ruleChecks: [], imageChecks: [{ index: 1, ok: true, note: "좋음" }] });
      if (system.includes("교정")) return "AI가 다듬은 문장입니다.";
      if (system.includes("콘텐츠 전략가")) return JSON.stringify({ posts: [{ title: "양배추 두부전", titlePattern: "메뉴명 + 만들기 + 효익", hook: "인사 후 공감 질문", structure: "재료→순서→팁", whyPopular: "검색 의도에 바로 답함", keywords: ["양배추두부전"] }], common: ["재료를 목록으로"], apply: { titleIdeas: [{ title: "굴보쌈 집에서 만들기｜실패 없는 황금 비율", keyword: "굴보쌈", reason: "제철" }], keywords: [{ keyword: "굴보쌈", reason: "제철" }, { keyword: "깍두기", reason: "김장철" }], tips: ["사진 8장 이상"] } });
      if (system.includes("카드뉴스) 카피라이터")) return JSON.stringify({ slides: [{ kind: "cover", headline: "김밥 옆구리\\n안 터지는 법", body: "저장 필수", image: 0 }, { kind: "content", headline: "밥은 식혀서", body: "뜨거운 밥은 김을 찢어요", image: 7 }, { kind: "content", headline: "재료 준비", body: "단무지·햄·계란", image: null }, { kind: "cta", headline: "김밥 좋아하는 친구 태그 🍙", body: "저장해두고 주말에", image: null }], hooks: ["10분 김밥집 맛", "이렇게 하면 다 터져요", "저장 안 하면 후회"], caption: "김밥 안 터지는 비법 🍙\n\n밥은 식혀서!", hashtags: ["#김밥", "김밥 만들기", "도시락"] });
      if (system.includes("인스타그램 성장 전략가")) return JSON.stringify({ ideas: [{ topic: "자취생 냉장고 정리 7가지", format: "save", hook: "이것만 알면 냉장고가 2배", why: "나중에 다시 볼 정보" }, { topic: "택배 반품 실수 TOP5", format: "mistake", hook: "이러면 반품비 다 내요", why: "친구에게 공유" }, { topic: "", format: "save", hook: "", why: "" }] });
      if (system.includes("블로그 글 분류 도우미")) return JSON.stringify({ keep: [...prompt.matchAll(/^(\d+): (.*)$/gm)].filter((m) => !m[2].includes("역노화")).map((m) => Number(m[1])) });
      if (system.includes("영상 프레임에서")) return JSON.stringify({ found: true, boxes: [{ box_2d: [800, 100, 900, 900], what: "아래 자막" }] });
      if (system.includes("블로그 글감 기획자")) return JSON.stringify({ items: [
        { issue: "배추값 하락", keyword: "김장 배추값", title: "김장 배추값 내렸다, 올해 김장 비용 아끼는 법", why: "구글 트렌드 2000+, 뉴스 동시", direction: "가격 비교표 + 절임배추 팁", hotness: 5, timing: "이번 주", sources: ["g1", "n3", "x99"] },
        { issue: "근거 없는 글감", keyword: "아무거나", title: "근거 없음", why: "", direction: "", hotness: 3, timing: "오늘 바로", sources: ["zz"] },
        { issue: "제철 레시피", keyword: "제철 레시피", title: "11월 제철 레시피 모음", why: "뉴스", direction: "목록", hotness: 2, timing: "시즌 미리", sources: ["n3"] },
      ] });
      if (system.includes("블로그 성장 컨설턴트")) return JSON.stringify({ score: 62, summary: "발행은 꾸준하지만 누락 글이 있어요.", good: ["제목 길이 적당"], problems: [{ title: "검색 누락", why: "최근 글 1개가 안 나옴", fix: "비슷한 글 다시 쓰지 말고 새 각도로" }], titleTips: ["깍두기 담그는 법 & 양념 비율 → 깍두기 양념 비율 실패 없는 황금 공식"], next: ["주 3회 발행"] });
      if (system.includes("블로그 통계 화면")) return JSON.stringify({ period: "최근 7일", items: [{ title: "깍두기 담그는 법", views: "1,204" }, { title: "굴보쌈", views: 3300 }, { title: "", views: 9 }] });
      if (system.includes("광고 수익 화면")) return JSON.stringify({ krw: 12345, usd: null, period: "2026-11-01~2026-11-06", metric: "노출 1,000 · 클릭 20", found: true });
      if (system.includes("크리에이터 어드바이저 화면")) return "1 김장 양념 비율\n2 절임배추 ▲3\n3 굴보쌈 NEW";
      return "{}";
    };
    const sysOf = (b) => (typeof b.system === "string" ? b.system : b.messages?.find?.((m) => m.role === "system")?.content ?? b.systemInstruction?.parts?.[0]?.text ?? "");
    const promptOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join("") : "");

    // 이미지 생성: OpenAI Images API · Gemini 이미지 출력 (1x1 픽셀 이미지)
    const PIXEL = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
    if (url.pathname === "/v1/images/generations") {
      if (req.headers.authorization !== "Bearer test-openai") return send(res, 401, { error: { message: "bad key" } });
      if (!["1024x1024", "1536x1024", "1024x1536"].includes(body.size)) return send(res, 400, { error: { message: "bad size" } });
      return send(res, 200, { data: [{ b64_json: PIXEL }], usage: { input_tokens: 20, output_tokens: 400 } });
    }
    const gimg = url.pathname.match(/^\/v1beta\/models\/(.+):generateContent$/);
    if (gimg && body.generationConfig?.responseModalities?.includes("IMAGE")) {
      if (gimg[1].includes("lite")) return send(res, 429, { error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0" } });
      return send(res, 200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PIXEL } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290 } });
    }

    // OpenAI Chat Completions
    if (url.pathname === "/v1/chat/completions") {
      if (req.headers.authorization !== "Bearer test-openai") return send(res, 401, { error: { message: "bad key" } });
      if (body.model === "no-credit-model") return send(res, 429, { error: { message: "You have no credits remaining.", code: "credit_balance_exhausted" } });
      const user = body.messages.find((m) => m.role === "user");
      return send(res, 200, { choices: [{ message: { content: answer(sysOf(body), promptOf(user.content)) } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } });
    }
    if (url.pathname === "/v1/models" && req.headers.authorization) return send(res, 200, { data: [{ id: "gpt-mock-1" }, { id: "gpt-mock-2" }] });

    // Anthropic Messages
    if (url.pathname === "/v1/messages") {
      if (req.headers["x-api-key"] !== "test-anthropic" || !req.headers["anthropic-version"]) return send(res, 401, { error: { message: "bad key" } });
      const text = answer(sysOf(body), promptOf(body.messages[0].content));
      return send(res, 200, { content: [{ type: "text", text }], usage: { input_tokens: 2000, output_tokens: 800 } });
    }

    // Google Gemini generateContent
    const m = url.pathname.match(/^\/v1beta\/models\/(.+):generateContent$/);
    if (m) {
      if (req.headers["x-goog-api-key"] !== "test-google") return send(res, 403, { error: { message: "bad key" } });
      if (m[1] === "truncate-model") return send(res, 200, { candidates: [{ content: { parts: [{ text: '{"keywords":[{"keyword":"잘림테스트1","reason":"r"},{"keyword":"잘림테스트2","reason":"r2"},{"keyword":"잘림' }] }, finishReason: "STOP" }] });
      const parts = body.contents?.[0]?.parts ?? [];
      const text = answer(sysOf(body), parts.map((p) => p.text ?? "").join(""));
      return send(res, 200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 } });
    }
    if (url.pathname === "/v1beta/models") return send(res, 200, { models: [{ name: "models/gemini-mock" }] });

    send(res, 404, { error: { message: "not found" } });
  })
  .listen(PORT, () => console.log(`mock AI server on :${PORT}`));
