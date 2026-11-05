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
    // 네이버 블로그 RSS
    if (url.pathname === "/algo_kitchen.xml") {
      res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
      return res.end(`<?xml version="1.0"?><rss><channel><title>알고키친</title>
        <item><title><![CDATA[굴보쌈 황금레시피｜집에서 만드는 법]]></title><link>https://blog.naver.com/algo_kitchen/224000000001?fromRss=true</link></item>
        <item><title><![CDATA[깍두기 담그는 법 & 양념 비율]]></title><link>https://blog.naver.com/algo_kitchen/224000000002</link></item>
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
        <h3>양배추 두부전 재료</h3><ul><li>양배추 200g</li><li>두부 반 모</li><li>달걀 2개</li></ul><p>약불에서 앞뒤로 노릇하게 구우면 완성이에요 !</p></div></div>
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
    if (/^\/(v1\/text2image|higgsfield-ai\/|wan\/|requests\/|alibaba\/|ideogram\/|z-image\/|estimate\/)/.test(url.pathname)) {
      if (req.headers.authorization !== "Key test-id:test-secret") return send(res, 401, { detail: "Invalid credentials" });
      if (url.pathname === "/v1/text2image/soul-styles") return send(res, 200, [{ id: "s1", name: "Mock style" }]);
      if (url.pathname.startsWith("/estimate/")) return send(res, 200, { type: "estimate", credits: "0.090", usd: url.pathname.includes("soul/standard") ? "0.188" : "0.006", discount: null });
      if (req.method === "POST" && ["/higgsfield-ai/soul/standard", "/higgsfield-ai/soul/v2/standard", "/higgsfield-ai/soul/cinema", "/alibaba/qwen-image-3/text-to-image", "/ideogram/v4.0", "/z-image/turbo", "/wan/v2.6/image-to-video"].includes(url.pathname)) {
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
      if (system.includes("전속 작가")) return JSON.stringify({ html: "<h2>김장 준비</h2><p>본문 " + (prompt.includes("말투마커") ? "말투반영" : "") + "</p><p>[이미지 1]</p><h2>양념</h2><p>[이미지 2]</p><script>x()</script>", hashtags: ["#김장", "절임배추", "김장 양념"], images: [{ prompt: "Top-down kimchi", alt: "김치", aspect: "4:3" }, { prompt: "Seasoning bowl", alt: "양념", aspect: "1:1" }] });
      if (system.includes("편집장이자 팩트체커")) return JSON.stringify({ summary: "모의 검수", score: 88, issues: [{ type: "fact", severity: "low", quote: "본문", comment: "확인", suggestion: "" }], factChecks: [], ruleChecks: [], imageChecks: [{ index: 1, ok: true, note: "좋음" }] });
      if (system.includes("교정")) return "AI가 다듬은 문장입니다.";
      if (system.includes("콘텐츠 전략가")) return JSON.stringify({ posts: [{ title: "양배추 두부전", titlePattern: "메뉴명 + 만들기 + 효익", hook: "인사 후 공감 질문", structure: "재료→순서→팁", whyPopular: "검색 의도에 바로 답함", keywords: ["양배추두부전"] }], common: ["재료를 목록으로"], apply: { titleIdeas: [{ title: "굴보쌈 집에서 만들기｜실패 없는 황금 비율", keyword: "굴보쌈", reason: "제철" }], keywords: [{ keyword: "굴보쌈", reason: "제철" }, { keyword: "깍두기", reason: "김장철" }], tips: ["사진 8장 이상"] } });
      if (system.includes("크리에이터 어드바이저 화면")) return "1 김장 양념 비율\n2 절임배추 ▲3\n3 굴보쌈 NEW";
      return "{}";
    };
    const sysOf = (b) => (typeof b.system === "string" ? b.system : b.messages?.find?.((m) => m.role === "system")?.content ?? b.systemInstruction?.parts?.[0]?.text ?? "");
    const promptOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join("") : "");

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
