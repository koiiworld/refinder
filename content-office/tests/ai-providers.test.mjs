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
