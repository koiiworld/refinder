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
/** 담당 AI가 대체되어도(ChatGPT→Gemini 등) 해당 단계 요청의 사용자 프롬프트를 찾음 */
async function stepPrompt(marker) {
  for (const l of [...(await mockLog())].reverse()) {
    const b = l.body ?? {};
    const sys = typeof b.system === "string" ? b.system : b.messages?.find?.((m) => m.role === "system")?.content ?? b.systemInstruction?.parts?.[0]?.text ?? "";
    if (!sys.includes(marker)) continue;
    const u = b.messages?.find?.((m) => m.role === "user")?.content ?? b.contents?.[0]?.parts?.map((p) => p.text ?? "").join("");
    return typeof u === "string" ? u : (u ?? []).filter((x) => x.type === "text").map((x) => x.text).join("");
  }
  return "";
}

let pickIds = [];

test("① 키워드 추천: AI 후보 + 네이버 실제 검색량·연관 키워드·추세, 유튜브·시즌 맥락", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/keywords", "POST", { action: "recommend", blogId: "blog_algokitchen", hint: "겨울" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.provider, "google", "기본 담당: 무료 Gemini");
  const picks = (await call("/api/keywords?blogId=blog_algokitchen")).data.filter((p) => p.batch_id === r.data.batch);
  const ai = picks.find((p) => p.keyword === "김장 양념");
  assert.ok(ai.volume && ai.volume.total > 0, "네이버 검색량 부착");
  assert.ok(picks.some((p) => p.origin === "naver_related"), "네이버 연관 키워드 추가");
  assert.ok(ai.trend && ["up", "flat", "down"].includes(ai.trend.dir), "데이터랩 추세");
  const log = await mockLog();
  assert.ok(!log.some((l) => l.path === "/v1/chat/completions" || l.path === "/v1/messages"), "키워드 추천에 유료 AI 안 씀");
  const prompt = await stepPrompt("SEO 키워드 전문가");
  assert.match(prompt, /유튜브 한국 인기 급상승/);
  assert.match(prompt, /다가오는 시즌/);
  assert.ok(log.some((l) => l.path === "/keywordstool"));
  assert.ok(log.some((l) => l.path === "/search-trend/v1/search"));
  pickIds = picks.filter((p) => p.origin === "ai").slice(0, 2).map((p) => p.id);
});

test("② 여러 키워드 → 글 1개 · ③ 제목 후보에서 대기 → 글 쓰기 → ④⑥ (ChatGPT 제목·글, Claude 검수)", async () => {
  await call("/api/blogs/blog_algokitchen/samples", "POST", { files: [{ filename: "내글.md", content: "말투마커 입니다." }] });
  await call("/__reset", "POST", undefined, MOCK);
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds });
  assert.equal(c.data.ids.length, 1, "고른 키워드들로 글 1개");
  const t = await waitPost(c.data.ids[0], (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  const kws = t.project.topic.split(", ");
  assert.equal(kws.length, 2, "키워드 2개를 한 글로");
  assert.ok(t.project.plan.subKeywords.includes(kws[1]), "두 번째 키워드는 보조 키워드");
  const tp = (await mockLog()).find((l) => l.path === "/v1/chat/completions").body.messages.find((m) => m.role === "user").content;
  assert.ok(tp.includes(t.project.topic), "제목 프롬프트에 고른 키워드 모두 전달");
  assert.ok(!(await mockLog()).some((l) => l.body?.messages?.[0]?.content?.includes?.("전속 작가")), "글 쓰기 전에는 작성 요청 없음");
  await call(`/api/posts/${c.data.ids[0]}`, "POST", { action: "write" });
  const b = await waitPost(c.data.ids[0], (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  assert.equal(b.project.plan.selectedTitle, "절임배추 20kg 김장 양념 황금비율", "③ AI가 고른 제목");
  assert.ok(b.project.plan.related.length > 0, "③ 네이버 연관 키워드 참고");
  assert.equal(b.project.plan.ai.provider, "openai");
  assert.equal(b.document.title, "절임배추 20kg 김장 양념 황금비율");
  assert.ok(b.document.content_html.includes("말투반영"), "④ 말투 예시 반영");
  assert.ok(!b.document.content_html.includes("<script"), "④ 위험 태그 제거");
  assert.deepEqual(b.project.package.hashtags, ["김장", "절임배추", "김장양념"], "④ 해시태그 정리");
  const hl = (await mockLog()).find((l) => JSON.stringify(l.body ?? {}).includes("해시태그 담당자"));
  assert.ok(hl && /generateContent/.test(hl.path), "④ 해시태그는 무료 Gemini가 따로 뽑음");
  assert.doesNotMatch(await stepPrompt("전속 작가"), /hashtags/, "글쓰기(유료)에는 해시태그 요청 없음");
  assert.equal(b.project.package.images.length, 2, "⑤ 이미지 프롬프트");
  assert.equal(b.project.review.provider, "anthropic", "⑥ Claude 검수");
  assert.equal(b.project.review.score, 88);
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

test("③ 제목을 직접 고쳐서 글 쓰기 → 그 제목 그대로 쓰고 AI에게 제목 우선 지시", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "보조배터리" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await waitPost(id, (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  await call("/__reset", "POST", undefined, MOCK);
  const mine = "앤커 프라임 보조배터리 27650 상위 모델 비교, 고속충전 기준 정리";
  await call(`/api/posts/${id}`, "POST", { action: "write", title: mine });
  const b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "직접 고친 제목으로 작성");
  assert.equal(b.document.title, mine, "본문 제목 = 직접 고친 제목");
  assert.equal(b.project.plan.selectedTitle, mine);
  const wp = await stepPrompt("전속 작가");
  assert.ok(wp.includes(`[제목] ${mine}`));
  assert.match(wp, /사용자가 직접 고친 제목입니다/);
});

test("⑥ 검수 지적 '수정 요청' → AI가 해당 부분만 고침 → 다시 검수 권장", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  let b = (await call(`/api/posts/${id}`)).data;
  assert.ok(b.project.review.issues.length >= 1);
  const before = b.document.revision;
  assert.equal((await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [] })).status, 400, "고를 지적 없음");
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [0] });
  b = await waitPost(id, (x) => x.project.status !== "running" && idle(x), "지적 수정");
  assert.equal(b.project.review.issues[0].fixed, true, "수정함 표시");
  assert.equal(b.project.needs_rereview, true, "다시 검수 권장");
  assert.ok(b.document.revision > before, "본문 갱신");
  assert.equal(b.project.stage, "ready");
  const fp = await stepPrompt("검수 지적을 반영해");
  assert.match(fp, /고쳐야 할 검수 지적/);
  assert.match(fp, new RegExp(b.project.review.issues[0].comment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(fp, /관계없는 문장·구성·말투는 그대로/);
});

test("⑥ 검수 지적에 내 코멘트 달기 → 저장 → AI 수정 때 코멘트 우선 반영", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  await call(`/api/posts/${id}`, "POST", { action: "issue_note", index: 0, note: "첫 문장은 질문형으로 바꿔 주세요" });
  let b = (await call(`/api/posts/${id}`)).data;
  assert.equal(b.project.review.issues[0].userNote, "첫 문장은 질문형으로 바꿔 주세요", "코멘트 저장");
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [0], notes: { 0: "도입부를 짧게, 질문형으로" } });
  b = await waitPost(id, (x) => x.project.status !== "running" && idle(x), "코멘트 반영 수정");
  assert.equal(b.project.review.issues[0].userNote, "도입부를 짧게, 질문형으로", "수정 때 보낸 코멘트로 갱신");
  const fp = await stepPrompt("검수 지적을 반영해");
  assert.match(fp, /블로그 주인 코멘트/);
  assert.match(fp, /도입부를 짧게, 질문형으로/);
});

