// AI 연결 경로 통합 테스트 (모의 AI 서버 필요)
// 1) node tests/mock-ai-server.mjs
// 2) 아래 환경 변수로 앱 실행:
//    OPENAI_API_KEY=test-openai ANTHROPIC_API_KEY=test-anthropic GOOGLE_AI_API_KEY=test-google
//    OPENAI_BASE_URL=http://localhost:4010 ANTHROPIC_BASE_URL=http://localhost:4010 GOOGLE_AI_BASE_URL=http://localhost:4010
// 3) BASE_URL=http://localhost:3000 node --test tests/ai-providers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010";

async function call(path, method = "GET", body, base = BASE) {
  const res = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function waitFor(id, pred, label, timeout = 30000) {
  const t = Date.now();
  let last;
  while (Date.now() - t < timeout) {
    last = (await call(`/api/projects/${id}`)).data;
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`시간 초과: ${label} stage=${last?.project?.stage} status=${last?.project?.status} ${last?.project?.status_message}`);
}
const idle = (b) => b.project.status !== "running" && b.jobs.length === 0;

test("3사 AI 역할 배정대로 호출되고, 오류 재시도·출처 필터·HTML 정화·비용이 동작한다", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  await call("/api/settings", "PUT", { pricing: { "anthropic:claude-sonnet-5-5": { input: 3, output: 15 } } });
  const c = await call("/api/projects", "POST", { blogId: "blog_tistory", title: "AI 경로 테스트", autoApproveTopic: true, urls: [] });
  const id = c.data.id;

  // 기획(Gemini): 첫 호출 503 → 작업 큐가 자동 재시도
  let b = await waitFor(id, (x) => x.project.stage === "plan_approval" && idle(x), "기획");
  assert.equal(b.project.plan.selectedTitle, "모의 제목 A");
  assert.equal(b.project.plan.sources.length, 0, "AI가 지어낸 출처 URL은 제거");
  const planRuns = b.runs.filter((r) => r.purpose === "plan");
  assert.ok(planRuns.some((r) => r.status === "failed" && /503/.test(r.error)), "실패 시도 기록");
  assert.ok(planRuns.some((r) => r.status === "succeeded" && r.provider === "google"), "재시도 성공");

  // 원고(Claude) → 검수(ChatGPT) 자동 연결
  await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  b = await waitFor(id, (x) => x.project.stage === "draft_approval" && idle(x), "원고·검수");
  assert.ok(b.document.content_html.includes("Claude 모의 원고"));
  assert.ok(!b.document.content_html.includes("<script"), "script 제거");
  assert.ok(!b.document.content_html.includes("onclick"), "이벤트 속성 제거");
  assert.ok(!b.document.content_html.includes("```"), "코드펜스 제거");
  assert.equal(b.project.review.provider, "openai");
  assert.equal(b.project.review.score, 82);
  const draftRun = b.runs.find((r) => r.purpose === "draft");
  assert.equal(draftRun.input_tokens, 2000);
  assert.ok(Math.abs(draftRun.cost_usd - (2000 * 3 + 800 * 15) / 1e6) < 1e-6, "비용 = 단가 × 토큰");

  // 존재하지 않는 모델로 재검수 → 재시도하지 않고 오류 표시, 다른 AI로 재실행 가능
  await call(`/api/projects/${id}/actions`, "POST", { action: "rereview", provider: "openai", model: "bad-model" });
  b = await waitFor(id, (x) => idle(x) && x.project.status === "error", "오류");
  assert.match(b.project.status_message, /bad-model/);
  await call(`/api/projects/${id}/actions`, "POST", { action: "rerun", step: "review", provider: "openai", model: "gpt-mock-1" });
  b = await waitFor(id, (x) => idle(x) && x.project.status !== "error", "재실행");
  assert.equal(b.project.stage, "draft_approval");

  // 선택 부분 AI 수정 (결과만 반환, 원고는 그대로)
  const before = b.document.content_html;
  const e = await call("/api/ai/edit", "POST", { projectId: id, selected: "Claude 모의 원고 본문.", instruction: "다듬기" });
  assert.equal(e.status, 200);
  assert.equal(e.data.text, "AI가 다듬은 문장입니다.");
  b = (await call(`/api/projects/${id}`)).data;
  assert.equal(b.document.content_html, before, "적용 전에는 원고 불변");

  // 요청 형식 검증
  const log = (await call("/__log", "GET", undefined, MOCK)).data;
  const anth = log.find((l) => l.path === "/v1/messages");
  assert.equal(anth.headers["anthropic-version"], "2023-06-01");
  assert.ok(anth.body.max_tokens > 0 && anth.body.system && anth.body.messages[0].role === "user");
  const oai = log.find((l) => l.path === "/v1/chat/completions");
  assert.deepEqual(oai.body.response_format, { type: "json_object" });
  const goo = log.find((l) => l.path.endsWith(":generateContent"));
  assert.equal(goo.body.generationConfig.responseMimeType, "application/json");
});

