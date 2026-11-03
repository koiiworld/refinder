// 7단계 흐름 통합 테스트 (AI·외부 데이터 연결 상태, 모의 서버 사용)
// 1) node tests/mock-ai-server.mjs
// 2) 모의 키·주소로 앱 실행 (README 참고)
// 3) BASE_URL=http://localhost:3000 node --test tests/ai-providers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010";

async function call(path, method = "GET", body, base = BASE) {
  const res = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function waitPost(id, pred, label, timeout = 40000) {
  const t = Date.now();
  let last;
  while (Date.now() - t < timeout) {
    last = (await call(`/api/posts/${id}`)).data;
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`시간 초과: ${label} stage=${last?.project?.stage} status=${last?.project?.status} ${last?.project?.status_message}`);
}
const idle = (b) => b.project.status !== "running" && b.jobs.length === 0;
const mockLog = async () => (await call("/__log", "GET", undefined, MOCK)).data;

let pickIds = [];

test("① 키워드 추천: AI 후보 + 네이버 실제 검색량·연관 키워드·추세, 유튜브·시즌 맥락", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/keywords", "POST", { action: "recommend", blogId: "blog_algokitchen", hint: "겨울" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.provider, "openai", "기본 담당: ChatGPT");
  const picks = (await call("/api/keywords?blogId=blog_algokitchen")).data.filter((p) => p.batch_id === r.data.batch);
  const ai = picks.find((p) => p.keyword === "김장 양념");
  assert.ok(ai.volume && ai.volume.total > 0, "네이버 검색량 부착");
  assert.ok(picks.some((p) => p.origin === "naver_related"), "네이버 연관 키워드 추가");
  assert.ok(ai.trend && ["up", "flat", "down"].includes(ai.trend.dir), "데이터랩 추세");
  const log = await mockLog();
  const prompt = log.find((l) => l.path === "/v1/chat/completions").body.messages.find((m) => m.role === "user").content;
  assert.match(prompt, /유튜브 한국 인기 급상승/);
  assert.match(prompt, /다가오는 시즌/);
  assert.ok(log.some((l) => l.path === "/keywordstool"));
  assert.ok(log.some((l) => l.path === "/search-trend/v1/search"));
  pickIds = picks.filter((p) => p.origin === "ai").slice(0, 2).map((p) => p.id);
});

test("②→③④⑥ 자동 진행: 단계별 담당 AI(ChatGPT 제목·글, Claude 검수)", async () => {
  await call("/api/blogs/blog_algokitchen/samples", "POST", { files: [{ filename: "내글.md", content: "말투마커 입니다." }] });
  await call("/__reset", "POST", undefined, MOCK);
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds });
  assert.equal(c.data.ids.length, 2);
  const b = await waitPost(c.data.ids[0], (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  assert.equal(b.project.plan.selectedTitle, "절임배추 20kg 김장 양념 황금비율", "③ AI가 고른 제목");
  assert.ok(b.project.plan.related.length > 0, "③ 네이버 연관 키워드 참고");
  assert.equal(b.project.plan.ai.provider, "openai");
  assert.equal(b.document.title, "절임배추 20kg 김장 양념 황금비율");
  assert.ok(b.document.content_html.includes("말투반영"), "④ 말투 예시 반영");
  assert.ok(!b.document.content_html.includes("<script"), "④ 위험 태그 제거");
  assert.deepEqual(b.project.package.hashtags, ["김장", "절임배추", "김장양념"], "④ 해시태그 정리");
  assert.equal(b.project.package.images.length, 2, "⑤ 이미지 프롬프트");
  assert.equal(b.project.review.provider, "anthropic", "⑥ Claude 검수");
  assert.equal(b.project.review.score, 88);
  await waitPost(c.data.ids[1], (x) => x.project.stage === "ready" && idle(x), "두 번째 글");
});

test("⑤ 이미지: 버튼으로 Higgsfield 생성 → 본문에 넣기 → ⑥ 다시 검수 시 Claude에 이미지 전달", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  let b = (await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0 })).data;
  assert.ok(b.project.package.images[0].mediaJobId);
  for (let i = 0; i < 6 && !b.project.package.images[0].url; i++) b = (await call(`/api/posts/${id}`)).data;
  assert.equal(b.project.package.images[0].url, "https://cdn.example.com/out.png");
  b = (await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 })).data;
  assert.ok(b.document.content_html.includes('<img src="https://cdn.example.com/out.png"'));
  assert.ok(!b.document.content_html.includes("[이미지 1]"), "자리 표시를 이미지로 교체");
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "rerun", step: "review" });
  b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "재검수");
  assert.equal(b.project.review.imagesSeen, 1);
  const msg = (await mockLog()).find((l) => l.path === "/v1/messages");
  assert.ok(msg.body.messages[0].content.some((c) => c.type === "image" && c.source.url === "https://cdn.example.com/out.png"), "Claude에 이미지 첨부");
});

test("④ 글 다시 쓰기 (수정 요청) · 에디터 부분 수정", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[posts.length - 1].id;
  await call(`/api/posts/${id}`, "POST", { action: "rerun", step: "write", feedback: "더 짧게" });
  const b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "다시 쓰기");
  assert.ok(b.events.some((e) => /다시 실행: 더 짧게/.test(e.message)));
  const e = await call("/api/ai/edit", "POST", { projectId: id, selected: "본문", instruction: "다듬기" });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  assert.equal(e.data.text, "AI가 다듬은 문장입니다.");
});

test("크레딧 없는 AI는 자동으로 다른 AI로 대체", async () => {
  await call("/api/settings", "PUT", { stepAi: { titles: { provider: "openai", model: "no-credit-model" } } });
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "갤럭시 버즈" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const b = await waitPost(c.data.ids[0], (x) => x.project.stage === "ready" && idle(x), "대체 실행");
  assert.equal(b.project.plan.ai.provider, "google", "Gemini가 대신 처리");
  assert.match(b.project.plan.ai.substitutedFor, /ChatGPT/);
  await call("/api/settings", "PUT", { stepAi: { titles: { provider: "openai", model: "gpt-5.4-mini" } } });
});

test("모델 목록 · Higgsfield 연결 확인", async () => {
  assert.deepEqual((await call("/api/ai/models?provider=openai")).data.models, ["gpt-mock-1", "gpt-mock-2"]);
  assert.match((await call("/api/ai/models?provider=higgsfield")).data.note, /인증 성공/);
});