test("⑥ 코멘트 + 글 전체 수정사항 한꺼번에 반영 (글 전체만 적어도 가능)", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  assert.equal((await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [], general: "  " })).status, 400, "아무것도 없으면 거절");
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [0], notes: { 0: "표로 정리해 주세요" }, general: "부모급여 정책 추가해줘" });
  let b = await waitPost(id, (x) => x.project.status !== "running" && idle(x), "한꺼번에 수정");
  let fp = await stepPrompt("검수 지적을 반영해");
  assert.match(fp, /표로 정리해 주세요/);
  assert.match(fp, /글 전체 수정사항[^\n]*\n부모급여 정책 추가해줘/);
  assert.match(fp, /맥락|흐름에 맞는 위치/);
  assert.equal(b.project.review.lastFix.general, "부모급여 정책 추가해줘");
  assert.equal(b.project.review.generalNote, "", "반영 후 칸 비움");
  assert.equal(b.project.needs_rereview, true);
  await call("/__reset", "POST", undefined, MOCK);
  const before = b.document.revision;
  await call(`/api/posts/${id}`, "POST", { action: "fix_issues", indexes: [], general: "마지막 문단은 빼줘" });
  b = await waitPost(id, (x) => x.project.status !== "running" && idle(x), "글 전체만 수정");
  assert.ok(b.document.revision > before, "본문 갱신");
  fp = await stepPrompt("검수 지적을 반영해");
  assert.match(fp, /마지막 문단은 빼줘/);
  assert.doesNotMatch(fp, /\[고쳐야 할 검수 지적\]/);
});

test("④ 수정 요청사항 직접 입력 → AI가 그 내용만 반영", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  assert.equal((await call(`/api/posts/${id}`, "POST", { action: "edit_request", note: "  " })).status, 400, "빈 요청 거절");
  const before = (await call(`/api/posts/${id}`)).data.document.revision;
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "edit_request", note: "재료에 초콜릿 몰드를 추가해 주세요" });
  const b = await waitPost(id, (x) => x.project.status !== "running" && idle(x), "수정 요청 반영");
  assert.ok(b.document.revision > before, "본문 갱신");
  assert.equal(b.project.package.lastEdit.note, "재료에 초콜릿 몰드를 추가해 주세요");
  assert.equal(b.project.stage, "ready");
  const fp = await stepPrompt("검수 지적을 반영해");
  assert.match(fp, /사용자 수정 요청: 재료에 초콜릿 몰드를 추가해 주세요/);
});

test("⑤ Higgsfield 모델 선택: 예상 비용 · 고른 모델의 공식 요청 형식으로 생성", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  await call(`/api/posts/${id}`, "POST", { action: "image_prompt", index: 1, aspect: "2:3" });
  const est = await call(`/api/posts/${id}`, "POST", { action: "estimate_image", index: 1, model: "soul-v2" });
  assert.equal(est.status, 200, JSON.stringify(est.data));
  assert.equal(est.data.usd, 0.006);
  const expect = {
    "soul-v2": ["/higgsfield-ai/soul/v2/standard", { aspect_ratio: "2:3", resolution: "1080p", batch_size: 1 }],
    "qwen-image-3": ["/alibaba/qwen-image-3/text-to-image", { aspect_ratio: "2:3", resolution: "2k", prompt_extend: false }],
    "ideogram-4": ["/ideogram/v4.0", { aspect_ratio: "2:3", rendering_speed: "DEFAULT" }],
    "z-image-turbo": ["/z-image/turbo", { aspect_ratio: "2:3", resolution: "2k", prompt_extend: false }],
  };
  for (const [model, [path, fields]] of Object.entries(expect)) {
    await call("/__reset", "POST", undefined, MOCK);
    const b = (await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 1, model })).data;
    assert.equal(b.project.package.images[1].model, model, `${model} 기억`);
    const req = (await mockLog()).find((l) => l.method === "POST" && l.path === path);
    assert.ok(req, `${model} → ${path}`);
    for (const [k, v] of Object.entries(fields)) assert.equal(req.body[k], v, `${model}.${k}`);
    assert.ok(req.body.prompt.length > 0);
    if (model !== "soul-v2") assert.equal(req.body.batch_size, undefined, `${model}: 없는 필드 안 보냄`);
  }
  // 알 수 없는 모델은 기본(SOUL)으로
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 1, model: "wan-2.6-i2v" });
  assert.ok(!(await mockLog()).some((l) => l.path.startsWith("/wan/")), "영상 모델은 이미지 생성에 안 씀");
});

test("⑤ ChatGPT·Gemini 이미지: 바로 만들어 저장 → 이 사이트 주소로 공개 · 결제 안 된 Gemini는 안내", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  await call(`/api/posts/${id}`, "POST", { action: "image_prompt", index: 0, aspect: "2:3" });
  await call("/__reset", "POST", undefined, MOCK);
  const est = (await call(`/api/posts/${id}`, "POST", { action: "estimate_image", index: 0, model: "openai:gpt-image-2" })).data;
  assert.equal(est.usd, null, "토큰 과금은 금액 대신 안내");
  let b = (await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "openai:gpt-image-2" })).data;
  const url = b.project.package.images[0].url;
  assert.match(url, /\/api\/img\/img_[0-9a-f]{24}\.jpg$/);
  assert.equal(b.project.package.images[0].model, "openai:gpt-image-2");
  const req = (await mockLog()).find((l) => l.path === "/v1/images/generations");
  assert.equal(req.body.model, "gpt-image-2");
  assert.equal(req.body.size, "1024x1536", "2:3 → 세로");
  const img = await fetch(BASE + new URL(url).pathname);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.ok((await img.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(BASE + "/api/img/img_000000000000000000000000.jpg")).status, 404);
  // Gemini
  b = (await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "google:gemini-3.1-flash-image" })).data;
  assert.equal(b.project.package.images[0].model, "google:gemini-3.1-flash-image");
  const g = (await mockLog()).find((l) => l.path.includes("gemini-3.1-flash-image:generateContent"));
  assert.equal(g.body.generationConfig.imageConfig.aspectRatio, "2:3");
  const lite = await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "google:gemini-3.1-flash-lite-image" });
  assert.equal(lite.status, 502);
  assert.match(lite.data.error, /무료 등급에서 쓸 수 없습니다/);
  // 본문에 넣기
  b = (await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 })).data;
  assert.ok(b.document.content_html.includes("/api/img/img_"));
  // 새 Higgsfield 모델 요청 형식
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "recraft-4.1-pro" });
  const rc = (await mockLog()).find((l) => l.path === "/recraft/v4.1/pro/text-to-image");
  assert.ok(rc, "Recraft Pro 경로");
  assert.equal(rc.body.resolution, "2k");
});

test("④ 글 다시 쓰기 (수정 요청) · 에디터 부분 수정", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[posts.length - 1].id;
  // 블로그 주소가 있으면 RSS의 실제 글 목록을 원고 프롬프트에 넣음 ('함께 보면 좋은 글'용)
  await call("/api/blogs/blog_algokitchen", "PUT", { url: "https://blog.naver.com/algo_kitchen" });
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "rerun", step: "write", feedback: "더 짧게" });
  const b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "다시 쓰기");
  assert.ok(b.events.some((e) => /다시 실행: 더 짧게/.test(e.message)));
  const wlog = await mockLog();
  assert.ok(wlog.some((l) => l.path === "/algo_kitchen.xml"), "블로그 RSS 조회");
  const wp = wlog.find((l) => l.path === "/v1/chat/completions" && l.body.messages[0].content.includes("전속 작가")).body.messages.find((m) => m.role === "user").content;
  assert.match(wp, /내 블로그의 실제 글 목록/);
  assert.match(wp, /- 깍두기 담그는 법 & 양념 비율 \| https:\/\/blog\.naver\.com\/algo_kitchen\/224000000002/);
  assert.match(wp, /\| https:\/\/blog\.naver\.com\/algo_kitchen\/224000000001\n/, "주소의 ?fromRss 제거");
  assert.match(wp, /- 김장 준비 · 절임배추 – 정리 \|/, "두 번 인코딩된 기호 풀기");
  assert.ok(!wp.includes("개인정보처리방침"), "안내 페이지 제외");
  const e = await call("/api/ai/edit", "POST", { projectId: id, selected: "본문", instruction: "다듬기" });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  assert.equal(e.data.text, "AI가 다듬은 문장입니다.");
});