test("AI 글감 추천은 제목·키워드·이유만 저장하고 수치 지표는 없다", async () => {
  const r = await call("/api/ideas/suggest", "POST", { blogId: "blog_algokitchen", hint: "겨울" });
  assert.equal(r.status, 200);
  const t = Date.now();
  let ideas = [];
  while (Date.now() - t < 15000) {
    ideas = (await call("/api/ideas?blogId=blog_algokitchen")).data.filter((i) => i.origin === "ai");
    if (ideas.length >= 2) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ideas.length >= 2);
  assert.match(ideas[0].origin_detail, /검색량 데이터 없음/);
});

test("모델 목록 API", async () => {
  const r = await call("/api/ai/models?provider=openai");
  assert.deepEqual(r.data.models, ["gpt-mock-1", "gpt-mock-2"]);
});

test("프롬프트 수정실: Gemini로 Higgsfield 영상 프롬프트를 다듬고 추가 수정 요청을 반영", async () => {
  const r = await call("/api/prompts", "POST", { target: "higgsfield", kind: "visual", media: "video", text: "맛있는 계란말이 영상", goal: "릴스" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.current.prompt, /rolled omelette/);
  assert.equal(r.data.current.negative, "hands, morphing, text");
  assert.equal(r.data.versions[0].source, "ai");
  assert.equal(r.data.versions[0].provider, "google");
  const again = await call(`/api/prompts/${r.data.id}`, "POST", { action: "refine", feedback: "세로 9:16" });
  assert.equal(again.data.versions.length, 2);
  assert.equal(again.data.versions[1].feedback, "세로 9:16");
  // 글 원고(Claude 대상)는 negative 를 비움
  const w = await call("/api/prompts", "POST", { target: "claude", kind: "writing", text: "레시피 글 써줘" });
  assert.equal(w.data.current.negative, "");
  assert.equal(w.data.current.promptKo, "", "한국어 프롬프트는 해석 불필요");
});

test("Higgsfield: 연결 확인, 이미지 생성→완료, 그 이미지로 영상 생성, 요청 형식", async () => {
  const conn = await call("/api/ai/models?provider=higgsfield");
  assert.equal(conn.status, 200, JSON.stringify(conn.data));
  assert.match(conn.data.note, /인증 성공/);
  const p = await call("/api/prompts", "POST", { target: "higgsfield", kind: "visual", media: "video", text: "계란말이 영상" });
  const pid = p.data.id;
  // 영상은 시작 이미지 없으면 거부
  const bad = await call("/api/media", "POST", { model: "wan-2.6-i2v", promptId: pid, prompt: "x" });
  assert.equal(bad.status, 400);
  const img = await call("/api/media", "POST", { model: "soul-standard", promptId: pid, prompt: "omelette", aspect_ratio: "9:16", resolution: "1080p" });
  assert.equal(img.status, 201, JSON.stringify(img.data));
  assert.equal(img.data.status, "queued");
  let j = img.data;
  for (let i = 0; i < 5 && j.status !== "completed"; i++) j = (await call(`/api/media/${j.id}`)).data;
  assert.equal(j.status, "completed");
  assert.deepEqual(j.urls, ["https://cdn.example.com/out.png"]);
  const vid = await call("/api/media", "POST", { model: "wan-2.6-i2v", promptId: pid, prompt: "steam rising", image_url: j.urls[0], duration: 10, negative_prompt: "hands" });
  let v = vid.data;
  for (let i = 0; i < 5 && v.status !== "completed"; i++) v = (await call(`/api/media/${v.id}`)).data;
  assert.deepEqual(v.urls, ["https://cdn.example.com/out.mp4"]);
  assert.equal(v.media, "video");
  const list = await call(`/api/media?promptId=${pid}`);
  assert.equal(list.data.length, 2);
  // 요청 형식: 공식 문서 스키마대로 전송, 인증 헤더·Idempotency-Key 포함
  const log = (await call("/__log", "GET", undefined, MOCK)).data;
  const soul = log.find((l) => l.path === "/higgsfield-ai/soul/standard");
  assert.deepEqual(soul.body, { prompt: "omelette", aspect_ratio: "9:16", resolution: "1080p", batch_size: 1, enhance_prompt: false });
  assert.ok(soul.headers["idempotency-key"]);
  const wan = log.find((l) => l.path === "/wan/v2.6/image-to-video");
  assert.deepEqual(wan.body, { prompt: "steam rising", image_url: "https://cdn.example.com/out.png", duration: 10, resolution: "720p", negative_prompt: "hands" });
});

test("말투 예시 파일이 AI 요청에 포함되고, '사용' 해제 시 빠진다", async () => {
  await call("/api/blogs/blog_tistory/samples", "POST", { files: [{ filename: "내글.md", content: "말투마커XYZ 입니다. 저는 이렇게 씁니다." }] });
  const projects = (await call("/api/projects?blogId=blog_tistory")).data;
  const pid = projects[0].id;
  await call("/__reset", "POST", undefined, MOCK);
  const e1 = await call("/api/ai/edit", "POST", { projectId: pid, selected: "문장", instruction: "다듬기" });
  assert.equal(e1.status, 200, JSON.stringify(e1.data));
  let log = (await call("/__log", "GET", undefined, MOCK)).data;
  let msg = log.find((l) => l.path === "/v1/messages");
  assert.ok(msg.body.messages[0].content.includes("말투마커XYZ"), "예시가 프롬프트에 포함");
  assert.ok(msg.body.messages[0].content.includes('<sample file="내글.md">'));
  const s = (await call("/api/blogs/blog_tistory/samples")).data[0];
  await call(`/api/blogs/blog_tistory/samples/${s.id}`, "PATCH", { enabled: false });
  await call("/__reset", "POST", undefined, MOCK);
  await call("/api/ai/edit", "POST", { projectId: pid, selected: "문장", instruction: "다듬기" });
  log = (await call("/__log", "GET", undefined, MOCK)).data;
  msg = log.find((l) => l.path === "/v1/messages");
  assert.ok(!msg.body.messages[0].content.includes("말투마커XYZ"), "사용 해제 시 제외");
});

test("마케팅 달력: AI 시즌 키워드 도출 → 중복 없이 저장 → 글감으로 보내기", async () => {
  const r = await call("/api/marketing/keywords", "POST", { action: "derive", blogId: "blog_algokitchen", year: 2026, eventKey: "kimjang", hint: "초보" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.added, 2);
  const again = await call("/api/marketing/keywords", "POST", { action: "derive", blogId: "blog_algokitchen", year: 2026, eventKey: "kimjang" });
  assert.equal(again.data.added, 0, "같은 키워드는 다시 저장하지 않음");
  const d = (await call("/api/marketing?year=2026&blogId=blog_algokitchen")).data;
  const kws = d.keywords.filter((k) => k.event_key === "kimjang");
  assert.equal(kws.length, 2);
  assert.equal(kws[0].source, "ai");
  const s = await call("/api/marketing/keywords", "POST", { action: "to-ideas", blogId: "blog_algokitchen", year: 2026, eventKey: "kimjang", ids: kws.map((k) => k.id) });
  assert.equal(s.data.created, 2);
  const ideas = (await call("/api/ideas?blogId=blog_algokitchen")).data.filter((i) => i.origin === "ai" && /마케팅 달력/.test(i.origin_detail));
  assert.ok(ideas.length >= 2);
  assert.match(ideas[0].origin_detail, /검색량 데이터 없음/);
  // 프롬프트에 블로그 분야 출발 키워드가 들어감
  const log = (await call("/__log", "GET", undefined, MOCK)).data;
  const g = log.filter((l) => l.path.endsWith(":generateContent")).map((l) => l.body.contents[0].parts[0].text).find((t) => t.includes("시즌 키워드"));
  assert.ok(g.includes("김장 김치 담그는 법"));
});

test("네이버 검색광고: HMAC 서명, 5개씩 나눠 조회, 띄어쓰기 제거, '< 10' 처리, 연관 키워드, 7일 캐시", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const kws = ["김장 양념 비율", "절임배추", "김치냉장고", "수육", "굴겉절이", "액젓"];
  const r = await call("/api/research/keywords", "POST", { keywords: kws, withRelated: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const s = r.data.stats["김장 양념 비율"];
  assert.equal(s.keyword, "김장양념비율");
  assert.equal(s.pc, 1200);
  assert.equal(s.total, 10000);
  assert.equal(s.compIdx, "높음");
  const rel = r.data.related.find((x) => x.keyword === "김장양념레시피");
  assert.equal(rel.pc, 0);
  assert.equal(rel.lt10, true);
  assert.equal(rel.total, 320);
  let log = (await call("/__log", "GET", undefined, MOCK)).data.filter((l) => l.path === "/keywordstool");
  assert.equal(log.length, 2, "6개 키워드 → 5개 + 1개 두 번 호출");
  // 캐시: 다시 조회하면 API 호출 없음
  await call("/__reset", "POST", undefined, MOCK);
  const again = await call("/api/research/keywords", "POST", { keywords: ["절임배추"] });
  assert.equal(again.data.stats["절임배추"].total, 10001);
  log = (await call("/__log", "GET", undefined, MOCK)).data.filter((l) => l.path === "/keywordstool");
  assert.equal(log.length, 0, "7일 이내 값은 저장값 사용");
  const cache = await call("/api/research/keywords", "POST", { keywords: ["김장 양념 비율", "없는키워드"], cacheOnly: true });
  assert.ok(cache.data.stats["김장 양념 비율"]);
  assert.ok(!cache.data.stats["없는키워드"]);
});

test("YouTube: 인기 급상승·키워드 검색, 자주 나온 단어 집계", async () => {
  const t = await call("/api/research/youtube?mode=trending&category=26");
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.equal(t.data.videos.length, 3);
  assert.equal(t.data.videos[0].views, 900000);
  assert.deepEqual(t.data.terms[0], { term: "김장", videos: 2 });
  const log = (await call("/__log", "GET", undefined, MOCK)).data.find((l) => l.path === "/youtube/v3/videos");
  assert.ok(log);
  const s = await call(`/api/research/youtube?q=${encodeURIComponent("김장")}`);
  assert.equal(s.data.videos[0].id, "s1", "조회수 순 정렬");
});
