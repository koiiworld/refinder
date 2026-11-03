// 개발·테스트용 모의 AI 서버: OpenAI / Anthropic / Google 공식 API의 요청·응답 형식을 흉내 냅니다.
// 실제 API 키 없이 앱의 'AI 연결됨' 경로(요청 형식, 응답 파싱, 재시도, 토큰·비용 기록)를 검증합니다.
// 사용법: node tests/mock-ai-server.mjs  (기본 포트 4010)
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const log = [];
let googleFailOnce = true;
const hfJobs = new Map();

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

    // Higgsfield (이미지·영상)
    if (url.pathname.startsWith("/v1/text2image") || url.pathname.startsWith("/higgsfield-ai/") || url.pathname.startsWith("/wan/") || url.pathname.startsWith("/requests/")) {
      if (req.headers.authorization !== "Key test-id:test-secret") return send(res, 401, { detail: "Invalid credentials" });
      if (url.pathname === "/v1/text2image/soul-styles") return send(res, 200, [{ id: "s1", name: "Mock style" }]);
      if (req.method === "POST" && (url.pathname === "/higgsfield-ai/soul/standard" || url.pathname === "/wan/v2.6/image-to-video")) {
        const id = "req" + (hfJobs.size + 1);
        hfJobs.set(id, { polls: 0, video: url.pathname.startsWith("/wan/"), body, idem: req.headers["idempotency-key"] });
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
      const sys = body.systemInstruction?.parts?.[0]?.text ?? "";
      if (sys.includes("프롬프트 엔지니어")) {
        const refined = { prompt: "Close-up of a golden Korean rolled omelette, gentle steam rising, slow dolly-in, soft window light.", promptKo: "황금빛 계란말이 클로즈업, 김이 피어오름", negative: "hands, morphing, text", changes: ["영어로 변환", "카메라 지정"], questions: ["영상 길이는?"], settings: ["9:16, 8초"] };
        return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(refined) }] } }], usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 250 } });
      }
      if (prompt.includes("시즌 키워드 8~12개")) {
        const text = JSON.stringify({ keywords: [{ keyword: "김장 양념 황금비율", intent: "방법형", angle: "10포기 기준 양념 계량", timing: "D-21~D-7" }, { keyword: "절임배추 고르는 법", intent: "정보형", angle: "주문 시 체크리스트", timing: "D-14" }] });
        return send(res, 200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 300 } });
      }
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