test("크레딧 없는 AI는 자동으로 다른 AI로 대체", async () => {
  await call("/api/settings", "PUT", { stepAi: { titles: { provider: "openai", model: "no-credit-model" } } });
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "갤럭시 버즈" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const b = await waitPost(c.data.ids[0], (x) => x.project.stage === "titles" && idle(x), "대체 실행");
  assert.equal(b.project.plan.ai.provider, "google", "Gemini가 대신 처리");
  assert.match(b.project.plan.ai.substitutedFor, /ChatGPT/);
  await call("/api/settings", "PUT", { stepAi: { titles: { provider: "openai", model: "gpt-5.4-mini" } } });
});

test("AI 답이 중간에 잘려도 완성된 항목까지 살려서 사용", async () => {
  await call("/api/settings", "PUT", { stepAi: { keywords: { provider: "google", model: "truncate-model" } } });
  const r = await call("/api/keywords", "POST", { action: "recommend", blogId: "blog_naver_life" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const picks = (await call("/api/keywords?blogId=blog_naver_life")).data.map((p) => p.keyword);
  assert.ok(picks.includes("잘림테스트1") && picks.includes("잘림테스트2"));
  assert.ok(!picks.some((k) => k === "잘림"), "잘린 항목은 버림");
  await call("/api/settings", "PUT", { stepAi: { keywords: { provider: "openai", model: "gpt-5.4-mini" } } });
});

test("말투 예시: 네이버 화면 저장 HTML(본문 없는 바깥 창) → 글 번호로 본문 가져오기 · 글 주소로 가져오기", async () => {
  const outer = `<html><head><title>양배추 두부전 만들기 : 네이버블로그</title></head><body>
    <iframe id="mainFrame" name="mainFrame" src="/PostView.naver?blogId=algo_kitchen&amp;logNo=224458356410&amp;redirect=Dlog&amp;widgetTypeCall=true"></iframe></body></html>`;
  const up = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "양배추 두부전 _ 네이버블로그.html", content: outer }] });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  let list = (await call("/api/blogs/blog_naver_life/samples")).data;
  const a = list.find((s) => s.filename.startsWith("양배추")).content;
  assert.match(a, /알고키친입니다/);
  assert.match(a, /- 양배추 200g/);
  assert.ok(!/카테고리 이웃추가|댓글 3/.test(a), "메뉴·댓글 제외");
  // 본문도 글 번호도 없는 HTML은 안내
  const bad = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "빈.html", content: "<html><head><title>제목만 : 네이버블로그</title></head><body></body></html>" }] });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /글 주소로 가져오기/);
  // 글 주소로 가져오기
  const byUrl = await call("/api/blogs/blog_naver_life/samples", "POST", { url: "https://blog.naver.com/algo_kitchen/224458356410" });
  assert.equal(byUrl.status, 201, JSON.stringify(byUrl.data));
  assert.equal(byUrl.data.title, "양배추 두부전 만들기");
  // 허용하지 않는 주소 차단 (내부망 등)
  const evil = await call("/api/blogs/blog_naver_life/samples", "POST", { url: "http://localhost:4010/__log" });
  assert.equal(evil.status, 400);
  list = (await call("/api/blogs/blog_naver_life/samples")).data;
  for (const s of list) await call(`/api/blogs/blog_naver_life/samples/${s.id}`, "DELETE");
});

test("공식 이미지 방식 블로그: AI 이미지 대신 공식 페이지에서 사진 찾기 → 고르기 → 출처와 함께 본문에", async () => {
  await call("/api/blogs/blog_tistory", "PUT", { image_source: "official" });
  await call("/__reset", "POST", undefined, MOCK);
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "맥 미니" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await waitPost(id, (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  await call(`/api/posts/${id}`, "POST", { action: "write" });
  let b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  const wp = await stepPrompt("전속 작가");
  assert.match(wp, /제조사 공식 홈페이지의 제품 이미지/);
  assert.ok(b.project.package.images.every((im) => im.kind === "official"), "공식 이미지 자리");
  // 공식 페이지에서 후보 찾기 (아이콘·로고 제외, srcset 은 가장 큰 사진)
  b = (await call(`/api/posts/${id}`, "POST", { action: "find_images", index: 0, pageUrl: `${MOCK}/official/mac-mini`, credit: "출처: Apple" })).data;
  const cands = b.project.package.images[0].candidates;
  assert.ok(cands.includes("https://www.apple.com/v/mac-mini/images/meta/mac-mini_og.jpg?2026"), "og:image");
  assert.ok(cands.some((u) => u.endsWith("/hero_large.jpg")), "srcset 큰 사진");
  assert.ok(cands.includes("https://cdn.example.com/ports.webp"), "data-src");
  assert.ok(!cands.some((u) => /logo\.svg|icon_small/.test(u)), "로고·아이콘 제외");
  // 고르기 → 본문에 넣기 (출처 표기 포함)
  await call(`/api/posts/${id}`, "POST", { action: "pick_image", index: 0, url: cands[0], credit: "출처: Apple" });
  b = (await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 })).data;
  assert.ok(b.document.content_html.includes(`<img src="${cands[0].replace(/&/g, "&amp;")}"`), "본문에 공식 이미지");
  assert.ok(b.document.content_html.includes("<p>출처: Apple</p>"), "출처 표기");
  // 잘못된 주소는 거절
  assert.equal((await call(`/api/posts/${id}`, "POST", { action: "pick_image", index: 0, url: "javascript:alert(1)" })).status, 400);
  await call("/api/blogs/blog_tistory", "PUT", { image_source: "ai" });
});

test("주제 중복 피하기: 키워드 추천·제목 추천에 이미 쓴 글 제목(RSS + 앱 기록) 전달", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/keywords", "POST", { action: "recommend", blogId: "blog_algokitchen" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const kp = await stepPrompt("SEO 키워드 전문가");
  assert.match(kp, /이 블로그에 이미 쓴 글 제목/);
  assert.match(kp, /- 깍두기 담그는 법 & 양념 비율/, "RSS 글");
  assert.match(kp, /- 절임배추 20kg 김장 양념 황금비율/, "앱에서 쓴 글");
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_algokitchen", keyword: "굴보쌈" });
  await call("/__reset", "POST", undefined, MOCK);
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds: [add.data.id] });
  await waitPost(c.data.ids[0], (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  const tp = await stepPrompt("SEO 제목 전문가");
  assert.match(tp, /이 블로그에 이미 쓴 글 제목 - 이 글들과 겹치지 않게/);
  assert.match(tp, /- 굴보쌈 황금레시피｜집에서 만드는 법/);
});

