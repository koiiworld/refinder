// 개발·테스트용 모의 AI 서버: OpenAI / Anthropic / Google 공식 API의 요청·응답 형식을 흉내 냅니다.
// 실제 API 키 없이 앱의 'AI 연결됨' 경로(요청 형식, 응답 파싱, 재시도, 토큰·비용 기록)를 검증합니다.
// 사용법: node tests/mock-ai-server.mjs  (기본 포트 4010)
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const log = [];
let googleFailOnce = true;

const plan = {
  titleCandidates: ["모의 제목 A", "모의 제목 B"],
  selectedTitle: "모의 제목 A",
  mainKeyword: "모의 키워드",
  subKeywords: ["연관1", "연관2"],
  searchIntent: "정보형",
  targetReader: "입문자",
  direction: "비교 중심",
  outline: [{ heading: "도입", points: ["요약"] }, { heading: "비교", points: ["표"] }],
  sources: [{ title: "지어낸 출처", url: "https://fake.example.com/made-up", note: "AI가 만든 URL (앱이 걸러내야 함)" }],
  imagePlan: [{ position: "도입부", description: "대표 이미지" }],
  notes: "",
};
const review = {
  summary: "모의 검수 결과",
  score: 82,
  issues: [{ type: "fact", severity: "medium", quote: "본문", comment: "출처 필요", suggestion: "출처 추가" }],
  factChecks: [{ claim: "주장", status: "needs_verification", note: "" }],
  ruleChecks: [{ rule: "규칙", passed: true, note: "" }],
};

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
      googleFailOnce = true;
      return send(res, 200, { ok: true });
    }

    // OpenAI Chat Completions
    if (url.pathname === "/v1/chat/completions") {
      if (req.headers.authorization !== "Bearer test-openai") return send(res, 401, { error: { message: "bad key" } });
      if (body.model === "bad-model") return send(res, 404, { error: { message: "The model `bad-model` does not exist" } });
      const content = JSON.stringify(review);
      return send(res, 200, { choices: [{ message: { content } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } });
    }
    if (url.pathname === "/v1/models" && req.headers.authorization) return send(res, 200, { data: [{ id: "gpt-mock-1" }, { id: "gpt-mock-2" }] });

    // Anthropic Messages
    if (url.pathname === "/v1/messages") {
      if (req.headers["x-api-key"] !== "test-anthropic" || !req.headers["anthropic-version"]) return send(res, 401, { error: { message: "bad key" } });
      const isEdit = String(body.system).includes("교정");
      const text = isEdit ? "AI가 다듬은 문장입니다." : "```html\n<h2>모의 소제목</h2><p>Claude 모의 원고 본문.</p><script>alert(1)</script><p onclick=\"x()\">클릭</p>\n```";
      return send(res, 200, { content: [{ type: "text", text }], usage: { input_tokens: 2000, output_tokens: 800 } });
    }

    // Google Gemini generateContent
    const m = url.pathname.match(/^\/v1beta\/models\/(.+):generateContent$/);
    if (m) {
      if (req.headers["x-goog-api-key"] !== "test-google") return send(res, 403, { error: { message: "bad key" } });
      const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
      if (prompt.includes("글감 6개")) {
        const text = JSON.stringify({ ideas: [{ title: "모의 글감 1", keywords: ["k1"], reason: "주제 적합" }, { title: "모의 글감 2", keywords: [], reason: "독자 관심" }] });
        return send(res, 200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 } });
      }
      if (googleFailOnce) {
        googleFailOnce = false;
        return send(res, 503, { error: { message: "overloaded (mock)" } });
      }
      return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 } });
    }
    if (url.pathname === "/v1beta/models") return send(res, 200, { models: [{ name: "models/gemini-mock" }] });

    send(res, 404, { error: { message: "not found" } });
  })
  .listen(PORT, () => console.log(`mock AI server on :${PORT}`));