test("대시보드 방문자 수: 네이버 블로그 정보 · 티스토리 카운터 공개 숫자 수집", async () => {
  await call("/api/blogs/blog_algokitchen", "PUT", { url: "https://blog.naver.com/algo_kitchen" });
  await call("/api/blogs/blog_tistory", "PUT", { url: `${MOCK}/tistory-home` });
  const v = (await call("/api/dashboard/visits?refresh=1")).data;
  const naver = v.rows.find((r) => r.blog_id === "blog_algokitchen");
  const tis = v.rows.find((r) => r.blog_id === "blog_tistory");
  assert.equal(naver.today, 146);
  assert.equal(naver.total, 979);
  assert.equal(tis.today, 12, "스크립트 안 숫자는 무시");
  assert.equal(tis.total, 1229);
  assert.equal(tis.week, 12 + 31, "어제 방문자도 기록");
  const html = await (await fetch(BASE + "/")).text();
  assert.ok(html.includes("블로그별 방문자 비교"));
  assert.ok(/<td style="text-align:right">43<\/td>/.test(html.replace(/<!-- -->/g, "")), "최근 7일 합");
});

test("크리에이터 어드바이저 캡처 → AI가 검색어 목록을 읽어 줌 (저장은 사용자가)", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  assert.equal((await call("/api/research/creator/image", "POST", { blogId: "blog_algokitchen", images: ["https://x.com/a.png"] })).status, 400, "이미지 파일만");
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/research/creator/image", "POST", { blogId: "blog_algokitchen", images: [png] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.text, /^1 김장 양념 비율\n2 절임배추 ▲3/);
  const log = await mockLog();
  const sent = log.find((l) => JSON.stringify(l.body ?? {}).includes("크리에이터 어드바이저 화면"));
  const raw = JSON.stringify(sent.body);
  assert.ok(raw.includes("iVBORw0KGgo"), "캡처 이미지를 AI에 전달");
  const saved = await call("/api/research/creator", "POST", { blogId: "blog_algokitchen", text: r.data.text });
  assert.equal(saved.data.count, 3);
});

test("트렌드 뷰어: 유튜브 급상승 카드 · 스크랩 추가/해제", async () => {
  const html = (await (await fetch(BASE + "/trends")).text()).replace(/<!-- -->/g, "");
  for (const t of ["트렌드 뷰어", "급상승", "요리", "육아", "IT", "여행", "김장 김치 황금레시피 공개", "1위", "조회 90만회", "글감으로"]) assert.ok(html.includes(t), t);
  for (const gone of ["게임", "스포츠", "뷰티"]) assert.ok(!html.includes(`</span> ${gone}<`), `${gone} 탭 없음`);
  // 요리 탭: 인기 급상승(노하우 카테고리) 중 음식 관련만 + 레시피·먹방 등 검색, 뜨는 속도 순
  await call("/__reset", "POST", undefined, MOCK);
  const food = (await call("/api/trends?c=food")).data;
  assert.equal(food.ranked, "speed");
  assert.ok(!food.videos.some((v) => v.title.includes("캠핑")), "주제와 상관없는 영상 제외");
  assert.ok(food.videos.some((v) => v.group === "급상승") && food.videos.some((v) => v.group === "레시피"));
  for (const g of food.groups) {
    const vs = food.videos.filter((v) => v.group === g);
    assert.ok(vs.every((v, i, a) => i === 0 || a[i - 1].perHour >= v.perHour), `${g}: 시간당 조회수 순`);
  }
  assert.ok(new Set(food.videos.slice(0, food.groups.length).map((v) => v.group)).size > 1, "여러 묶음이 번갈아 위에");
  const searches = (await mockLog()).filter((l) => l.path === "/youtube/v3/search");
  assert.equal(searches.length, 4, "요리 탭 검색 4개");
  // 다시 열면 DB에 저장된 결과 사용 (할당량 절약)
  await call("/__reset", "POST", undefined, MOCK);
  await call("/api/trends?c=food");
  assert.equal((await mockLog()).filter((l) => l.path.startsWith("/youtube/")).length, 0, "6시간 안에는 다시 부르지 않음");
  const kids = (await call("/api/trends?c=kids")).data;
  assert.ok(kids.groups.includes("육아 정책"), JSON.stringify(kids.groups));
  const t = (await call("/api/trends?c=food")).data;
  assert.equal(t.connected, true);
  assert.ok(t.videos.length >= 1);
  const v = t.videos[0];
  assert.equal((await call("/api/trends", "POST", { action: "scrap", item_id: v.id, title: v.title, url: "javascript:alert(1)" })).status, 400, "잘못된 주소 거절");
  const s = await call("/api/trends", "POST", { action: "scrap", item_id: v.id, title: v.title, channel: v.channel, thumbnail: v.thumbnail, url: v.url, views: v.views, category: "요리·뷰티·살림" });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.scraps[0].item_id, v.id);
  const sc = (await (await fetch(BASE + "/trends?tab=scraps")).text()).replace(/<!-- -->/g, "");
  assert.ok(sc.includes(v.title) && sc.includes("스크랩됨"));
  await call("/api/trends", "POST", { action: "unscrap", item_id: v.id });
  assert.equal((await call("/api/trends?scraps=1")).data.length, 0);
});

test("인기 글 분석: 주소로 글 읽기 → 구조 수치 + AI 분석 + 내 블로그 적용 제안(실제 검색량)", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/research/benchmark", "POST", { blogId: "blog_algokitchen", urls: ["https://blog.naver.com/algo_kitchen/224458356410", "http://169.254.169.254/latest/meta-data"] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ok = r.data.fetched.find((f) => !f.error);
  assert.equal(ok.title, "양배추 두부전 만들기");
  assert.ok(ok.stats.chars > 50 && ok.stats.lists === 3 && ok.stats.headings === 1, JSON.stringify(ok.stats));
  assert.ok(r.data.fetched.some((f) => f.error), "허용하지 않는 주소는 읽지 않고 표시");
  assert.equal(r.data.analysis.apply.titleIdeas[0].keyword, "굴보쌈");
  assert.equal(r.data.volumes["굴보쌈"], 10000, "제안 키워드 실제 검색량");
  const bp = await stepPrompt("콘텐츠 전략가");
  assert.match(bp, /소제목 1개, 이미지 \d+장, 목록 줄 3개/);
  assert.match(bp, /방식/);
  const last = (await call("/api/research/benchmark?blogId=blog_algokitchen")).data;
  assert.equal(last.analysis.apply.titleIdeas.length, 1, "마지막 분석 다시 보기");
  assert.equal((await call("/api/research/benchmark", "POST", { blogId: "blog_algokitchen", urls: [] })).status, 400);
});

test("모델 목록 · Higgsfield 연결 확인", async () => {
  assert.deepEqual((await call("/api/ai/models?provider=openai")).data.models, ["gpt-mock-1", "gpt-mock-2"]);
  assert.match((await call("/api/ai/models?provider=higgsfield")).data.note, /인증 성공/);
});

const PIXEL_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

test("📱 캐러셀: 블로그 글에서 만들기 → 장면·후킹·캡션 · 편집 저장 · 내 사진 올리기 · AI 다시 만들기", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/carousels", "POST", { projectId: posts[0].id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let c = (await call(`/api/carousels/${r.data.id}`)).data;
  assert.equal(c.slides[0].kind, "cover");
  assert.equal(c.slides[0].headline, "김밥 옆구리\n안 터지는 법", "줄바꿈 표시 정리");
  assert.equal(c.slides[c.slides.length - 1].kind, "cta");
  assert.equal(c.slides[1].image, null, "없는 사진 번호는 비움");
  assert.deepEqual(c.hashtags, ["김밥", "김밥만들기", "도시락"]);
  assert.equal(c.style.hooks.length, 3, "표지 대안 문구");
  const cp = await stepPrompt("카드뉴스) 카피라이터");
  assert.match(cp, /\[원본 블로그 글/);
  assert.match(cp, /친구 태그/);
  // 편집 저장
  const slides = c.slides.map((s, i) => (i === 0 ? { ...s, headline: "내가 고친 표지" } : s));
  c = (await call(`/api/carousels/${c.id}`, "PUT", { slides, style: { template: "clean", accent: "#123456", handle: "algo" } })).data;
  assert.equal(c.slides[0].headline, "내가 고친 표지");
  assert.equal(c.style.template, "clean");
  assert.equal(c.style.accent, "#123456");
  // 내 사진 올리기 → 이 사이트 주소로 공개 · 캐러셀 사진 주소로 열림
  const up = await call(`/api/carousels/${c.id}`, "POST", { action: "upload", dataUrl: PIXEL_URL });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const img = up.data.carousel.images[up.data.index];
  assert.match(img.url, /^\/api\/img\/img_[0-9a-f]{24}\.jpg$/);
  const res = await fetch(`${BASE}/api/carousels/${c.id}/img/${up.data.index}`, { redirect: "follow" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^image\//);
  // AI 다시 만들기 (수정 요청 반영)
  await call("/__reset", "POST", undefined, MOCK);
  const re = await call(`/api/carousels/${c.id}`, "POST", { action: "regenerate", feedback: "7장으로 줄여줘" });
  assert.equal(re.status, 200, JSON.stringify(re.data));
  assert.match(await stepPrompt("카드뉴스) 카피라이터"), /수정 요청 - 반드시 반영\]\n7장으로 줄여줘/);
  assert.equal(re.data.style.template, "clean", "디자인은 유지");
});

test("📱 캐러셀: 블로그와 별개로 — 저장 잘 되는 주제 추천 → 주제로 만들기", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const i = await call("/api/carousels/ideas", "POST", { niche: "자취 꿀팁" });
  assert.equal(i.status, 200, JSON.stringify(i.data));
  assert.equal(i.data.ideas.length, 2, "빈 주제는 뺌");
  assert.match(await stepPrompt("인스타그램 성장 전략가"), /\[계정 분야\] 자취 꿀팁/);
  const r = await call("/api/carousels", "POST", { topic: i.data.ideas[1].topic, format: i.data.ideas[1].format, niche: "자취 꿀팁" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = (await call(`/api/carousels/${r.data.id}`)).data;
  assert.equal(c.project_id, null);
  assert.equal(c.style.template, "bold", "사진 없는 주제형은 컬러 배경");
  assert.match(await stepPrompt("카드뉴스) 카피라이터"), /\[형식\] ❌⭕ 실수 교정/);
  assert.ok((await call("/api/carousels")).data.length >= 2);
  assert.equal((await call("/api/carousels", "POST", { topic: " " })).status, 400);
});

test("💰 쿠팡파트너스 API 자동 집계 · 애드포스트 캡처 → AI가 수익 읽기", async () => {
  const s = await call("/api/dashboard/revenue/coupang", "POST");
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.krw, 4600, "수익 합계");
  assert.equal(s.data.click, 120);
  assert.equal(s.data.order, 3);
  const rev = (await call("/api/dashboard/revenue")).data;
  const month = Object.keys(rev).sort().pop();
  assert.equal(rev[month].coupang.krw, 4600);
  assert.match(rev[month].coupang.metric, /API 자동 · 클릭 120 · 주문 3/);
  await call("/__reset", "POST", undefined, MOCK);
  const cap = await call("/api/dashboard/revenue/capture", "POST", { channel: "adpost", month, images: [PIXEL_URL] });
  assert.equal(cap.status, 200, JSON.stringify(cap.data));
  assert.equal(cap.data.krw, 12345);
  assert.match(cap.data.metric, /노출/);
  assert.match(await stepPrompt("광고 수익 화면"), /네이버 애드포스트 수익 화면/);
  assert.equal((await call("/api/dashboard/revenue/capture", "POST", { images: [] })).status, 400);
});

test("🩺 블로그 진단: 발행 리듬·제목·검색 누락·키워드 순위 + AI 종합 진단, 마지막 결과 저장", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/diagnose", "POST", { blogId: "blog_algokitchen" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.status, "running", "서버 작업으로 시작");
  let st;
  for (let i = 0; i < 60; i++) {
    st = (await call("/api/diagnose?blogId=blog_algokitchen")).data;
    if (st.state?.status !== "running" && st.last) break;
    await new Promise((x) => setTimeout(x, 500));
  }
  assert.equal(st.state, null, JSON.stringify(st.state));
  const d = st.last;
  const idx = Object.fromEntries(d.metrics.indexed.map((x) => [x.title.slice(0, 3), x]));
  assert.equal(idx["굴보쌈"].found, true);
  assert.equal(idx["굴보쌈"].rank, 2);
  assert.equal(idx["깍두기"].found, false, "검색 누락");
  const check = (label) => d.checks.find((c) => c.label.startsWith(label));
  assert.equal(check("제목 검색 노출").status, "warn");
  assert.match(check("발행 빈도").detail, /최근 30일 2개/);
  assert.ok(d.metrics.ranks.length >= 1, "앱에서 쓴 글 키워드 순위");
  assert.equal(d.metrics.ranks[0].rank, 5);
  assert.equal(d.metrics.ranks[0].docs, 52000);
  assert.equal(d.ai.score, 62);
  assert.match(await stepPrompt("블로그 성장 컨설턴트"), /\[점검표\]/);
  assert.ok(d.at, "마지막 진단 저장");
});

test("📰 블로그 핫이슈: 주제별 글을 반응(공감+댓글×3) 순으로 · 자주 나온 단어 · 1시간 캐시", async () => {
  const res = await fetch(`${BASE}/hot?c=food`);
  assert.equal(res.status, 200);
  const html = await res.text();
  const order = ["굴보쌈 김장 날 메뉴", "김장 양념 황금비율", "김장 김치 담그는 법 후기", "붕어빵 만들기 &amp; 팁"].map((t) => html.indexOf(t));
  assert.ok(order.every((x) => x > 0), "글 표시 · 태그 제거");
  assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[3], "공감 50 > 공감3+댓글9 > 공감10+댓글1 > 1");
  assert.ok(html.includes(`/new?hint=${encodeURIComponent("김장")}`), "자주 나온 단어 '김장' → 키워드 추천");
  assert.ok(!html.includes("머,,") && !html.includes("일상 기록 남겨봐요"), "제목·본문 없는 글, 일상 분야 글은 제외");
  assert.ok(!html.includes("역노화") && !html.includes("1아승기"), "AI가 주제와 무관한 글 제외 · [일상] 글 제외");
  assert.ok(!html.includes(`hint=${encodeURIComponent("후기")}"`), "흔한 말 제외");
  await call("/__reset", "POST", undefined, MOCK);
  await fetch(`${BASE}/hot?c=food`);
  assert.ok(!(await mockLog()).some((l) => l.path === "/ajax/DirectoryPostList.naver"), "1시간 안에는 다시 안 부름");
});

test("📱 캐러셀: 블로그에 올린 글 주소로 만들기 → 글에 올린 사진 그대로 · 다른 글 사진 가져오기", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/carousels", "POST", { url: "https://blog.naver.com/algo_kitchen/224458356410", blogId: "blog_algokitchen" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let c = (await call(`/api/carousels/${r.data.id}`)).data;
  assert.deepEqual(c.images.map((i) => i.url), ["https://postfiles.pstatic.net/MjAy/cabbage1.jpg?type=w966", "https://postfiles.pstatic.net/MjAy/cabbage2.jpg?type=w966"], "본문 사진만, 큰 크기로 · 스티커 제외");
  assert.equal(c.title, "양배추 두부전 만들기");
  const cp = await stepPrompt("카드뉴스) 카피라이터");
  assert.match(cp, /\[원본 블로그 글[\s\S]*양배추는 채 썰고/);
  assert.match(cp, /0: 블로그 사진 1/);
  assert.equal(c.slides[0].image, 0, "표지에 블로그 사진");
  // 이미 있는 사진은 중복으로 안 가져옴
  const again = await call(`/api/carousels/${c.id}`, "POST", { action: "import_images", url: "https://blog.naver.com/algo_kitchen/224458356410" });
  assert.equal(again.status, 502);
  assert.match(again.data.error, /새로 가져올 사진/);
  // 주제형 캐러셀에 블로그 사진 가져오기
  const t = await call("/api/carousels", "POST", { topic: "양배추 요리 모음", format: "save" });
  const imp = await call(`/api/carousels/${t.data.id}`, "POST", { action: "import_images", url: "https://blog.naver.com/algo_kitchen/224458356410" });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.added, 2);
  assert.equal((await call("/api/carousels", "POST", { url: "https://example.com/x" })).status, 400, "허용 안 된 주소");
});

test("📋 글감 추천 리포트: 구글 트렌드·네이버 뉴스·블로그 홈 수집 → AI 검증(근거 없는 추천 제외) → 승인하면 그 기획으로 ③ 제목 추천", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/hot", "POST", { blogId: "blog_algokitchen" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.collected["구글 트렌드"], 2);
  assert.ok(r.data.collected["네이버 뉴스"] >= 1);
  assert.ok(!JSON.stringify(r.data).includes("오래된 뉴스"), "3일 지난 뉴스 제외");
  assert.equal(r.data.items.length, 2, "근거 번호 없는 추천은 뺌");
  const it = r.data.items[0];
  assert.deepEqual(it.sources.map((s) => s.url).slice(0, 1), ["https://news.example.com/kimchi"], "출처 번호 → 원출처 링크");
  assert.equal(it.sources.length, 2, "없는 번호(x99)는 무시");
  const rp = await stepPrompt("블로그 글감 기획자");
  assert.match(rp, /g1: \(구글 트렌드 · .* · 검색 2000\+\) 김장 배추값 — 올해 배추값 'ㄸ?뚝'/);
  assert.match(rp, /\(네이버 뉴스 · .*\) 제철 음식 관련 새 소식 — 요약 "내용"/);
  assert.match(rp, /\(블로그 홈 · .* · 공감 50 · 댓글 0\) 굴보쌈 김장 날 메뉴/);
  // 승인 → ③ 제목 추천(대기)까지, 기획이 제목 프롬프트로 전달
  await call("/__reset", "POST", undefined, MOCK);
  const a = await call("/api/hot", "POST", { action: "approve", reportId: r.data.id, index: 0, keyword: "배추값" });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const p = await waitPost(a.data.projectId, (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  assert.equal(p.project.topic, "배추값", "고친 키워드로");
  assert.equal(p.project.plan.brief.title, it.title, "기획 저장");
  const tp = await stepPrompt("SEO 제목 전문가");
  assert.match(tp, /\[이 글의 기획 - 핫이슈 리포트에서 블로그 주인이 승인한 글감\][\s\S]*추천 제목: 김장 배추값 내렸다/);
  assert.match(tp, /원출처: .*https:\/\/news\.example\.com\/kimchi/);
  // 다시 승인해도 같은 글 · 넘기기
  assert.equal((await call("/api/hot", "POST", { action: "approve", reportId: r.data.id, index: 0 })).data.projectId, a.data.projectId);
  await call("/api/hot", "POST", { action: "skip", reportId: r.data.id, index: 1 });
  const last = (await call("/api/hot?blogId=blog_algokitchen")).data;
  assert.deepEqual(last.items.map((x) => x.status), ["approved", "skipped"]);
  await call("/api/hot", "POST", { action: "restore", reportId: r.data.id, index: 1 });
  assert.equal((await call("/api/hot?blogId=blog_algokitchen")).data.items[1].status, "new", "되살리기");
});

async function waitVideo(id, label, ms = 120_000) {
  const t = Date.now();
  let v;
  while (Date.now() - t < ms) {
    v = (await call(`/api/videos/${id}`)).data;
    if (v.status === "ready" || v.status === "error") return v;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`시간 초과: ${label} ${v?.status} ${v?.message}`);
}

test("🎬 영상공장: 링크 → 받기 → AI가 화면 자막 위치 찾아 지움(원본 보관) → 저장소 · 구간 재생 · 편집본(자르기·9:16·흐리게)", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const r = await call("/api/videos", "POST", { url: "http://localhost:4110/sample.mp4" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const v = await waitVideo(r.data.id, "받기");
  assert.equal(v.status, "ready", v.message);
  assert.equal(v.width, 360);
  assert.equal(v.height, 640);
  assert.ok(Math.abs(v.duration - 3) < 0.5, String(v.duration));
  assert.equal(v.info.subsRemoved, true, "자막 지움");
  assert.equal(v.info.subBoxes.length, 1);
  assert.ok(Math.abs(v.info.subBoxes[0].y - 0.788) < 0.01, JSON.stringify(v.info.subBoxes));
  assert.ok(v.original_path, "자막 있는 원본도 보관");
  const fp = await stepPrompt("영상 프레임에서");
  assert.match(fp, /box_2d/);
  // 파일: 전체 · 구간(Range) · 썸네일
  const f = await fetch(`${BASE}/api/videos/${v.id}/file`);
  assert.equal(f.status, 200);
  assert.equal(f.headers.get("content-type"), "video/mp4");
  assert.equal(Number(f.headers.get("content-length")), v.size);
  const part = await fetch(`${BASE}/api/videos/${v.id}/file`, { headers: { range: "bytes=0-99" } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${BASE}/api/videos/${v.id}/file?kind=thumb`)).headers.get("content-type"), "image/jpeg");
  // 편집본
  const e = await call(`/api/videos/${v.id}`, "POST", { action: "edit", opts: { start: 0.5, end: 2, aspect: "9:16", mode: "blur", boxes: [{ x: 0.1, y: 0.8, w: 0.8, h: 0.1 }], mute: true } });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  const ev = await waitVideo(e.data.id, "편집");
  assert.equal(ev.status, "ready", ev.message);
  assert.equal(ev.kind, "edit");
  assert.equal(ev.parent_id, v.id);
  assert.equal(ev.width, 1080);
  assert.equal(ev.height, 1920);
  assert.ok(Math.abs(ev.duration - 1.5) < 0.4, String(ev.duration));
  assert.ok((await call("/api/videos")).data.videos.some((x) => x.id === ev.id));
  // 지우기 · 잘못된 링크
  assert.equal((await call(`/api/videos/${ev.id}`, "DELETE")).status, 200);
  assert.equal((await fetch(`${BASE}/api/videos/${ev.id}/file`)).status, 404);
  assert.equal((await call("/api/videos", "POST", { url: "영상" })).status, 400);
  const bad = await call("/api/videos", "POST", { url: "http://localhost:4110/no-such-video" });
  const bv = await waitVideo(bad.data.id, "실패");
  assert.equal(bv.status, "error");
  assert.match(bv.message, /영상을 받지 못했어요/);
});

test("📱 캐러셀 목록: 블로그 글별 공감·댓글 표시 · 반응 많은 순", async () => {
  const html = await (await fetch(`${BASE}/carousels?blog=blog_algokitchen`)).text();
  assert.ok(html.includes("❤️ <!-- -->40") || html.includes("❤️ 40"), "공감 수 표시");
  const a = html.indexOf("깍두기 담그는 법"), b = html.indexOf("김장 준비"), c = html.indexOf("굴보쌈 황금레시피");
  assert.ok(a > 0 && b > 0 && c > 0, "글 목록");
  assert.ok(a < b && b < c, "공감 40 > 9 > 3 순서");
});

test("🏆 블로그 인기 글 TOP 10: 반응 순위(공개 숫자) · 통계 캡처 → AI가 조회수 순위 읽어 저장", async () => {
  let t = (await call("/api/dashboard/top?blogId=blog_algokitchen")).data;
  assert.equal(t.views.day.source, "none");
  assert.deepEqual(t.reaction.map((r) => r.likes), [40, 9, 3], "공감·댓글 많은 순");
  assert.match(t.reaction[0].url, /^https:\/\/blog\.naver\.com\/algo_kitchen\/224000000002$/);
  await call("/__reset", "POST", undefined, MOCK);
  const s = await call("/api/dashboard/top", "POST", { blogId: "blog_algokitchen", images: [PIXEL_URL] });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.deepEqual(s.data.items.map((i) => [i.rank, i.title, i.views]), [[1, "굴보쌈", 3300], [2, "깍두기 담그는 법", 1204]], "조회수 순 · 빈 제목 제외");
  assert.equal(s.data.kind, "day");
  t = (await call("/api/dashboard/top?blogId=blog_algokitchen")).data;
  assert.equal(t.views.day.label, "최근 7일");
  assert.equal(t.views.week.source, "sum", "주간 캡처가 없으면 일간 캡처를 합침");
  assert.equal(t.views.week.items[0].views, 3300);
  assert.equal(t.dailyCaptures, 1);
  assert.match(await stepPrompt("블로그 통계 화면"), /크리에이터 어드바이저[\s\S]*kind: 화면의 기간 단위/);
  // 같은 날 다시 넣으면 교체 · 주간 캡처를 따로 넣으면 그것을 씀
  await call("/api/dashboard/top", "POST", { blogId: "blog_algokitchen", images: [PIXEL_URL] });
  assert.equal((await call("/api/dashboard/top?blogId=blog_algokitchen")).data.dailyCaptures, 1, "같은 날은 하나로");
  await call("/api/dashboard/top", "POST", { blogId: "blog_algokitchen", images: [PIXEL_URL], kind: "week" });
  t = (await call("/api/dashboard/top?blogId=blog_algokitchen")).data;
  assert.equal(t.views.week.source, "capture");
});

test("💳 AI별 잔액: 충전 기록 − 앱에서 쓴 금액 = 남은 잔액 · 사용률", async () => {
  let b = (await call("/api/dashboard/balances")).data;
  const oa = b.find((x) => x.id === "openai");
  assert.equal(oa.charged, null, "충전 기록 없으면 비움");
  assert.ok(oa.used > 0 && oa.calls > 0, "앱에서 쓴 금액");
  assert.equal((await call("/api/dashboard/balances", "POST", { provider: "openai", usd: -1 })).status, 400);
  b = (await call("/api/dashboard/balances", "POST", { provider: "openai", usd: 10, at: "2020-01-01" })).data;
  const o2 = b.find((x) => x.id === "openai");
  assert.equal(o2.charged, 10);
  assert.ok(Math.abs(o2.remaining - (10 - o2.used)) < 1e-9);
  assert.ok(o2.rate > 0 && o2.rate < 1);
  const hf = b.find((x) => x.id === "higgsfield");
  assert.ok(hf.used > 0, "Higgsfield는 생성 때 받은 예상 금액으로");
  b = (await call("/api/dashboard/balances", "POST", { provider: "higgsfield", actual: 0.06 })).data;
  assert.equal(b.find((x) => x.id === "higgsfield").used, 0.06, "실제 사용액으로 맞춤");
  b = (await call("/api/dashboard/balances", "POST", { provider: "higgsfield", actual: null })).data;
  assert.ok(b.find((x) => x.id === "higgsfield").used !== 0.06, "맞춤 해제");
  b = (await call("/api/dashboard/balances", "POST", { provider: "openai", remove: 0 })).data;
  assert.equal(b.find((x) => x.id === "openai").charged, null);
});

test("📱 캐러셀 콘텐츠 유형 4가지(장수·구성) · 표지 문구 다시 받기", async () => {
  const t = await call("/api/carousels", "POST", { topic: "전기요금 아끼는 법", format: "money" });
  const id = t.data.id;
  assert.match(await stepPrompt("카드뉴스) 카피라이터"), /\[콘텐츠 유형\] 일반 정보형 — 7~9장 \(기본 8장\)[\s\S]*02 문제 제기\(공감 유도\)/, "기본은 일반 정보형 8장 구성");
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/carousels/${id}`, "PUT", { style: { contentType: "compare" } });
  await call(`/api/carousels/${id}`, "POST", { action: "regenerate" });
  assert.match(await stepPrompt("카드뉴스) 카피라이터"), /\[콘텐츠 유형\] 비교·분석·체크리스트 — 8~12장/);
  const h = await call(`/api/carousels/${id}`, "POST", { action: "hooks" });
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.deepEqual(h.data.style.hooks, ["새 표지 A", "새 표지 B", "새 표지 C"]);
  assert.equal(h.data.style.contentType, "compare", "유형 유지");
  assert.match(await stepPrompt("표지 카피라이터"), /이미 나온 후보 - 겹치지 않게/);
  // 유형 바꾸기: 처음은 AI로, 다시 돌아가면 저장된 것 불러오기(AI 호출 없음)
  const tip = await call(`/api/carousels/${id}`, "POST", { action: "switch_type", type: "tip" });
  assert.equal(tip.data.reused, false);
  const edited = tip.data.slides.map((s, i) => (i === 0 ? { ...s, headline: "꿀팁 버전 표지" } : s));
  await call(`/api/carousels/${id}`, "POST", { action: "switch_type", type: "compare", slides: edited });
  await call("/__reset", "POST", undefined, MOCK);
  const back = await call(`/api/carousels/${id}`, "POST", { action: "switch_type", type: "tip" });
  assert.equal(back.data.reused, true, "다시 고르면 불러오기");
  assert.equal(back.data.slides[0].headline, "꿀팁 버전 표지", "고친 내용도 그대로");
  assert.equal(back.data.style.contentType, "tip");
  assert.ok(!(await mockLog()).some((l) => JSON.stringify(l.body ?? {}).includes("카피라이터")), "AI 호출 없음");
});

test("🔑 대시보드 키워드 TOP 5: 블로그 고르기 ▼ · 그 블로그 키워드만 · 아직 안 쓴 것도", async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert.ok(html.includes('aria-label="블로그 고르기"'), "블로그 고르기");
  assert.ok(html.includes("김장 양념") || html.includes("절임배추"), "알고키친 키워드");
});

test("🎬 영상 스튜디오: 프롬프트 → AI 기획 → 캐릭터(Gemini) → 장면 이미지(캐릭터 참고) → 장면 영상(Higgsfield) → 합치기 → 영상공장", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  const c = await call("/api/studio", "POST", { prompt: "감자 캐릭터가 감튀 만드는 릴스", seconds: 15, style: "3d", imageModel: "google:gemini-3.1-flash-image" });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const id = c.data.id;
  let s = (await call(`/api/studio/${id}`)).data;
  assert.equal(s.scenes.length, 3);
  assert.equal(s.character.name, "포테");
  assert.deepEqual(s.plan.hashtags, ["감튀", "에어프라이어"]);
  assert.match(await stepPrompt("쇼츠 기획 PD"), /장면 3개 \(장면당 5초\)/);
  // 캐릭터 → 장면 이미지는 캐릭터 그림을 참고로 넣음
  s = (await call(`/api/studio/${id}`, "POST", { action: "character" })).data;
  assert.match(s.character.image.url, /^\/api\/img\/img_[0-9a-f]{24}\.jpg$/);
  await call("/__reset", "POST", undefined, MOCK);
  s = (await call(`/api/studio/${id}`, "POST", { action: "scene_image", index: 0 })).data;
  assert.ok(s.scenes[0].image.url);
  const g = (await mockLog()).find((l) => /generateContent/.test(l.path) && l.body?.generationConfig?.responseModalities?.includes("IMAGE"));
  assert.ok(g.body.contents[0].parts[0].inlineData, "캐릭터 그림을 참고 이미지로");
  assert.equal(g.body.generationConfig.imageConfig.aspectRatio, "9:16");
  // 예상 비용 → 장면 영상(공개 주소로 이미지 전달)
  const e = (await call(`/api/studio/${id}`, "POST", { action: "estimate" })).data;
  assert.ok(e.perClip > 0 && e.count === 3, JSON.stringify(e));
  await call("/__reset", "POST", undefined, MOCK);
  s = (await call(`/api/studio/${id}`, "POST", { action: "scene_clip", index: 0 })).data;
  assert.ok(s.scenes[0].video.jobId);
  const hf = (await mockLog()).find((l) => l.path === "/wan/v2.6/image-to-video");
  assert.match(hf.body.image_url, /^https:\/\/app\.example\.test\/api\/img\/img_/);
  assert.equal(hf.body.duration, 5);
  for (let i = 0; i < 10 && !s.scenes[0].video.url; i++) s = (await call(`/api/studio/${id}`)).data;
  assert.ok(s.scenes[0].video.url, "영상 완성");
  // 합치기: 영상 장면 + 이미지만 있는 장면(확대 효과), 이미지 없는 장면은 건너뜀
  await call(`/api/studio/${id}`, "POST", { action: "scene_image", index: 1 });
  s = (await call(`/api/studio/${id}`, "POST", { action: "render" })).data;
  assert.equal(s.status, "rendering");
  for (let i = 0; i < 120 && s.status === "rendering"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    s = (await call(`/api/studio/${id}`)).data;
  }
  assert.equal(s.status, "done", s.message);
  const v = (await call(`/api/videos/${s.video_id}`)).data;
  assert.equal(v.kind, "studio");
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  assert.ok(Math.abs(v.duration - 8) < 1, String(v.duration)); // 시험 영상 3초 + 사진 장면 5초
});

test("⚠️ 고장 알림: 방문자 수집이 3번 연속 실패하면 대시보드에 '점검 필요' · 다시 성공하면 사라짐", async () => {
  await call("/__break?visits=1", "GET", undefined, MOCK);
  for (let i = 0; i < 3; i++) await call("/api/dashboard/visits?refresh=1");
  let h = (await call("/api/dashboard/health")).data;
  const v = h.find((x) => x.id === "visits");
  assert.ok(v, JSON.stringify(h));
  assert.equal(v.fix, "code");
  assert.equal(v.fails, 3);
  const html = await (await fetch(`${BASE}/`)).text();
  assert.ok(html.includes("점검이 필요한 기능") && html.includes("블로그 방문자 수 수집"), "대시보드에 표시");
  await call("/__break?visits=0", "GET", undefined, MOCK);
  await call("/api/dashboard/visits?refresh=1");
  h = (await call("/api/dashboard/health")).data;
  assert.ok(!h.some((x) => x.id === "visits"), "다시 성공하면 사라짐");
});

test("✅ 발행 준비 판정: 지금 원고 기준 · 재검수 필요 · 근거 확인 · 이미지 자리(앱/직접) · 진행 목록 표시", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  let b = (await call(`/api/posts/${id}`)).data;
  // 모의 검수는 'fact' 지적 1건(low) → 근거 확인 필요
  const html1 = await (await fetch(`${BASE}/posts`)).text();
  assert.ok(html1.includes("손볼 곳이 있어요"), "진행 목록에 손볼 곳 그룹");
  assert.ok(html1.replace(/<!-- -->/g, "").includes("근거 확인 필요"), "근거 확인 사유");
  // 코멘트에 원문 출처 주소를 붙이면 해결
  await call(`/api/posts/${id}`, "POST", { action: "issue_note", index: 0, note: "출처: https://www.gov.kr/abc" });
  // 이미지 자리: 하나는 직접 넣기로
  b = (await call(`/api/posts/${id}`)).data;
  const n = b.project.package.images.length;
  for (let i = 0; i < n; i++) await call(`/api/posts/${id}`, "POST", { action: "image_manual", index: i, manual: true });
  b = (await call(`/api/posts/${id}`)).data;
  assert.ok(b.project.package.images.every((im) => im.manual), "직접 넣기 표시 저장");
  const html2 = (await (await fetch(`${BASE}/posts`)).text()).replace(/<!-- -->/g, "");
  assert.ok(/수동 발행 준비|발행 준비 완료/.test(html2), "근거 연결·이미지 직접 넣기면 발행 준비");
});

test("🎯 매출 목표: 정하면 달성률·남은 금액 · 다음 달은 지난 목표 이어서", async () => {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  assert.equal((await call("/api/dashboard/revenue", "PUT", { month, goal: 100000 })).status, 200);
  const html = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");
  assert.ok(html.includes("이번 달 매출 목표") && html.includes("₩100,000"), "목표 표시");
  assert.match(html, /\d+%<\/b> 달성/, "달성률");
  await call("/api/dashboard/revenue", "PUT", { month, goal: 0 });
});

test("💾 저장 안전성: 직접 수정 → 다시 열기 → 늦게 도착한 저장은 막힘 → 이전 버전 되돌리기 → 재검수 필요", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  const d0 = (await call(`/api/projects/${id}/document`)).data;
  await call(`/api/projects/${id}/versions`, "POST", { label: "테스트 기준" });
  // 창 A 저장
  const a = await call(`/api/projects/${id}/document`, "PUT", { html: "<p>창 A에서 고친 글</p>", title: d0.title, revision: d0.revision });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  // 다시 열면 최신
  const d1 = (await call(`/api/projects/${id}/document`)).data;
  assert.equal(d1.content_html, "<p>창 A에서 고친 글</p>");
  assert.equal(d1.revision, d0.revision + 1);
  // 창 B(옛 revision)의 늦은 저장은 막힘 → 최신 수정본 유지
  const b = await call(`/api/projects/${id}/document`, "PUT", { html: "<p>창 B 옛 내용</p>", title: d0.title, revision: d0.revision });
  assert.equal(b.status, 409);
  assert.equal((await call(`/api/projects/${id}/document`)).data.content_html, "<p>창 A에서 고친 글</p>", "덮어쓰지 않음");
  // 버전 목록 → 기준 버전으로 되돌리기
  const vs = (await call(`/api/projects/${id}/versions`)).data;
  const base = vs.find((v) => v.label === "테스트 기준");
  assert.ok(base, JSON.stringify(vs.map((v) => v.label)));
  const r = await call(`/api/projects/${id}/versions/${base.id}`, "POST");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d2 = (await call(`/api/projects/${id}/document`)).data;
  assert.equal(d2.content_html, d0.content_html, "기준 버전 내용으로");
  assert.ok(d2.revision > d1.revision);
  const vs2 = (await call(`/api/projects/${id}/versions`)).data;
  assert.ok(vs2.some((v) => /되돌리기 전/.test(v.label)), "되돌리기 전 원고도 남김");
  const p = (await call(`/api/posts/${id}`)).data.project;
  assert.equal(p.needs_rereview, true, "재검수 필요");
  const html = (await (await fetch(`${BASE}/posts`)).text()).replace(/<!-- -->/g, "");
  assert.ok(html.includes("재검수 필요"), "진행 목록에 재검수 필요");
  // 다른 글 버전으로는 못 되돌림
  const other = (await call("/api/posts")).data.find((x) => x.id !== id && x.blog_id !== "blog_algokitchen");
  if (other) assert.equal((await call(`/api/projects/${other.id}/versions/${base.id}`, "POST")).status, 400, "다른 글 버전 차단");
});
