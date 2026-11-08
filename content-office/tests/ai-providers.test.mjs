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
  assert.ok(!picks.some((p) => p.keyword === "가습기"), "블로그 분야와 무관(fit:false)한 키워드는 뺌");
  assert.match(prompt, /분야와 상관없는 단어 자체/);
  // 대시보드 TOP 5 에서 ✕ 빼기 (같은 키워드의 아직 안 쓴 추천 전부)
  const d = await call("/api/keywords", "POST", { action: "dismiss_keyword", blogId: "blog_algokitchen", keyword: "절임 배추" });
  assert.ok(d.data.count >= 1, "띄어쓰기 달라도 같은 키워드");
  assert.ok(!(await call("/api/keywords?blogId=blog_algokitchen")).data.some((p) => p.keyword === "절임배추"), "목록에서 빠짐");
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
  // ✂️ 캡처한 영역 이미지도 함께 보냄 · 생각하는 모델(gpt-5)은 답 한도를 넉넉히
  await call("/__reset", "POST", undefined, MOCK);
  const e2 = await call("/api/ai/edit", "POST", { projectId: id, selected: "본문 문단", instruction: "표 아래에 기준일 메모", image: PIXEL_URL, provider: "openai", model: "gpt-5" });
  assert.equal(e2.status, 200, JSON.stringify(e2.data));
  const oa = (await mockLog()).find((l) => l.path === "/v1/chat/completions");
  assert.ok(oa.body.max_completion_tokens >= 12000, "gpt-5 답 한도 넉넉히");
  assert.ok(JSON.stringify(oa.body.messages).includes("image_url"), "캡처 이미지 첨부");
  assert.match(JSON.stringify(oa.body.messages), /첨부한 캡처/);
  // 표·여러 문단은 HTML 로 보내고 HTML 로 받음 (표가 문단으로 풀리지 않게)
  const e3 = await call("/api/ai/edit", "POST", { projectId: id, selected: "기존 지원 아동수당", html: "<table><tbody><tr><th>기존 지원</th><th>2027년 정부 개편안</th></tr><tr><td>아동수당</td><td>아동기본수당</td></tr></tbody></table>", instruction: "합계 행 추가하고 기준일 메모", image: PIXEL_URL });
  assert.equal(e3.status, 200, JSON.stringify(e3.data));
  assert.equal(e3.data.html, true);
  assert.match(e3.data.text, /^<table>[\s\S]*<td>합계<\/td>[\s\S]*<\/table><p>※ 2026년 11월 기준<\/p>$/, "코드블록 표시 벗기고 표 그대로");
  assert.match(await stepPrompt("블로그 원고 편집자"), /\[수정할 부분 - HTML\][\s\S]*<table>/);
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
  // 💡 고치는 법 · 📈 유입 전략 (따라 할 순서와 실제 예시)
  assert.equal(d.ai.fixes[0].check, "제목 검색 노출");
  assert.ok(d.ai.fixes[0].steps.length >= 2 && /→/.test(d.ai.fixes[0].examples[0]));
  assert.equal(d.ai.growth.length, 2);
  assert.match(await stepPrompt("블로그 성장 컨설턴트"), /따라 할 수 있게[\s\S]*growth: 조회수·유입을 늘리는 방법/);
  // 이번 주 할 일 문구 고치기 저장
  assert.deepEqual((await call("/api/diagnose", "POST", { blogId: "blog_algokitchen", next: ["주 3회 발행 (월·수·금)", " ", "굴보쌈 이어 쓰기"] })).data.next, ["주 3회 발행 (월·수·금)", "굴보쌈 이어 쓰기"]);
  const pgd = (await (await fetch(`${BASE}/diagnose?blog=blog_algokitchen`)).text()).replace(/<!-- -->/g, "");
  assert.ok(pgd.includes("조회수·유입 늘리기") && pgd.includes("주 3회 발행 (월·수·금)") && pgd.includes("고치는 법"), "진단 화면");
  // 🔄 한 줄만 다시 진단하기 (수치만 다시 잼 · AI 안 씀)
  await call("/__reset", "POST", undefined, MOCK);
  const rc = await call("/api/diagnose", "POST", { blogId: "blog_algokitchen", recheck: "발행 빈도" });
  assert.equal(rc.status, 200, JSON.stringify(rc.data));
  assert.equal(rc.data.check.label, "발행 빈도");
  assert.ok(rc.data.at);
  assert.ok(!(await mockLog()).some((l) => /generateContent|chat\/completions|\/v1\/messages/.test(l.path)), "AI 안 씀");
  const last = (await call("/api/diagnose?blogId=blog_algokitchen")).data.last;
  assert.ok(last.rechecked["발행 빈도"], "다시 잰 시각 저장");
  assert.equal(last.ai.score, 62, "AI 종합 진단은 그대로");
  assert.equal((await call("/api/diagnose", "POST", { blogId: "blog_tistory", recheck: "발행 빈도" })).status, 400, "진단 전에는 안 됨");
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
  assert.ok(!(await call("/api/videos")).data.videos.some((x) => x.id === ev.id), "지우면 휴지통으로 (목록에서 빠짐)");
  assert.equal((await call("/api/trash", "POST", { action: "purge", ids: [ev.id] })).data.count, 1);
  assert.equal((await fetch(`${BASE}/api/videos/${ev.id}/file`)).status, 404, "휴지통에서 완전 삭제하면 파일도 지워짐");
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
  // 📅 일간 날짜 고르기 · 기간 지정 합계
  const cday = t.captureDays[0];
  assert.match(cday, /^\d{4}-\d{2}-\d{2}$/, "캡처한 날짜 목록");
  const dd = (await call(`/api/dashboard/top?blogId=blog_algokitchen&day=${cday}`)).data;
  assert.equal(dd.items[0].views, 3300);
  assert.equal(dd.day, cday);
  assert.equal((await call("/api/dashboard/top?blogId=blog_algokitchen&day=2001-01-01")).data.source, "none", "캡처 없는 날");
  const rg = (await call(`/api/dashboard/top?blogId=blog_algokitchen&from=${cday.slice(0, 8)}01&to=${cday}`)).data;
  assert.equal(rg.source, "sum");
  assert.equal(rg.items[0].views, 3300);
  assert.match(rg.label, /일간 캡처 1일치 합계/);
  assert.equal((await call("/api/dashboard/top?blogId=blog_algokitchen&from=2020-01-01&to=2026-01-01")).status, 400, "1년 넘는 기간");
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
  assert.ok(html.includes("⚠️점검필요") && html.includes("점검 필요 1개"), "대시보드 버튼에 숫자 표시");
  assert.ok(!html.includes("+ 글 만들기"), "대시보드에서 글 만들기 버튼은 빠짐");
  await call("/__break?visits=0", "GET", undefined, MOCK);
  await call("/api/dashboard/visits?refresh=1");
  h = (await call("/api/dashboard/health")).data;
  assert.ok(!h.some((x) => x.id === "visits"), "다시 성공하면 사라짐");
  const html2 = await (await fetch(`${BASE}/`)).text();
  assert.ok(html2.includes("점검 필요 0개"), "문제 없으면 0");
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

const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const kstDate = (addDays = 0) => new Date(kstNow().getTime() + addDays * 86400000).toISOString().slice(0, 10);
const kstTime = (addMin) => new Date(kstNow().getTime() + addMin * 60000).toISOString().slice(11, 16);
/** 지금+N분의 한국 날짜 (자정 넘어가면 다음 날) */
const kstDateAt = (addMin) => new Date(kstNow().getTime() + addMin * 60000).toISOString().slice(0, 10);
const tgSends = async () => (await mockLog()).filter((l) => l.path === "/bottest-tg-token/sendMessage");

test("✅ 할 일: 대시보드 🚨오늘할일🚨 → 오늘 탭 · 추가·다시 열기·예정·완료·수정·삭제 (한국 날짜)", async () => {
  const home = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");
  assert.ok(home.includes("🚨오늘할일🚨") && !home.includes('href="/todos?tab=today"'), "대시보드 버튼 (팝업)");
  const t1 = await call("/api/todos", "POST", { title: "김장 레시피 사진 고르기", due_date: kstDate(0), blog_id: "blog_algokitchen" });
  assert.equal(t1.status, 200, JSON.stringify(t1.data));
  const t2 = (await call("/api/todos", "POST", { title: "다음 주 글감 정리", due_date: kstDate(3) })).data;
  assert.equal((await call("/api/todos", "POST", { title: " " })).status, 400);
  assert.equal((await call("/api/todos", "POST", { title: "x", due_time: "25:99" })).status, 400);
  // 다시 열기
  let today = (await call("/api/todos?tab=today")).data;
  assert.ok(today.some((t) => t.title === "김장 레시피 사진 고르기" && t.blog_name === "네이버 알고키친"));
  assert.ok(!today.some((t) => t.id === t2.id), "미래는 예정 탭");
  assert.ok((await call("/api/todos?tab=upcoming")).data.some((t) => t.id === t2.id));
  const page = (await (await fetch(`${BASE}/todos?tab=today`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes("김장 레시피 사진 고르기"), "오늘 탭 화면");
  const home2 = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");
  assert.ok(home2.includes("오늘 할 일 1개") && home2.includes("김장 레시피 사진 고르기"), "대시보드 팝업용 오늘 할 일 목록");
  // 완료 → 완료 탭, 되돌리기
  await call(`/api/todos/${t1.data.id}`, "PUT", { done: true });
  assert.ok((await call("/api/todos?tab=done")).data.some((t) => t.id === t1.data.id));
  assert.ok(!(await call("/api/todos?tab=today")).data.some((t) => t.id === t1.data.id));
  await call(`/api/todos/${t1.data.id}`, "PUT", { done: false, title: "김장 사진 고르기(수정)" });
  today = (await call("/api/todos?tab=today")).data;
  assert.ok(today.some((t) => t.title === "김장 사진 고르기(수정)"));
  await call(`/api/todos/${t2.id}`, "DELETE");
  assert.ok(!(await call("/api/todos?tab=upcoming")).data.some((t) => t.id === t2.id));
});

test("🔔 텔레그램 알림: 서버 예약 · 시간 변경 시 갱신 · 완료/삭제/끄기 취소 · 재시도해도 한 번만 · 과거 시각 예약 안 함", async () => {
  // 지난 시각 → 예약 안 함
  const past = (await call("/api/todos", "POST", { title: "지난 알림", due_date: kstDate(-1), due_time: "09:00", notify: true })).data;
  assert.equal(past.notify, true);
  let row = (await call("/api/todos?tab=today")).data.find((t) => t.id === past.id);
  assert.equal(row.notice, null, "지난 시각은 예약 없음");
  // 2분 뒤 → 예약, 시간 바꾸면 새 예약(이전은 취소)
  const t = (await call("/api/todos", "POST", { title: "알림 시험", due_date: kstDateAt(120), due_time: kstTime(120), notify: true })).data;
  row = (await call("/api/todos?tab=today")).data.find((x) => x.id === t.id) ?? (await call("/api/todos?tab=upcoming")).data.find((x) => x.id === t.id);
  assert.equal(row.notice.status, "pending");
  await call(`/api/todos/${t.id}`, "PUT", { due_date: kstDateAt(180), due_time: kstTime(180) });
  // 끄기 → 취소, 다시 켜기 → 예약, 완료 → 취소
  await call(`/api/todos/${t.id}`, "PUT", { notify: false });
  await call(`/api/todos/${t.id}`, "PUT", { notify: true });
  await call(`/api/todos/${t.id}`, "PUT", { done: true });
  await call(`/api/todos/${t.id}`, "DELETE");
  // 곧 울릴 알림 (1분 뒤 이내로 시각을 맞춤): 텔레그램이 한 번 실패해도 재시도 후 1번만 발송
  await call("/__reset", "POST", undefined, MOCK);
  await call("/__tgfail?n=1", "GET", undefined, MOCK);
  const soon = (await call("/api/todos", "POST", { title: "곧 울림", due_date: kstDate(0), due_time: kstTime(0), notify: true, blog_id: "blog_algokitchen" })).data;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const st = (await call("/api/todos?tab=today")).data.find((x) => x.id === soon.id)?.notice?.status;
    if (st === "sent" || st === "failed") break;
  }
  await new Promise((r) => setTimeout(r, 2000)); // 그 뒤에 또 보내지 않는지
  const all = (await mockLog()).filter((l) => l.path === "/bottest-tg-token/sendMessage" && l.body?.text?.includes("곧 울림"));
  assert.equal(all.length, 2, "실패 1번 + 성공 1번");
  row = (await call("/api/todos?tab=today")).data.find((x) => x.id === soon.id);
  assert.equal(row.notice.status, "sent", JSON.stringify(row.notice));
  assert.match(all[1].body.text, /곧 울림[\s\S]*네이버 알고키친/);
  assert.equal(String(all[1].body.chat_id), "987654");
  // 이전에 만든(취소된) 알림은 하나도 안 감
  assert.ok(!(await tgSends()).some((l) => /알림 시험|지난 알림/.test(l.body?.text ?? "")), "취소된 예약은 발송 안 됨");
  // 설정 도우미: 채팅 ID 찾기 (메시지 안 보냄)
  const f = await call("/api/telegram", "POST", { action: "find_chat" });
  assert.deepEqual(f.data.chats, [{ id: "987654", name: "민" }]);
  assert.equal(f.data.bot.username, "test_office_bot", "토큰의 봇 확인");
});

test("💡📅 아이디어·달력: 김장철 → 김치 보관 글감 저장 → 아이디어에서 할 일·글 기획으로 (AI 호출 없음) · 선거는 비정기 · 발행 예정일", async () => {
  await call("/__reset", "POST", undefined, MOCK);
  // 김장철이 있는 11월 달력
  const y = new Date().getUTCFullYear();
  const nov = (await call(`/api/calendar?m=${y}-11`)).data;
  const kimjang = nov.find((e) => e.cat === "season" && e.title === "김장철");
  assert.ok(kimjang, JSON.stringify(nov.map((e) => e.title)));
  assert.ok(kimjang.seeds.length > 0 && kimjang.link.startsWith("https://search.naver.com"));
  // 이번 달: 선거일 = 비정기, 공휴일 = 공식
  const ym = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  let cur = (await call(`/api/calendar?m=${ym}`)).data;
  assert.equal(cur.find((e) => e.title === "국회의원선거일")?.cat, "irregular");
  assert.equal(cur.find((e) => e.title === "시험공휴일")?.cat, "official");
  // 직접 추가한 갑작스런 행사
  const add = await call("/api/calendar", "POST", { title: "재보궐선거", start: `${ym}-15`, kind: "irregular", link: "https://www.nec.go.kr" });
  assert.equal(add.status, 200);
  // 발행 예정일 → 내 발행
  const post = (await call("/api/posts")).data.find((p) => p.blog_id === "blog_algokitchen" && p.stage !== "published");
  await call(`/api/posts/${post.id}`, "POST", { action: "publish_date", date: `${ym}-25` });
  cur = (await call(`/api/calendar?m=${ym}`)).data;
  assert.ok(cur.some((e) => e.title === "재보궐선거" && e.cat === "irregular" && e.custom));
  assert.ok(cur.some((e) => e.cat === "publish" && e.postId === post.id && e.start === `${ym}-25`));
  const page = (await (await fetch(`${BASE}/calendar?m=${ym}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes("비정기 행사") && page.includes("재보궐선거") && page.includes("업무 일정"), "달력 화면");
  const novPage = (await (await fetch(`${BASE}/calendar?m=${y}-11`)).text()).replace(/<!-- -->/g, "");
  const decPage = (await (await fetch(`${BASE}/calendar?m=${y}-12`)).text()).replace(/<!-- -->/g, "");
  assert.ok(novPage.includes("김장철 시작") && novPage.includes("cal-dot") && decPage.includes("김장철 끝"), "기간 행사: 시작·끝 날만 글자, 사이엔 점");
  // 김장철 → 김치 보관 글감으로 저장 (달력에서 누르는 것과 같은 요청)
  const idea = (await call("/api/ideas", "POST", { memo: "김장철 → 김치 보관 글감", blog_id: "blog_algokitchen", link: kimjang.link, source: `calendar:${kimjang.id}` })).data;
  assert.equal((await call("/api/ideas", "POST", { memo: " " })).status, 400);
  const ideasPage = (await (await fetch(`${BASE}/ideas?open=${idea.id}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(ideasPage.includes("김장철 → 김치 보관 글감") && ideasPage.includes("할 일 만들기"), "다시 열기(편집 상태로 열림)");
  await call(`/api/ideas/${idea.id}`, "PUT", { memo: "김장철 → 김치 보관법 글감 (김치냉장고 온도)" });
  assert.equal((await call(`/api/ideas/${idea.id}`)).data.memo, "김장철 → 김치 보관법 글감 (김치냉장고 온도)");
  assert.equal((await call(`/api/ideas/${idea.id}`)).data.category, "blog", "블로그를 고르면 분류 = 블로그");
  // 분류·세부: 인스타 + 릴스 / 기타 + 직접 입력 / 블로그가 아니면 blog_id 비움
  const reel = (await call("/api/ideas", "POST", { memo: "김치 담그기 릴스", category: "insta", detail: "릴스", blog_id: "blog_algokitchen" })).data;
  assert.equal(reel.category, "insta");
  assert.equal(reel.detail, "릴스");
  assert.equal(reel.blog_id, null);
  const etc = (await call("/api/ideas", "POST", { memo: "뉴스레터 첫 호", category: "etc", detail: "뉴스레터" })).data;
  assert.equal(etc.category, "etc");
  assert.equal(etc.detail, "뉴스레터");
  const ip = (await (await fetch(`${BASE}/ideas`)).text()).replace(/<!-- -->/g, "");
  assert.ok(ip.includes("인스타 · 릴스") && ip.includes("기타 · 뉴스레터") && ip.includes('aria-label="분류"') && ip.includes('aria-label="세부"'), "아이디어 화면 분류·세부");
  await call(`/api/ideas/${reel.id}`, "DELETE");
  await call(`/api/ideas/${etc.id}`, "DELETE");
  // 할 일 만들기: 아이디어 내용이 할 일 화면에 채워짐 → 레시피 사진 고르기 등록
  const todoPage = (await (await fetch(`${BASE}/todos?tab=today&title=${encodeURIComponent("레시피 사진 고르기")}&blog=blog_algokitchen&idea=${idea.id}&memo=${encodeURIComponent("참고: " + kimjang.link)}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(todoPage.includes("아이디어에서 넘어온 내용") && todoPage.includes("레시피 사진 고르기"), "할 일 화면에 채움");
  const t = (await call("/api/todos", "POST", { title: "레시피 사진 고르기", blog_id: "blog_algokitchen", idea_id: idea.id })).data;
  assert.equal(t.idea_id, idea.id);
  // 글 기획으로 보내기: /new 화면만 열고 AI는 부르지 않음
  const r = await fetch(`${BASE}/new?blog=blog_algokitchen&hint=${encodeURIComponent("김치 보관법")}`);
  assert.equal(r.status, 200);
  await new Promise((x) => setTimeout(x, 500));
  const ai = (await mockLog()).filter((l) => /chat\/completions|\/v1\/messages|generateContent/.test(l.path));
  assert.equal(ai.length, 0, "아이디어 저장·이동만으로 AI 호출 없음");
});

test("📋 기획안 승인: 제목 → 목차·근거·이미지 계획 → 고쳐서 승인 → 그 기획안대로 글 · 누르기 전 모델·예상 비용", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_algokitchen", keyword: "굴보쌈 레시피" });
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await waitPost(id, (x) => x.project.stage === "titles" && idle(x), "제목 대기");
  const est = (await call(`/api/posts/${id}`, "POST", { action: "estimate" })).data;
  assert.equal(est.outline.steps[0].model, "gpt-5.4-mini");
  assert.deepEqual(est.write.steps.map((s) => s.key), ["write", "hashtags", "review"], "자동으로 이어질 단계");
  assert.ok(est.write.total > 0);
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "outline", title: "굴보쌈 집에서 만드는 법" });
  let b = await waitPost(id, (x) => x.project.plan?.outline && idle(x), "기획안");
  assert.equal(b.project.stage, "titles");
  assert.equal(b.project.plan.outline.approved, false);
  assert.equal(b.project.plan.selectedTitle, "굴보쌈 집에서 만드는 법");
  assert.ok(!(await mockLog()).some((l) => JSON.stringify(l.body ?? {}).includes("전속 작가")), "승인 전엔 글 안 씀");
  const list = (await (await fetch(`${BASE}/posts`)).text()).replace(/<!-- -->/g, "");
  assert.ok(list.includes("내 승인 필요"), "진행 목록: 내 승인 필요");
  // 🔎 '확인 필요' 사실을 AI가 확인 (네이버 검색 + 무료 Gemini): 1번 확인완료(출처 채움·확인 필요 해제), 2번 확인안됨
  const draft = { ...b.project.plan.outline, claims: [b.project.plan.outline.claims[0], { claim: "굴은 하루 10kg 먹어도 된다", evidence: "", source: "", check: true }] };
  const v = (await call(`/api/posts/${id}`, "POST", { action: "verify_claims", outline: draft, indexes: [0, 1] })).data;
  const vc = v.project.plan.outline.claims;
  assert.equal(vc[0].verify.status, "verified");
  assert.equal(vc[0].source, "https://news.example.com/kimchi");
  assert.equal(vc[0].check, false, "확인완료면 '확인 필요' 해제");
  assert.equal(vc[1].verify.status, "unverified");
  assert.equal(vc[1].check, true);
  assert.match(v.notice, /확인완료 1개 · 확인안됨 1개/);
  assert.equal(v.project.plan.outline.approved, false, "확인만 하고 승인은 안 함");
  // 목차도 같은 방식: 확인 필요 → AI 확인 (주장 1개 + 목차 1개 → 결과 순서대로)
  const draft2 = { ...v.project.plan.outline, claims: [vc[1]], sections: v.project.plan.outline.sections.map((x, k) => (k === 0 ? { ...x, check: true } : x)) };
  const v2 = (await call(`/api/posts/${id}`, "POST", { action: "verify_claims", outline: draft2, indexes: [0], sectionIndexes: [0] })).data;
  assert.equal(v2.project.plan.outline.claims[0].verify.status, "verified");
  assert.equal(v2.project.plan.outline.sections[0].verify.status, "unverified", "목차 확인 결과");
  assert.equal(v2.project.plan.outline.sections[0].check, true);
  // 💬 확인사항별 코멘트: '공식 자료로' → 개인 블로그 근거는 확인안됨, 공식 사이트 근거는 확인완료 · 코멘트 저장
  const o3 = v2.project.plan.outline;
  const draft3 = { ...o3, claims: [{ ...o3.claims[0], comment: "공식 자료로 다시 확인해줘" }, { ...o3.claims[0], claim: "식약처 기준 냉장 보관", comment: "공식 자료로" }] };
  const v3 = (await call(`/api/posts/${id}`, "POST", { action: "verify_claims", outline: draft3, indexes: [0, 1] })).data;
  const c3 = v3.project.plan.outline.claims;
  assert.equal(c3[0].verify.status, "unverified", "개인 블로그 근거는 인정 안 함");
  assert.match(c3[0].verify.note, /공식 자료에서 확인되지 않았어요/);
  assert.equal(c3[0].comment, "공식 자료로 다시 확인해줘", "코멘트 저장");
  assert.equal(c3[1].verify.status, "verified");
  assert.equal(c3[1].source, "https://www.mfds.go.kr/x");
  assert.match(await stepPrompt("꼼꼼한 한국어 팩트체커"), /사용자 코멘트\(반드시 지켜서 판단\): 공식 자료로 다시 확인해줘[\s\S]*공식 자료\(정부/);
  // 고쳐서 승인 (체크해서 지운 주장은 글에 안 씀, 따로 보관)
  const outline = { ...b.project.plan.outline, sections: [{ heading: "굴 손질부터 보쌈까지", points: ["굴 씻는 법"] }, ...b.project.plan.outline.sections.slice(1), { heading: "지운 목차", points: ["안 씀"], removed: true }], claims: [{ ...b.project.plan.outline.claims[0], source: "https://www.nifs.go.kr" }, { ...vc[1], removed: true }] };
  await call(`/api/posts/${id}`, "POST", { action: "approve_outline", outline });
  b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "글·검수");
  assert.equal(b.project.plan.outline.approved, true);
  assert.equal(b.project.plan.outline.claims.length, 1, "지운 주장 빠짐");
  assert.equal(b.project.plan.outline.removed[0].claim, "굴은 하루 10kg 먹어도 된다");
  assert.ok(!(await stepPrompt("전속 작가")).includes("10kg"), "지운 주장은 글에 안 들어감");
  assert.equal(b.project.plan.outline.removedSections[0].heading, "지운 목차");
  assert.ok(!(await stepPrompt("전속 작가")).includes("지운 목차"), "지운 목차는 글에 안 들어감");
  const wp = await stepPrompt("전속 작가");
  assert.match(wp, /\[승인된 기획안[\s\S]*1\. 굴 손질부터 보쌈까지/);
  assert.match(wp, /출처: https:\/\/www\.nifs\.go\.kr/);
});

test("🖼 이미지 교체 → 같은 자리에 들어감(중복 없음) · 재검수 필요 · 같은 글로 캐러셀: 사진·순서·문구·캡션 고쳐 저장 · 사진 파일로 열림", async () => {
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[posts.length - 1].id;
  let b = (await call(`/api/posts/${id}`)).data;
  const n = b.project.package.images.length;
  assert.ok(n >= 1);
  await call(`/api/posts/${id}`, "POST", { action: "image_manual", index: 0, manual: false });
  // 첫 이미지 넣기
  assert.equal((await call(`/api/posts/${id}`, "POST", { action: "pick_image", index: 0, url: "http://localhost:4110/img/old.jpg" })).status, 200);
  await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 });
  let html = (await call(`/api/projects/${id}/document`)).data.content_html;
  assert.ok(html.includes('src="http://localhost:4110/img/old.jpg"'), "첫 이미지");
  assert.ok(!/\[이미지\s*1\]/.test(html), "자리 표시 대신 이미지");
  // 기존 이미지로 교체 → 같은 자리, 중복 없음
  await call(`/api/posts/${id}`, "POST", { action: "pick_image", index: 0, url: "http://localhost:4110/img/new.jpg" });
  await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 });
  const html2 = (await call(`/api/projects/${id}/document`)).data.content_html;
  assert.ok(html2.includes('src="http://localhost:4110/img/new.jpg"'), "새 이미지");
  assert.ok(!html2.includes("old.jpg"), "옛 이미지는 빠짐");
  assert.equal((html2.match(/new\.jpg/g) ?? []).length, 1, "한 번만");
  assert.equal(html2.indexOf("new.jpg") > 0 && html2.length - html.length < 40 && html2.length - html.length > -40, true, "본문 끝에 덧붙이지 않음 (같은 자리 교체)");
  b = (await call(`/api/posts/${id}`)).data;
  assert.equal(b.project.needs_rereview, true, "이미지 바꾸면 재검수 필요");
  assert.ok((await call(`/api/projects/${id}/versions`)).data.some((v) => /이미지 1 넣기 전/.test(v.label)), "넣기 전 원고 버전");
  // 같은 원고로 캐러셀
  await call("/__reset", "POST", undefined, MOCK);
  const c = (await call("/api/carousels", "POST", { projectId: id })).data;
  let car = (await call(`/api/carousels/${c.id}`)).data;
  const k = car.images.findIndex((im) => im.url === "http://localhost:4110/img/new.jpg");
  assert.ok(k >= 0, "글에 넣은 사진을 캐러셀 사진으로");
  const slides = [...car.slides].reverse().map((s, i) => ({ ...s, headline: i === 0 ? "바꾼 순서 첫 장" : s.headline, image: i === 0 ? k : s.image }));
  car = (await call(`/api/carousels/${c.id}`, "PUT", { slides, caption: "고친 캡션", hashtags: ["#김장", "보쌈"] })).data;
  assert.equal(car.slides[0].headline, "바꾼 순서 첫 장");
  assert.equal(car.slides[0].image, k);
  assert.equal(car.caption, "고친 캡션");
  assert.deepEqual(car.hashtags, ["김장", "보쌈"]);
  const img = await fetch(`${BASE}/api/carousels/${c.id}/img/${k}`);
  assert.equal(img.status, 200, "내보내기용 사진 파일");
  assert.equal(img.headers.get("content-type"), "image/jpeg");
});

test("✅ 할 일 업무내용(인스타·유튜브·블로그·개인일정) · 업무에 맞는 연결만 저장 · 할 일은 달력에 자동 표시·수정 반영", async () => {
  const ym = kstDate(0).slice(0, 7);
  const day = `${ym}-28`;
  const car = (await call("/api/carousels")).data[0];
  const blog = (await call("/api/todos", "POST", { title: "알고 글 사진", category: "blog", blog_id: "blog_algokitchen", due_date: day, due_time: "10:00" })).data;
  const insta = (await call("/api/todos", "POST", { title: "릴스 올리기", category: "insta", ref_id: car.id, blog_id: "blog_algokitchen", due_date: day })).data;
  const me = (await call("/api/todos", "POST", { title: "병원", category: "personal", blog_id: "blog_algokitchen", due_date: day })).data;
  assert.equal(blog.category, "blog");
  assert.equal(blog.blog_id, "blog_algokitchen");
  assert.equal(insta.category, "insta");
  assert.equal(insta.ref_id, car.id);
  assert.equal(insta.blog_id, null, "인스타는 블로그 연결 안 함");
  assert.equal(me.category, "personal");
  assert.equal(me.blog_id, null, "개인일정은 연결 없음");
  // 달력에 자동 표시
  let cal = (await call(`/api/calendar?m=${ym}`)).data.filter((e) => e.cat === "todo" && e.start === day);
  assert.ok(cal.some((e) => e.title === "📝 알고 글 사진" && /블로그 · 네이버 알고키친 · 10:00/.test(e.sub)), JSON.stringify(cal));
  assert.ok(cal.some((e) => e.title === "📱 릴스 올리기"));
  assert.ok(cal.some((e) => e.title === "🙋 병원"));
  // 수정·완료·삭제가 달력에 반영
  await call(`/api/todos/${me.id}`, "PUT", { title: "치과", due_date: `${ym}-27` });
  await call(`/api/todos/${blog.id}`, "PUT", { done: true });
  await call(`/api/todos/${insta.id}`, "DELETE");
  cal = (await call(`/api/calendar?m=${ym}`)).data.filter((e) => e.cat === "todo");
  assert.ok(cal.some((e) => e.title === "🙋 치과" && e.start === `${ym}-27`), "수정 반영");
  assert.equal(cal.find((e) => e.todoId === blog.id)?.done, true, "완료 표시");
  assert.ok(!cal.some((e) => e.todoId === insta.id), "삭제 반영");
  const page = (await (await fetch(`${BASE}/todos?tab=upcoming`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes('aria-label="업무내용"'), "업무내용 칸");
});

test("🔑 설정: API 키 직접 연결 (암호화 저장·끝 4자리만·지우면 서버 설정으로) · 💲 단가 새로고침 + NEW", async () => {
  let keys = (await call("/api/settings/keys")).data;
  assert.equal(keys.find((k) => k.env === "YOUTUBE_API_KEY").state, "env");
  assert.ok(!JSON.stringify(keys).includes("test-yt-key"), "키 값은 화면으로 안 나감");
  assert.equal((await call("/api/settings/keys", "POST", { env: "NOT_A_KEY", value: "x" })).status, 400);
  assert.equal((await call("/api/settings/keys", "POST", { env: "YOUTUBE_API_KEY", value: "has space" })).status, 400);
  const r = await call("/api/settings/keys", "POST", { env: "YOUTUBE_API_KEY", value: "app-saved-yt-key-7788" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const yt = r.data.find((k) => k.env === "YOUTUBE_API_KEY");
  assert.equal(yt.state, "app");
  assert.equal(yt.last4, "7788");
  assert.ok(!JSON.stringify(r.data).includes("app-saved-yt-key"), "저장 후에도 키 값은 안 나감");
  const backup = await (await fetch(`${BASE}/api/export?scope=settings`)).text();
  assert.ok(!backup.includes("app-saved-yt-key") && !backup.includes("api_keys"), "백업에 키 없음");
  const page = (await (await fetch(`${BASE}/settings`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes("API 키 직접 연결") && page.includes("••••7788") && !page.includes("app-saved-yt-key"), "설정 화면");
  keys = (await call("/api/settings/keys", "POST", { env: "YOUTUBE_API_KEY", remove: true })).data;
  assert.equal(keys.find((k) => k.env === "YOUTUBE_API_KEY").state, "env", "지우면 서버 설정 키로");

  // 단가 새로고침: gpt-5.4-mini 만 바뀜 → 반영 + NEW
  const p = (await call("/api/settings/pricing", "POST", { keys: ["openai:gpt-5.4-mini"] })).data;
  assert.deepEqual(p.changed, ["openai:gpt-5.4-mini"], JSON.stringify(p));
  assert.deepEqual(p.pricing["openai:gpt-5.4-mini"], { input: 0.8, output: 4.8 });
  assert.ok(p.missing.includes("anthropic:claude-sonnet-5-5"), "가격표에 없는 모델은 그대로");
  const s = (await call("/api/settings")).data;
  assert.equal(s.pricing["openai:gpt-5.4-mini"].input, 0.8);
  const page2 = (await (await fetch(`${BASE}/settings`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page2.includes("새로고침") && page2.includes(">NEW<"), "NEW 표시");
  assert.deepEqual((await call("/api/settings/pricing", "POST", {})).data.changed, [], "두 번째는 바뀐 것 없음");
});

test("🏷 설정: 로고 아이콘·이름 바꾸기 → 왼쪽 위·탭 제목 반영 · 처음대로", async () => {
  const b = (await call("/api/settings/brand", "POST", { name: "민의 블로그 공장", mark: "🍳", color: "#ff0000" })).data;
  assert.deepEqual(b, { name: "민의 블로그 공장", mark: "🍳", color: "#ff0000" });
  const html = (await (await fetch(`${BASE}/settings`)).text()).replace(/<!-- -->/g, "");
  assert.ok(html.includes("민의 블로그 공장") && html.includes("<title>민의 블로그 공장</title>"), "반영");
  assert.equal((await call("/api/settings/brand", "POST", { name: "", mark: "ABCD", color: "red" })).data.mark, "AB", "아이콘은 2자까지");
  const r = (await call("/api/settings/brand", "POST", { reset: true })).data;
  assert.deepEqual(r, { name: "콘텐츠 오피스", mark: "AI", color: "" });
  assert.ok((await (await fetch(`${BASE}/`)).text()).includes("<title>AI 콘텐츠 오피스</title>"));
});

test("📊 전체 작업 현황: 블로그·캐러셀·영상 5단계 칸반 · 게시함 직접 표시 · 메뉴 그룹", async () => {
  let items = (await call("/api/work")).data;
  assert.ok(Array.isArray(items) && items.length > 0, "작업이 모임");
  assert.ok(items.every((i) => ["plan", "make", "review", "ready", "done"].includes(i.col) && i.steps.length >= 4 && i.href), "공통 모양");
  assert.ok(items.some((i) => i.type === "blog"), "블로그 글 포함");
  const car = items.find((i) => i.type === "carousel" && i.col === "ready");
  assert.ok(car, JSON.stringify(items.map((i) => [i.type, i.col])));
  // 게시함 표시 → 완료, 취소 → 다시 발행 대기
  assert.equal((await call("/api/work/posted", "POST", { type: "blog", id: "x" })).status, 400, "블로그는 발행 단계에서 처리");
  const r = await call("/api/work/posted", "POST", { type: "carousel", id: car.id, posted: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.posted_at);
  items = (await call("/api/work")).data;
  assert.equal(items.find((i) => i.key === car.key).col, "done");
  const cp = (await (await fetch(`${BASE}/carousels/${car.id}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(cp.includes("✅ 게시함 ·"), "캐러셀 화면에 게시함 표시");
  await call("/api/work/posted", "POST", { type: "carousel", id: car.id, posted: false });
  assert.equal((await call("/api/work")).data.find((i) => i.key === car.key).col, "ready");
  const page = (await (await fetch(`${BASE}/work`)).text()).replace(/<!-- -->/g, "");
  for (const t of ["전체 작업 현황", "기획", "제작 중", "발행 대기", "칸반", "목록", "막힌 것"]) assert.ok(page.includes(t), t);
  // 메뉴: 그룹 이름과 새 이름 (업로드·진단·설정·캐러셀)
  for (const t of ["워크스페이스", "콘텐츠 리서치", "블로그 관리", "영상 제작", "인스타그램 관리", "모두 펼치기"]) assert.ok(page.includes(t), `메뉴 ${t}`);
  const up = (await (await fetch(`${BASE}/posts`)).text()).replace(/<!-- -->/g, "");
  assert.ok(up.includes("블로그 업로드") && up.includes("새 글 만들기") && up.includes("키워드 추천"), "업로드 = 새 글 + 진행");
  const nw = await fetch(`${BASE}/new?blog=blog_algokitchen`, { redirect: "manual" });
  assert.ok([307, 308].includes(nw.status) && nw.headers.get("location").includes("/posts?new=1"), "예전 글 만들기 주소 → 업로드");
});

test("🔀 설정: 기능 켜기·끄기 (인스타 전체 끄기 · 블로그 진단 끄기) → 메뉴·페이지·현황에서 숨김, 다시 켜면 그대로", async () => {
  let r = (await call("/api/settings/features", "POST", { off: ["g:insta", "/diagnose", "엉뚱한값"] })).data;
  assert.deepEqual(r.off, ["g:insta", "/diagnose"], "모르는 값은 버림");
  const work = (await (await fetch(`${BASE}/work`)).text()).replace(/<!-- -->/g, "");
  assert.ok(!work.includes('href="/carousels"') && !work.includes('href="/diagnose"') && work.includes('href="/posts"'), "메뉴에서 숨김");
  assert.ok(!work.includes("📱 캐러셀"), "현황 필터에서도 캐러셀 숨김");
  const diag = (await (await fetch(`${BASE}/diagnose`)).text()).replace(/<!-- -->/g, "");
  assert.ok(diag.includes("이 기능은 꺼져 있어요"), "끈 페이지로 들어오면 안내");
  const car = (await (await fetch(`${BASE}/carousels`)).text()).replace(/<!-- -->/g, "");
  assert.ok(car.includes("이 기능은 꺼져 있어요"), "그룹을 끄면 그 안 페이지도 꺼짐");
  const st = (await (await fetch(`${BASE}/settings`)).text()).replace(/<!-- -->/g, "");
  assert.ok(st.includes("기능 켜기·끄기") && st.includes("인스타그램 관리"), "설정 화면");
  r = (await call("/api/settings/features", "POST", { off: [] })).data;
  assert.deepEqual(r.off, []);
  const car2 = (await (await fetch(`${BASE}/carousels`)).text()).replace(/<!-- -->/g, "");
  assert.ok(!car2.includes("이 기능은 꺼져 있어요"), "다시 켜면 그대로");
});

test("✂️ 릴스 편집기: 영상 → 받아쓰기로 장면·자막 초안 → 자막·배경 고쳐 저장 → 맥에서 Remotion으로 내보내기 → 영상공장 저장 · 내 영상 올리기", async () => {
  const fs = await import("node:fs");
  // 내 영상 올리기
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync("sample.mp4")], { type: "video/mp4" }), "내 영상.mp4");
  const up = await fetch(`${BASE}/api/videos/upload`, { method: "POST", body: fd });
  const upj = await up.json();
  assert.equal(up.status, 200, JSON.stringify(upj));
  const mine = (await call("/api/videos")).data.videos.find((v) => v.id === upj.id);
  assert.equal(mine.status, "ready");
  assert.equal(mine.kind, "upload");
  assert.equal((await fetch(`${BASE}/api/videos/upload`, { method: "POST", body: new FormData() })).status, 400);

  // ① 초안
  const r = await call("/api/reels", "POST", { videoId: upj.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let reel;
  for (let i = 0; i < 60; i++) {
    reel = (await call(`/api/reels/${r.data.id}`)).data;
    if (reel.status !== "analyzing") break;
    await new Promise((x) => setTimeout(x, 500));
  }
  assert.equal(reel.status, "ready", reel.message);
  assert.equal(reel.doc.scenes.length, 3, "문장마다 장면");
  assert.deepEqual(reel.doc.texts.map((t) => t.text), ["첫 문장 훅이에요", "두 번째 설명", "마지막 마무리"]);
  assert.ok(Math.abs(reel.doc.scenes.reduce((a, s) => a + s.dur, 0) - 3) < 0.2, "장면 길이 합 = 영상 길이");
  assert.ok(reel.guide.peaks.length > 20, "소리 모양");

  // ②③ 편집 저장: 둘째 장면 오로라 배경, 자막 상자·위치
  const doc = reel.doc;
  doc.scenes[1].bg = { type: "aurora", colors: ["#ff7eb3", "#7f7fff", "#ffd166", "#1a0b2e"] };
  doc.texts[0].style = { ...doc.texts[0].style, box: "#ffd1e8", color: "#2b1630", y: 400, anim: "pop" };
  doc.texts[1].style = { ...doc.texts[1].style, anim: "type" };
  const saved = await call(`/api/reels/${r.data.id}`, "PUT", { doc, title: "시험 릴스" });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.doc.scenes[1].bg.type, "aurora");
  assert.equal(saved.data.doc.texts[0].style.anim, "pop", "자막 등장 효과 저장");
  assert.equal((await call(`/api/reels/${r.data.id}`, "PUT", { doc: { scenes: "x" } })).status, 400);
  const page = (await (await fetch(`${BASE}/reels/${r.data.id}`)).text()).replace(/<!-- -->/g, "");
  for (const w of ["가이드 (원본)", "편집 화면", "완성 영상", "내 파일", "글자", "장면", "배경", "자르기", "되돌리기", "내보내기"]) assert.ok(page.includes(w), w);

  // ④ 내보내기 (맥: Remotion)
  assert.equal((await call(`/api/reels/${r.data.id}/render`, "POST")).status, 200);
  for (let i = 0; i < 480; i++) {
    reel = (await call(`/api/reels/${r.data.id}`)).data;
    if (reel.status !== "rendering") break;
    await new Promise((x) => setTimeout(x, 1000));
  }
  assert.equal(reel.status, "ready", reel.message);
  assert.ok(reel.output_video_id, "완성 영상");
  const out = (await call("/api/videos")).data.videos.find((v) => v.id === reel.output_video_id);
  assert.equal(out.kind, "reel");
  assert.equal(out.width, 1080);
  assert.equal(out.height, 1920);
  assert.ok(Math.abs(out.duration - 3) < 0.5, String(out.duration));
  const list = (await (await fetch(`${BASE}/reels`)).text()).replace(/<!-- -->/g, "");
  assert.ok(list.includes("시험 릴스") && list.includes("내보냄"), "목록");
});

test("🎨 이미지 레퍼런스: 컨셉 키트·이번만 레퍼런스 → Gemini·ChatGPT(편집)·Higgsfield(주소·Soul ID) · 한국어→영어 · ✏️ 프롬프트 수정 · 🤖 모델 추천 · 이미지 비용 집계", async () => {
  const PIXEL = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64");
  // 레퍼런스 올리기
  const fd = new FormData();
  fd.append("files", new Blob([PIXEL], { type: "image/jpeg" }), "ref.jpg");
  const up = await (await fetch(`${BASE}/api/refs`, { method: "POST", body: fd })).json();
  const kitRef = up.ids[0];
  assert.match(kitRef, /^img_[0-9a-f]{24}$/);
  const bad = new FormData();
  bad.append("files", new Blob(["x"], { type: "text/plain" }), "a.txt");
  assert.equal((await fetch(`${BASE}/api/refs`, { method: "POST", body: bad })).status, 400, "사진만");
  // 컨셉 키트
  const kit = (await call("/api/blogs/blog_algokitchen/kit", "PUT", { refs: [kitRef], style: "파스텔 수채화" })).data;
  assert.deepEqual(kit.refs, [kitRef]);
  assert.equal(kit.on, true);
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const id = posts[0].id;
  // 한국어 프롬프트 → 영어로 저장
  let b = (await call(`/api/posts/${id}`, "POST", { action: "image_prompt", index: 0, prompt: "작은 몸집에 큰 머리 토끼 건축가" })).data;
  assert.equal(b.project.package.images[0].prompt, "A cute rabbit architect with a big head, small body");
  assert.match(b.notice, /영어로/);
  // ✏️ 프롬프트 수정
  b = (await call(`/api/posts/${id}`, "POST", { action: "prompt_edit", index: 0, request: "배경을 밤 도시로" })).data;
  assert.equal(b.project.package.images[0].prompt, "A cute rabbit architect at night in a neon city");
  assert.match(b.notice, /밤 도시/);
  // 🤖 모델 추천 (목록에 없는 모델은 뺌)
  const rec = (await call(`/api/posts/${id}`, "POST", { action: "recommend_model", index: 0 })).data;
  assert.deepEqual(rec.picks.map((p) => p.id), ["google:gemini-3.1-flash-image", "soul-standard"]);
  // 이번만 레퍼런스: 만든 이미지에서 고르기
  const own = await call("/api/refs", "POST", { url: `${BASE}/api/img/${kitRef}.jpg` });
  assert.equal(own.data.ids[0], kitRef, "이 앱 이미지는 그대로 재사용");
  const fd2 = new FormData();
  fd2.append("files", new Blob([PIXEL], { type: "image/jpeg" }), "one.jpg");
  const once = (await (await fetch(`${BASE}/api/refs`, { method: "POST", body: fd2 })).json()).ids[0];
  b = (await call(`/api/posts/${id}`, "POST", { action: "image_refs", index: 0, refIds: [once, "nope"] })).data;
  assert.deepEqual(b.project.package.images[0].refIds, [once]);
  // Gemini: 키트 + 이번만 = 사진 2장 함께, 스타일도 영어로
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "google:gemini-3.1-flash-image" });
  const g = (await mockLog()).find((l) => l.path.includes("gemini-3.1-flash-image:generateContent"));
  const parts = g.body.contents[0].parts;
  assert.equal(parts.filter((x) => x.inlineData).length, 2, "레퍼런스 2장");
  assert.ok(!/[가-힣]/.test(parts.at(-1).text) && parts.at(-1).text.includes("reference"), parts.at(-1).text);
  // ChatGPT: 레퍼런스가 있으면 편집 주소로
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "openai:gpt-image-2" });
  const e = (await mockLog()).find((l) => l.path === "/v1/images/edits");
  assert.ok(e && e.body.images === 2, JSON.stringify(e?.body));
  const est = (await call(`/api/posts/${id}`, "POST", { action: "estimate_image", index: 0, model: "openai:gpt-image-2" })).data;
  assert.match(est.note, /레퍼런스 2장/);
  // 키트 끄기 → 이번만 1장
  await call(`/api/posts/${id}`, "POST", { action: "image_refs", index: 0, useKit: false });
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "google:gemini-3.1-flash-image" });
  assert.equal((await mockLog()).find((l) => l.path.includes(":generateContent") && l.body.generationConfig?.responseModalities).body.contents[0].parts.filter((x) => x.inlineData).length, 1);
  // Soul ID 만들기 (확인 없으면 거절)
  assert.equal((await call("/api/souls", "POST", { name: "모찌", refIds: [kitRef] })).status, 400);
  const souls = (await call("/api/souls", "POST", { name: "모찌", version: "v1", refIds: [kitRef], confirm: true })).data;
  assert.equal(souls[0].id, "soul-mock-1");
  const created = (await mockLog()).find((l) => l.path === "/v1/custom-references");
  assert.equal(created.body.input_images[0].image_url, `https://app.example.test/api/img/${kitRef}.jpg`);
  assert.equal((await call("/api/souls")).data[0].status, "completed", "학습 상태 새로고침");
  // Higgsfield SOUL: 레퍼런스 주소 + Soul ID / Qwen: 편집 주소
  await call(`/api/posts/${id}`, "POST", { action: "image_refs", index: 0, soulId: "soul-mock-1" });
  await call("/__reset", "POST", undefined, MOCK);
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "soul-standard" });
  const soul = (await mockLog()).find((l) => l.path === "/higgsfield-ai/soul/standard" && l.method === "POST");
  assert.equal(soul.body.image_reference_url, `https://app.example.test/api/img/${once}.jpg`);
  assert.equal(soul.body.custom_reference_id, "soul-mock-1");
  await call(`/api/posts/${id}`, "POST", { action: "generate_image", index: 0, model: "qwen-image-3" });
  const qw = (await mockLog()).find((l) => l.path === "/alibaba/qwen-image-3/edit");
  assert.deepEqual(qw.body.image_urls, [`https://app.example.test/api/img/${once}.jpg`]);
  // 화면
  const page = (await (await fetch(`${BASE}/posts/${id}`)).text()).replace(/<!-- -->/g, "");
  for (const w of ["✏️ 프롬프트 수정", "🤖 모델 추천", "레퍼런스 · 컨셉", "블로그 컨셉 키트 쓰기", "레퍼런스 사진을 3장까지"]) assert.ok(page.includes(w), w);
  const bp = (await (await fetch(`${BASE}/blogs/blog_algokitchen`)).text()).replace(/<!-- -->/g, "");
  assert.ok(bp.includes("이미지 컨셉 키트") && bp.includes("모찌"), "블로그 설정 키트");
  const sp = (await (await fetch(`${BASE}/settings`)).text()).replace(/<!-- -->/g, "");
  assert.ok(sp.includes("내 캐릭터 (Higgsfield Soul ID)") && sp.includes("google:gemini-3.1-flash-image"), "설정: Soul ID · 이미지 모델 단가");
  // 💰 Gemini 이미지 비용이 0원이 아니게 기록됨
  const bal = (await call("/api/dashboard/balances")).data.find((x) => x.id === "google-image");
  assert.ok(bal.used > 0.05, String(bal.used));
  await call("/api/blogs/blog_algokitchen/kit", "PUT", { refs: [], style: "", on: true });
});

test("📣 블로그 글 → 다른 채널 · 🔍 릴스 분석(받아쓰기·장면 사진·AI 분석·카테고리) · 📺 시리즈 기획(같은 캐릭터 문장·이어서·대기열)", async () => {
  // 📣 다른 채널용
  const posts = (await call("/api/posts")).data.filter((p) => p.stage === "ready" && p.blog_id === "blog_algokitchen");
  const pid = posts[0].id;
  // 앱 글 불러오기
  const src = (await call("/api/repurpose", "POST", { action: "load", postId: pid })).data;
  assert.ok(src.text.length > 5 && src.blogId === "blog_algokitchen", JSON.stringify(src).slice(0, 200));
  // 이미 블로그에 올린 글: 주소로 불러오기 (모의 네이버 글)
  const fromUrl = await call("/api/repurpose", "POST", { action: "load", url: "http://localhost:4110/PostView.naver?blogId=algo_kitchen&logNo=1" });
  assert.ok(fromUrl.status === 200 || fromUrl.status === 400, "주소 불러오기 응답");
  assert.equal((await call("/api/repurpose", "POST", { action: "make", title: "x", text: "짧음", channels: ["reel"] })).status, 400, "본문이 너무 짧음");
  const pasted = "김장 양념 황금비율을 정리했어요. 절임배추 20kg 기준으로 고춧가루, 젓갈, 마늘, 생강 비율을 알려 드려요. 처음 김장하는 분도 실패 없이 따라 할 수 있어요.";
  assert.equal((await call("/api/repurpose", "POST", { action: "make", title: "김장", text: pasted, channels: [] })).status, 400, "채널 안 고름");
  let rp = (await call("/api/repurpose", "POST", { action: "make", title: "김장 양념 비율", text: pasted, blogId: "blog_algokitchen", channels: ["reel", "cards"] })).data;
  assert.match(rp.result.reel, /김장/);
  assert.match(rp.result.cards, /1장: 김장 황금비율\n\n2장/, "배열로 와도 글로 합침");
  assert.ok(!rp.result.threads, "안 고른 채널은 안 만듦");
  rp = (await call("/api/repurpose", "POST", { action: "make", id: rp.id, title: "김장 양념 비율", text: pasted, channels: ["threads"] })).data;
  assert.ok(rp.result.reel && rp.result.threads, "같은 글에 채널 더하기");
  assert.equal((await call("/api/repurpose")).data[0].id, rp.id, "기록");
  const rpPage = (await (await fetch(`${BASE}/repurpose?post=${pid}`)).text()).replace(/<!-- -->/g, "");
  for (const w of ["채널 변환", "내 블로그에 올린 글", "앱에서 만든 글", "글 주소로", "직접 붙여넣기", "김장 양념 비율"]) assert.ok(rpPage.includes(w), w);
  const pv = (await (await fetch(`${BASE}/posts/${pid}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(pv.includes(`/repurpose?post=${pid}`), "글 화면에서 채널 변환으로");

  // 🔍 릴스 분석
  const add = await call("/api/study", "POST", { urls: ["http://localhost:4110/sample.mp4"], mine: true });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  let st;
  for (let i = 0; i < 120; i++) {
    st = (await call(`/api/study/${add.data.ids[0]}`)).data;
    if (["done", "error"].includes(st.status)) break;
    await new Promise((x) => setTimeout(x, 1000));
  }
  assert.equal(st.status, "done", st.message);
  assert.equal(st.category, "요리·살림");
  assert.equal(st.analysis.hook.score, 8);
  assert.equal(st.transcript.length, 3, "받아쓰기");
  assert.ok(st.frames.length >= 3 && st.frames.slice(0, 3).every((f) => f.first), "첫 3초 사진");
  const ai = (await mockLog()).filter((l) => JSON.stringify(l.body ?? {}).includes("릴스·쇼츠를 분석하는")).pop();
  assert.ok(JSON.stringify(ai.body).includes("image/jpeg"), "사진을 같이 보냄");
  assert.equal((await fetch(`${BASE}/api/img/${st.frames[0].img}.jpg`)).status, 200);
  await call(`/api/study/${st.id}`, "PUT", { category: "마케팅·SNS" });
  assert.equal((await call(`/api/study/${st.id}`)).data.category, "마케팅·SNS");
  const sp = (await (await fetch(`${BASE}/study`)).text()).replace(/<!-- -->/g, "");
  assert.ok(sp.includes("릴스 분석") && sp.includes("마케팅·SNS"), "분석 화면");

  // 📺 시리즈
  const sr = await call("/api/series", "POST", { hero: "오렌지색 털의 작은 곰", friend: "작은 빨간 개구리", theme: "나누기를 배우는 이야기", count: 2 });
  assert.equal(sr.status, 200, JSON.stringify(sr.data));
  let s = (await call(`/api/series/${sr.data.id}`)).data;
  assert.equal(s.episodes.length, 2);
  const lock = "A small orange-furred bear with round ears and a tiny red frog friend";
  assert.equal(s.characters, lock);
  assert.ok(s.episodes.every((e) => e.scenePrompt.startsWith(lock)), "모든 화 장면 프롬프트에 같은 캐릭터 문장");
  s = (await call(`/api/series/${s.id}`, "POST", { action: "continue", count: 1 })).data;
  assert.deepEqual(s.episodes.map((e) => e.n), [1, 2, 3], "이어서 3화");
  s = (await call(`/api/series/${s.id}`, "POST", { action: "edit", n: 1, request: "더 단순하게, 동작은 하나만" })).data;
  assert.equal(s.episodes[0].scenePrompt, `${lock} Bear holds one apple`, "고쳐도 캐릭터 문장 유지");
  const q = (await call(`/api/series/${s.id}`, "POST", { action: "queue", ns: [1] })).data;
  assert.equal(q.queued, 1);
  for (let i = 0; i < 40 && !s.episodes[0].studioId; i++) {
    await new Promise((x) => setTimeout(x, 500));
    s = (await call(`/api/series/${s.id}`)).data;
  }
  assert.ok(s.episodes[0].studioId, "걸어둔 화 → 영상 스튜디오 기획");
  const studio = (await call(`/api/studio/${s.episodes[0].studioId}`)).data;
  assert.equal(studio.character.prompt, lock, "스튜디오 캐릭터 = 고정 문장");
  assert.ok(studio.scenes.every((x) => x.visual.startsWith(lock)), "스튜디오 장면마다 같은 캐릭터 문장");
  const page = (await (await fetch(`${BASE}/studio`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes("시리즈로 만들기") && page.includes("나누기를 배우는 이야기"), "스튜디오 화면");
});

test("🔁 루틴 관리: 반복 등록 → 오늘 실행 자동 생성 → 텔레그램 첫 알림(버튼) → 완료 버튼은 필수 확인 → 30분 뒤 → 캡처 등록(AI 읽기)·체크로 자동 완료·알림 취소 · 마감 지나면 미수집 · 비공개 캡처", async (t) => {
  const hm = kstTime(0);
  // 30분 뒤 알림이 23:59 마감을 넘지 않게 (자정 근처는 건너뜀)
  if (hm < "00:10" || hm > "23:20") return t.skip("자정 근처라 건너뜀");
  const tick = () => call("/api/routines", "POST", { action: "tick" });
  const policy0 = (await call("/api/routines/policy")).data.policy;
  await call("/api/routines/policy", "PUT", { quietOn: false }); // 밤에 돌려도 보내지게
  assert.equal((await call("/api/routines", "POST", { name: "", time: "09:00" })).status, 400);
  assert.equal((await call("/api/routines", "POST", { name: "x", time: "10:00", deadline: "09:00" })).status, 400, "마감은 첫 알림보다 늦게");
  const r = await call("/api/routines", "POST", {
    name: "알고키친 인기 글 순위 캡처", category: "blog", blog_id: "blog_algokitchen", link: "https://creator-advisor.naver.com",
    schedule: { type: "daily", baseOffset: -1 }, time: kstTime(-2), deadline: "23:59", notify: true, remind: { mode: "interval", minutes: 30, max: 2 },
    completion: "checklist", checklist: [{ label: "조회수 순위 TOP 10 캡처 등록", kind: "views", required: true }, { label: "분석 결과 확인 및 저장", kind: "check", required: true }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let today = (await call("/api/routines")).data.today;
  const run = today.find((x) => x.routine_id === r.data.id);
  assert.ok(run, "오늘 실행 자동 생성");
  assert.equal(run.base_date, kstDate(-1), "자료 기준일 = 전날");
  await call("/__reset", "POST", undefined, MOCK);
  await tick();
  await tick(); // 두 번 돌려도 한 번만
  const sends = (await tgSends()).filter((l) => l.body.text?.includes("알고키친 인기 글 순위 캡처"));
  assert.equal(sends.length, 1, "첫 알림 한 번");
  assert.match(sends[0].body.text, /① 조회수 순위 TOP 10 캡처 등록/);
  const kb = JSON.stringify(sends[0].body.reply_markup);
  assert.ok(kb.includes(`rd:${run.id}`) && kb.includes(`rs:${run.id}`) && kb.includes(`/routines/run/${run.id}`), kb);
  // 완료 버튼: 필수 자료가 없으면 완료하지 않고 남은 항목 안내
  await call(`/__tgpress?data=rd:${run.id}`, "GET", undefined, MOCK);
  await call(`/__tgpress?data=rd:${run.id}&chat=111`, "GET", undefined, MOCK); // 다른 채팅은 무시
  await tick();
  let rn = (await call(`/api/routines/runs/${run.id}`)).data.run;
  assert.notEqual(rn.status, "done");
  const log = await mockLog();
  assert.ok(log.some((l) => l.path.endsWith("/answerCallbackQuery") && /아직 남았어요/.test(l.body.text)), "남은 항목 안내");
  assert.ok(log.some((l) => l.path.endsWith("/answerCallbackQuery") && /권한이 없어요/.test(l.body.text)), "다른 채팅 거절");
  // 30분 뒤 알림 (실행 건당 한 건)
  await call(`/__tgpress?data=rs:${run.id}`, "GET", undefined, MOCK);
  await tick();
  let nl = (await call("/api/routines/policy")).data.log.filter((l) => l.name === "알고키친 인기 글 순위 캡처");
  assert.ok(nl.some((l) => l.kind === "snooze" && l.status === "pending"), JSON.stringify(nl));
  assert.ok(nl.some((l) => l.kind === "first" && l.status === "sent"));
  // 캡처 등록 → AI가 조회수 읽어 저장 → 체크 → 자동 완료 → 남은 알림 취소
  const PIXEL = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64");
  const routine = (await call(`/api/routines/runs/${run.id}`)).data.routine;
  const fd = new FormData();
  fd.append("itemId", routine.checklist[0].id);
  fd.append("file", new Blob([PIXEL], { type: "image/jpeg" }), "cap.jpg");
  const up = await (await fetch(`${BASE}/api/routines/runs/${run.id}`, { method: "POST", body: fd })).json();
  const it = up.run.items.find((x) => x.id === routine.checklist[0].id);
  assert.ok(it.done && it.img && /개 글 저장/.test(it.note), JSON.stringify(it));
  assert.equal(up.run.status, "in_progress");
  assert.equal((await fetch(`${BASE}/api/img/${it.img}.jpg`)).status, 404, "캡처는 공개 주소로 안 보임");
  assert.equal((await fetch(`${BASE}/api/routines/capture/${it.img}.jpg`)).status, 200);
  rn = (await call(`/api/routines/runs/${run.id}`, "POST", { action: "item", itemId: routine.checklist[1].id, done: true })).data.run;
  assert.equal(rn.status, "done", "필수 다 채우면 자동 완료");
  nl = (await call("/api/routines/policy")).data.log.filter((l) => l.name === "알고키친 인기 글 순위 캡처");
  assert.ok(!nl.some((l) => l.status === "pending"), "완료 후 대기 알림 취소");
  // 마감 지남 → 미수집, 알림 안 감
  const late = (await call("/api/routines", "POST", { name: "늦은 루틴", time: kstTime(-3), deadline: kstTime(-1), completion: "button" })).data;
  await tick();
  const lr = (await call("/api/routines")).data.today.find((x) => x.routine_id === late.id);
  assert.equal(lr.status, "missed");
  assert.ok(!(await tgSends()).some((l) => l.body.text?.includes("늦은 루틴")), "미수집은 알림 안 보냄");
  // 일시정지 → 오늘의 루틴에서 빠짐, 다시 켜면 돌아옴
  const pz = (await call("/api/routines", "POST", { name: "멈출 루틴", time: "23:30", completion: "button" })).data;
  assert.ok((await call("/api/routines")).data.today.some((x) => x.routine_id === pz.id));
  await call(`/api/routines/${pz.id}`, "PUT", { paused: true });
  assert.ok(!(await call("/api/routines")).data.today.some((x) => x.routine_id === pz.id), "일시정지하면 오늘에서 빠짐");
  await call(`/api/routines/${pz.id}`, "PUT", { paused: false });
  assert.ok((await call("/api/routines")).data.today.some((x) => x.routine_id === pz.id), "다시 켜면 돌아옴");
  await call(`/api/routines/${pz.id}`, "DELETE");
  // 정한 시각: 횟수만큼 시각 채움
  const tm = (await call("/api/routines", "POST", { name: "시각 루틴", time: "09:00", completion: "button", remind: { mode: "times", times: ["20:00", "22:00"], max: 3 } })).data;
  assert.equal(tm.remind.times.length, 3, JSON.stringify(tm.remind));
  await call(`/api/routines/${tm.id}`, "DELETE");
  // 매주·매월: 오늘 아닌 요일은 안 만듦
  const dow = new Date(`${kstDate(0)}T00:00:00Z`).getUTCDay();
  const wk = (await call("/api/routines", "POST", { name: "주간 루틴", time: "23:00", completion: "button", schedule: { type: "weekly", days: [(dow + 1) % 7] } })).data;
  assert.ok(!(await call("/api/routines")).data.today.some((x) => x.routine_id === wk.id), "다른 요일");
  // 화면
  const pg = (await (await fetch(`${BASE}/routines`)).text()).replace(/<!-- -->/g, "");
  for (const w of ["루틴 관리", "오늘의 루틴", "전체 루틴", "실행 기록", "+ 새 루틴", "알고키친 인기 글 순위 캡처"]) assert.ok(pg.includes(w), w);
  const rp = (await (await fetch(`${BASE}/routines/run/${run.id}`)).text()).replace(/<!-- -->/g, "");
  assert.ok(rp.includes("조회수 순위 TOP 10 캡처 등록") && rp.includes("완료 조건"), "실행 화면");
  const td = (await (await fetch(`${BASE}/todos?tab=today`)).text()).replace(/<!-- -->/g, "");
  assert.ok(td.includes("오늘의 루틴") && td.includes("알고키친 인기 글 순위 캡처"), "할 일에 당일 루틴");
  const st = (await (await fetch(`${BASE}/telegram`)).text()).replace(/<!-- -->/g, "");
  assert.ok(st.includes("알림 설정 (텔레그램)") && st.includes("방해 금지") && st.includes("메시지함") && st.includes("채팅 ID 찾기"), "워크스페이스 → 텔레그램: 연결·알림 설정·메시지함");
  assert.ok((await (await fetch(`${BASE}/settings`)).text()).includes("워크스페이스 → 텔레그램"), "설정에는 안내만");
  // 💬 메시지함: 보낸(루틴 알림) · 받은(버튼 누름 · 봇에게 보낸 말) · 직접 보내기
  let out = (await call("/api/telegram?box=out")).data.list;
  assert.ok(out.some((m) => m.kind === "routine" && /조회수 순위 TOP 10/.test(m.text) && m.status === "sent"), "보낸 메시지함: 루틴 알림");
  await call(`/__tgsay?text=${encodeURIComponent("내일 촬영 몇 시였지?")}`, "GET", undefined, MOCK);
  await tick();
  const inbox = (await call("/api/telegram?box=in")).data;
  assert.ok(inbox.list.some((m) => m.kind === "text" && m.text === "내일 촬영 몇 시였지?" && m.chat_name === "민"), "받은 메시지함: 내가 보낸 말");
  assert.ok(inbox.list.some((m) => m.kind === "button" && /완료 처리/.test(m.text)), "받은 메시지함: 버튼 누름");
  assert.ok(inbox.list.some((m) => m.kind === "button" && /내 채팅 아님/.test(m.chat_name) === false), "버튼 기록");
  assert.equal((await call("/api/telegram")).data.counts.unread, 0, "받은 메시지함을 열면 읽음");
  assert.equal((await call("/api/telegram", "POST", { action: "send", text: " " })).status, 400);
  assert.equal((await call("/api/telegram", "POST", { action: "send", text: "직접 보내는 메모" })).status, 200);
  out = (await call("/api/telegram?box=out")).data.list;
  assert.equal(out[0].kind, "manual");
  assert.equal(out[0].text, "직접 보내는 메모");
  assert.ok((await mockLog()).some((l) => l.path.endsWith("/sendMessage") && l.body.text === "직접 보내는 메모"), "실제로는 모의 서버로만");
  assert.equal((await fetch(`${BASE}/telegram`)).status, 200, "텔레그램 탭");
  for (const id of [r.data.id, late.id, wk.id]) await call(`/api/routines/${id}`, "DELETE");
  await call("/api/routines/policy", "PUT", policy0);
});

test("🎞 영상 편집(캡컷형): 영상으로 시작 → 분할·배속·필터·전환·줌·오버레이·오디오·텍스트 저장 → 자동 자막 → 역재생 → 720p 내보내기 · 음악 올리기", async () => {
  const fs = await import("node:fs");
  const vids = (await call("/api/videos")).data.videos.filter((v) => v.status === "ready" && v.kind === "upload");
  const vid = vids[0].id;
  const c = await call("/api/edit", "POST", { videoIds: [vid, vid], title: "시험 편집" });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  let e = (await call(`/api/edit/${c.data.id}`)).data;
  assert.equal(e.doc.clips.length, 2);
  assert.equal(e.doc.ratio, "9:16", "세로 영상 → 9:16");
  // 음악 올리기 (mp3 대신 소리만 있는 wav를 만들어 올림)
  const wav = Buffer.alloc(44 + 16000);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + 16000, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16000, 40);
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "bgm.wav");
  const au = await (await fetch(`${BASE}/api/videos/upload`, { method: "POST", body: fd })).json();
  assert.ok(au.id, JSON.stringify(au));
  // 편집: 첫 클립 0~2초로 자르고 2배속·흑백·줌, 둘째 클립 페이드, 오버레이·오디오·텍스트
  const doc = e.doc;
  doc.clips[0] = { ...doc.clips[0], out: 2, speed: 2, filter: "bw", zoom: { from: 1, to: 1.3, x: 50, y: 50 } };
  doc.clips[1] = { ...doc.clips[1], transition: "fade" };
  doc.overlays = [{ id: "ov1", src: vid, kind: "video", start: 0.5, dur: 1, in: 0, x: 70, y: 30, w: 40, opacity: 1, volume: 0, radius: 10 }];
  doc.audios = [{ id: "au1", src: au.id, start: 0, in: 0, dur: 1, volume: 0.5, label: "bgm" }];
  doc.texts = [{ id: "t1", start: 0, end: 1, text: "직접 쓴 자막", style: { size: 60, bold: true, color: "#ffffff", box: "", stroke: "#000000", align: "center", fit: true, x: 540, y: 300, width: 900, rotate: 0, anim: "slide" } }];
  const sv = await call(`/api/edit/${e.id}`, "PUT", { doc, title: "시험 편집" });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.equal(sv.data.doc.clips[0].speed, 2);
  assert.equal((await call(`/api/edit/${e.id}`, "PUT", { doc: { clips: "x" } })).status, 400);
  const wait = async (label) => {
    for (let i = 0; i < 480; i++) {
      e = (await call(`/api/edit/${e.id}`)).data;
      if (!["working", "rendering"].includes(e.status)) return e;
      await new Promise((x) => setTimeout(x, 1000));
    }
    throw new Error(`시간 초과: ${label}`);
  };
  // 자동 자막: 자른 구간(0~2초)·2배속에 맞춰 → 첫 클립 1초 안에 2문장, 둘째 클립(3초 그대로)에 3문장
  await call(`/api/edit/${e.id}`, "POST", { action: "captions" });
  e = await wait("자막");
  assert.equal(e.status, "ready", e.message);
  const auto = e.doc.texts.filter((x) => x.auto);
  assert.equal(auto.length, 5, JSON.stringify(auto.map((x) => [x.start, x.end, x.text])));
  assert.ok(auto[0].end <= 1.01 && auto[2].start >= 0.99, "배속·위치 맞춤");
  assert.ok(e.doc.texts.some((x) => x.text === "직접 쓴 자막"), "직접 쓴 자막은 그대로");
  // 역재생
  await call(`/api/edit/${e.id}`, "POST", { action: "reverse", clipId: e.doc.clips[0].id });
  e = await wait("역재생");
  assert.equal(e.status, "ready", e.message);
  assert.notEqual(e.doc.clips[0].src, vid, "역재생 영상으로 교체");
  assert.equal(e.doc.clips[0].reversed, true);
  // 내보내기 720p
  await call(`/api/edit/${e.id}`, "POST", { action: "render", resolution: "720p" });
  e = await wait("내보내기");
  assert.equal(e.status, "ready", e.message);
  const out = (await call("/api/videos")).data.videos.find((v) => v.id === e.output_video_id);
  assert.equal(out.width, 720);
  assert.equal(out.height, 1280);
  assert.ok(out.duration > 3 && out.duration < 5, String(out.duration));
  const pg = (await (await fetch(`${BASE}/edit/${e.id}`)).text()).replace(/<!-- -->/g, "");
  for (const w of ["내보내기", "편집", "오디오", "텍스트", "편집효과", "오버레이", "캡션", "필터", "비율", "클립 오디오"]) assert.ok(pg.includes(w), w);
  const list = (await (await fetch(`${BASE}/edit`)).text()).replace(/<!-- -->/g, "");
  assert.ok(list.includes("시험 편집") && list.includes("내보냄"), "목록");
  void fs;
});

test("💰 애드포스트 하루 수익 직접 입력 · 캡처는 못 넣은 날 한꺼번에 (일별 표 / 기간 합계)", async () => {
  const rev = async () => (await call("/api/dashboard/revenue")).data["2026-10"]?.adpost;
  // 예전 방식 합계(메모에 기간) → 그다음 날 직접 입력은 더해짐
  await call("/api/dashboard/revenue", "PUT", { month: "2026-10", data: { adpost: { krw: 4678, metric: "기간 2026-10-01~2026-10-05" } } });
  let r = await call("/api/dashboard/revenue", "POST", { channel: "adpost", days: [{ date: "2026-10-06", krw: 900 }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await rev()).krw, 4678 + 900);
  // 같은 날 다시 넣으면 바뀜, 기간 안 날짜는 합계에 이미 포함
  await call("/api/dashboard/revenue", "POST", { channel: "adpost", days: [{ date: "2026-10-06", krw: 1000 }, { date: "2026-10-03", krw: 777 }] });
  assert.equal((await rev()).krw, 4678 + 1000);
  // 지우기
  await call("/api/dashboard/revenue", "POST", { channel: "adpost", days: [{ date: "2026-10-06", krw: null }] });
  assert.equal((await rev()).krw, 4678);
  // 캡처 기간 합계로 바꿈 → 그 기간 일별 기록은 지워짐
  await call("/api/dashboard/revenue", "POST", { channel: "adpost", base: { krw: 8000, from: "2026-10-01", to: "2026-10-07" }, days: [{ date: "2026-10-08", krw: 500 }] });
  let e = await rev();
  assert.equal(e.krw, 8500);
  assert.equal(e.days["2026-10-03"], undefined);
  assert.match(e.metric, /캡처 10-01~10-07 · 일별 1일/);
  // 수정 화면에서 합계를 그대로 두고 저장하면 일별 기록 유지
  await call("/api/dashboard/revenue", "PUT", { month: "2026-10", data: { adpost: { krw: 8500, metric: e.metric } } });
  assert.equal((await rev()).days["2026-10-08"], 500);
  // 캡처가 일별 표를 돌려줌
  const cap = await call("/api/dashboard/revenue/capture", "POST", { channel: "adpost", month: "2026-11", images: [PIXEL_URL] });
  assert.deepEqual(cap.data.days, [{ date: "2026-11-01", krw: 2000 }, { date: "2026-11-02", krw: 3000 }]);
  assert.equal((await call("/api/dashboard/revenue", "POST", { channel: "adpost", days: [] })).status, 400);
  assert.equal((await call("/api/dashboard/revenue", "POST", { channel: "adpost", base: { krw: 1, from: "2026-10-30", to: "2026-11-02" } })).status, 400, "달을 넘는 기간");
  await call("/api/dashboard/revenue", "PUT", { month: "2026-10", data: {} });
  const dash = await (await fetch(`${BASE}/`)).text();
  assert.ok(dash.includes("애드포스트 하루 수익"), "대시보드 입력칸");
});

test("🗑 릴스·영상 편집·영상공장도 체크해서 휴지통으로 → 되살리기 · 완전 삭제", async () => {
  const vid = (await call("/api/videos")).data.videos.find((v) => v.status === "ready" && v.kind === "upload").id;
  const ed = (await call("/api/edit", "POST", { videoIds: [vid], title: "휴지통 시험 편집" })).data.id;
  const fd = new FormData();
  const fs = await import("node:fs");
  const vids = (await call("/api/videos")).data.videos;
  const extra = vids.find((v) => v.status === "ready" && v.id !== vid) ?? null;
  void fd; void fs;
  const ids = [ed, ...(extra ? [extra.id] : [])];
  const reel = (await call("/api/reels")).data?.[0]?.id ?? (await call("/api/reels")).data?.reels?.[0]?.id;
  if (reel) ids.push(reel);
  const t = await call("/api/trash", "POST", { action: "trash", ids });
  assert.equal(t.data.count, ids.length);
  assert.ok(!(await call("/api/edit")).data.some((x) => x.id === ed), "편집 목록에서 숨김");
  if (extra) assert.ok(!(await call("/api/videos")).data.videos.some((v) => v.id === extra.id), "영상공장 목록에서 숨김");
  const trashPage = (await (await fetch(`${BASE}/trash`)).text()).replace(/<!-- -->/g, "");
  assert.ok(trashPage.includes("휴지통 시험 편집") && trashPage.includes("🎞 영상 편집"), "휴지통에 보임");
  const editPage = (await (await fetch(`${BASE}/edit`)).text()).replace(/<!-- -->/g, "");
  assert.ok(!editPage.includes("휴지통 시험 편집") && editPage.includes("편집 프로젝트"));
  assert.equal((await call("/api/trash", "POST", { action: "restore", ids })).data.count, ids.length);
  assert.ok((await call("/api/edit")).data.some((x) => x.id === ed), "되살림");
  await call("/api/trash", "POST", { action: "trash", ids: [ed] });
  assert.equal((await call("/api/trash", "POST", { action: "purge", ids: [ed] })).data.count, 1);
  assert.equal((await call(`/api/edit/${ed}`)).status, 404, "완전 삭제");
  const vf = (await (await fetch(`${BASE}/videos`)).text()).replace(/<!-- -->/g, "");
  assert.ok(vf.includes("휴지통으로"), "영상공장 휴지통 버튼");
});

test("🗑 나머지도 지우면 휴지통으로 (아이디어·할 일 등) → 그대로 되살리기 · 완전 삭제 · 30일 안내", async () => {
  const idea = (await call("/api/ideas", "POST", { memo: "휴지통 시험 아이디어", category: "blog" })).data;
  assert.equal((await call(`/api/ideas/${idea.id}`, "DELETE")).status, 200);
  assert.ok(!(await call("/api/ideas")).data.some((x) => x.id === idea.id), "목록에서 빠짐");
  let page = (await (await fetch(`${BASE}/trash`)).text()).replace(/<!-- -->/g, "");
  assert.ok(page.includes("휴지통 시험 아이디어") && page.includes("💡 아이디어") && page.includes("30일 뒤 자동 완전 삭제"), "휴지통에 보임");
  const tr = page.match(/tr_[a-z0-9]+/g) ?? [];
  assert.ok(tr.length, "휴지통 항목 아이디");
  // 체크해서 휴지통으로 (아이디로 바로)
  const idea2 = (await call("/api/ideas", "POST", { memo: "두 번째 시험 아이디어", category: "blog" })).data;
  assert.equal((await call("/api/trash", "POST", { action: "trash", ids: [idea2.id] })).data.count, 1);
  page = (await (await fetch(`${BASE}/trash`)).text()).replace(/<!-- -->/g, "");
  const ids = Array.from(new Set(page.match(/tr_[a-z0-9]+/g) ?? []));
  assert.ok(ids.length >= 2);
  assert.equal((await call("/api/trash", "POST", { action: "restore", ids })).data.count, ids.length);
  const back = (await call("/api/ideas")).data;
  assert.ok(back.some((x) => x.id === idea.id && x.memo === "휴지통 시험 아이디어"), "그대로 되살림");
  await call("/api/trash", "POST", { action: "trash", ids: [idea.id, idea2.id] });
  page = (await (await fetch(`${BASE}/trash`)).text()).replace(/<!-- -->/g, "");
  const ids2 = Array.from(new Set(page.match(/tr_[a-z0-9]+/g) ?? []));
  assert.equal((await call("/api/trash", "POST", { action: "purge", ids: ids2 })).data.count, ids2.length);
  assert.ok(!(await call("/api/ideas")).data.some((x) => x.id === idea.id), "완전 삭제");
  const studio = (await (await fetch(`${BASE}/studio`)).text());
  assert.ok(studio.includes("만든 영상 프로젝트"));
});

test("📄 문서 → 마크다운 (MarkItDown, 맥): 올리기 → 변환 → 결과·.md 받기 → 휴지통 · 지원 안 하는 파일 거절", async () => {
  const fd = new FormData();
  fd.append("file", new Blob(["<html><body><h1>김장 준비물</h1><p>배추 <b>10포기</b></p><table><tr><td>소금</td><td>3kg</td></tr></table></body></html>"], { type: "text/html" }), "김장.html");
  const up = await fetch(`${BASE}/api/convert`, { method: "POST", body: fd });
  const { ids } = await up.json();
  assert.equal(up.status, 200);
  let c;
  for (let i = 0; i < 120; i++) {
    c = (await call(`/api/convert/${ids[0]}`)).data;
    if (c.status === "done" || c.status === "error") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(c.status, "done", c.message);
  assert.match(c.markdown, /# 김장 준비물/);
  assert.match(c.markdown, /\*\*10포기\*\*/);
  assert.match(c.markdown, /\| 소금 \| 3kg \|/);
  const dl = await fetch(`${BASE}/api/convert/${ids[0]}?download=1`);
  assert.match(dl.headers.get("content-disposition"), /%EA%B9%80%EC%9E%A5\.md/);
  assert.match(await dl.text(), /김장 준비물/);
  assert.ok((await call("/api/convert")).data.some((x) => x.id === ids[0]));
  const bad = new FormData();
  bad.append("file", new Blob(["x"]), "a.exe");
  assert.equal((await fetch(`${BASE}/api/convert`, { method: "POST", body: bad })).status, 400);
  assert.equal((await call("/api/trash", "POST", { action: "trash", ids: [ids[0]] })).data.count, 1);
  assert.ok(!(await call("/api/convert")).data.some((x) => x.id === ids[0]), "휴지통으로");
  const pg = (await (await fetch(`${BASE}/convert`)).text()).replace(/<!-- -->/g, "");
  assert.ok(pg.includes("문서 → 마크다운") && pg.includes("PDF"));
  const rp = (await (await fetch(`${BASE}/repurpose`)).text());
  assert.equal((await fetch(`${BASE}/repurpose?convert=${ids[0]}`)).status, 200);
  void rp;
});

test("🔁 대시보드에서 넣은 캡처 → 같은 기준일 루틴 항목 자동 체크 (조회수·반응 순위) · 날짜 직접 고르기", async () => {
  const r = (await call("/api/routines", "POST", {
    name: "대시보드 연결 시험", category: "blog", blog_id: "blog_algokitchen", schedule: { type: "daily", baseOffset: -1 }, time: "00:01", deadline: "23:59", notify: false,
    completion: "checklist", checklist: [{ label: "조회수 순위 캡처", kind: "views", required: true }, { label: "반응 순위 TOP 10 캡처 등록", kind: "capture", required: true }, { label: "확인", kind: "check", required: true }],
  })).data;
  await call("/api/routines", "POST", { action: "tick" });
  const run = (await call("/api/routines")).data.today.find((x) => x.routine_id === r.id);
  assert.ok(run, "오늘 실행");
  const base = run.base_date;
  const v = await call("/api/dashboard/top", "POST", { blogId: "blog_algokitchen", images: [PIXEL_URL], kind: "day", date: base });
  assert.equal(v.data.date, base, "고른 날짜로 저장");
  assert.equal(v.data.linked, 1, "조회수 항목 체크");
  const rc = await call("/api/dashboard/top", "POST", { blogId: "blog_algokitchen", images: [PIXEL_URL], kind: "reaction", date: base });
  assert.equal(rc.status, 200, JSON.stringify(rc.data));
  assert.equal(rc.data.kind, "reaction");
  assert.equal(rc.data.linked, 1, "반응 항목 체크");
  const rn = (await call(`/api/routines/runs/${run.id}`)).data.run;
  const routine = (await call(`/api/routines/runs/${run.id}`)).data.routine;
  assert.ok(rn.items.find((i) => i.id === routine.checklist[0].id)?.done && rn.items.find((i) => i.id === routine.checklist[1].id)?.done);
  assert.match(rn.items.find((i) => i.id === routine.checklist[1].id).note, /대시보드에서 넣은/);
  assert.notEqual(rn.status, "done", "확인 항목이 남아 아직 완료 아님");
  assert.equal((await call(`/api/dashboard/top?blogId=blog_algokitchen&day=${base}`)).data.source, "capture");
  await call(`/api/routines/${r.id}`, "DELETE");
  const dash = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");
  assert.ok(dash.includes("오늘 쓴 AI 비용"), "대시보드로 옮김");
  assert.ok(!(await (await fetch(`${BASE}/posts`)).text()).includes("오늘 쓴 AI 비용"), "블로그 업로드에선 뺌");
});

test("🎞 영상 편집 2단계 (맥 AI 도구): 배경 제거(투명 영상) · 슬로모션 2배 · 화질 2배 · AI 음성+자막", { timeout: 15 * 60 * 1000 }, async () => {
  const vid = (await call("/api/videos")).data.videos.find((v) => v.status === "ready" && v.kind === "upload").id;
  const id = (await call("/api/edit", "POST", { videoIds: [vid, vid], title: "AI 도구 시험" })).data.id;
  let e = (await call(`/api/edit/${id}`)).data;
  // 1초씩만 (빠르게)
  const doc = { ...e.doc, clips: e.doc.clips.map((c) => ({ ...c, in: 0, out: 1 })) };
  await call(`/api/edit/${id}`, "PUT", { doc });
  const wait = async (label) => {
    for (let i = 0; i < 600; i++) {
      e = (await call(`/api/edit/${id}`)).data;
      if (e.status !== "working") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(e.status, "ready", `${label}: ${e.message}`);
  };
  assert.equal((await call(`/api/edit/${id}`, "POST", { action: "fx", itemId: doc.clips[0].id, fx: "nope" })).status, 400);
  // 배경 제거 → 투명(알파) webm 으로 교체
  assert.equal((await call(`/api/edit/${id}`, "POST", { action: "fx", itemId: doc.clips[0].id, fx: "bgremove" })).status, 200);
  assert.equal((await call(`/api/edit/${id}`, "POST", { action: "fx", itemId: doc.clips[1].id, fx: "slow2" })).status, 400, "작업 중엔 다른 작업 막음");
  await wait("배경 제거");
  const c0 = e.doc.clips[0];
  assert.notEqual(c0.src, vid);
  assert.equal(c0.alpha, true);
  const head = Buffer.from(await (await fetch(`${BASE}/api/videos/${c0.src}/file`)).arrayBuffer()).subarray(0, 4);
  assert.equal(head.toString("hex"), "1a45dfa3", "webm(투명) 파일");
  // 슬로모션 2배 → 길이 약 2배
  await call(`/api/edit/${id}`, "POST", { action: "fx", itemId: e.doc.clips[1].id, fx: "slow2" });
  await wait("슬로모션");
  const c1 = e.doc.clips[1];
  assert.ok(c1.out > 1.6 && c1.out < 2.6, `길이 ${c1.out}`);
  // 화질 2배
  const before = (await call("/api/videos")).data.videos.find((v) => v.id === c1.src);
  await call(`/api/edit/${id}`, "POST", { action: "fx", itemId: c1.id, fx: "upscale2" });
  await wait("화질 2배");
  const after = (await call("/api/videos")).data.videos.find((v) => v.id === e.doc.clips[1].src);
  assert.ok(after.width >= Math.min(before.width * 2 - 4, 3840) || after.height >= Math.min(before.height * 2 - 4, 3840), `${before.width}x${before.height} → ${after.width}x${after.height}`);
  // AI 음성 (시험용 가짜 edge-tts) → 오디오 줄 + 문장별 자막
  assert.equal((await call(`/api/edit/${id}`, "POST", { action: "tts", text: " " })).status, 400);
  await call(`/api/edit/${id}`, "POST", { action: "tts", text: "안녕하세요. 오늘은 감자전을 만들어요!", voice: "ko-KR-InJoonNeural", rate: 10, start: 0.5, captions: true });
  await wait("AI 음성");
  const au = e.doc.audios.find((a) => a.label.startsWith("🗣"));
  assert.ok(au && au.start === 0.5 && au.dur > 1, JSON.stringify(au));
  assert.equal(e.doc.texts.filter((x) => /감자전|안녕하세요/.test(x.text)).length, 2, "문장마다 자막");
  await call("/api/trash", "POST", { action: "trash", ids: [id] });
});

test("📚 AI 학습지: 링크 가져오기·복수 이미지·비용 확인·기타 자동 배정·재학습 중복 과금 방지", async()=>{
  const hub=await (await fetch(`${BASE}/learn`)).text();
  for(const word of ["AI 학습지","후킹 문구","이미지 생성","디자인","블로그","기타","과제물"]) assert.ok(hub.includes(word),word);
  await call('/__reset','POST',undefined,MOCK);
  const imported=await call('/api/learn','POST',{category:'other',url:'https://www.instagram.com/p/multi/?igsh=test',title:'전체학습자료',note:'여백과 구체적인 표지가 좋아요'});
  assert.equal(imported.status,201,JSON.stringify(imported.data));
  const id=imported.data.id; assert.equal(imported.data.images.length,2); assert.equal(imported.data.analysis,null);
  assert.ok(!(await mockLog()).some(l=>l.path.includes('generateContent')||l.path.includes('/chat/completions')),"자료 수집만으로 AI 호출 금지");
  const image=await fetch(BASE+imported.data.images[0]);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/private/);
  assert.equal((await call(`/api/learn/${id}`,'POST',{})).status,400,"분석 동의 필요");
  await call(`/api/learn/${id}`,'PATCH',{favorite:true,note:'학습 전 취향 메모'});
  const analyzed=await call(`/api/learn/${id}`,'POST',{confirm:true});assert.equal(analyzed.status,200,JSON.stringify(analyzed.data));
  assert.deepEqual(analyzed.data.analysis.categories,['hook','image','design','blog']);assert.match(analyzed.data.analysis.lessons.hook[0],/후킹학습마커/);
  const requests=await mockLog(); const analysis=requests.find(l=>JSON.stringify(l.body).includes('AI 학습지의'));
  assert.ok(analysis&&JSON.stringify(analysis.body).includes('image/jpeg'),"실제 가져온 이미지를 AI에 전달");
  const before=requests.filter(l=>JSON.stringify(l.body).includes('AI 학습지의')).length;
  await call(`/api/learn/${id}`,'POST',{confirm:true});
  assert.equal((await mockLog()).filter(l=>JSON.stringify(l.body).includes('AI 학습지의')).length,before,"완료된 자료는 재호출 없음");
  const listing=(await call('/api/learn')).data; assert.ok(listing.items.some(x=>x.id===id));assert.equal(typeof listing.estimate.usd,'number');
});

test("📚 공개 링크 안전성·핀터레스트·캡처 대체·수동 분류", async()=>{
  for(const url of ['http://127.0.0.1:4110/p/learn/','https://www.instagram.com.evil.test/p/learn/','https://www.instagram.com@evil.test/p/learn/','file:///etc/passwd']) assert.equal((await call('/api/learn','POST',{url})).status,400,url);
  assert.equal((await call('/api/learn','POST',{url:'https://www.instagram.com/p/blocked/'})).status,400,"로그인 제한은 실패로 안내");
  const pin=await call('/api/learn','POST',{url:'https://www.pinterest.com/pin/123456789/',category:'design',title:'핀 디자인'});assert.equal(pin.status,201,JSON.stringify(pin.data));assert.equal(pin.data.images.length,1);
  const analyzed=(await call(`/api/learn/${pin.data.id}`,'POST',{confirm:true})).data;assert.deepEqual(analyzed.analysis.categories,['design'],"사용자가 고른 분야 존중");
  const updated=await call(`/api/learn/${pin.data.id}`,'PATCH',{categories:['hook','design'],favorite:true,note:'학습취향마커'});assert.equal(updated.data.favorite,true);assert.deepEqual(updated.data.analysis.categories,['hook','design']);
  const image=await fetch(`${MOCK}/img/capture.jpg`);const dataUrl='data:image/jpeg;base64,'+Buffer.from(await image.arrayBuffer()).toString('base64');
  const capture=await call('/api/learn','POST',{category:'image',images:[dataUrl],title:'캡처 대체'});assert.equal(capture.status,201);assert.equal(capture.data.source_url,'');
  assert.equal((await call('/api/learn','POST',{images:['data:text/html;base64,PHNjcmlwdD4=']})).status,400);
  assert.equal((await call(`/api/learn/${pin.data.id}/image?index=99`)).status,404);
});

test("📋 학습 과제: 완료·되돌리기·할 일/아이디어 등록·동시 중복 방지·외부 발송 없음",async()=>{
  const tasks=(await call('/api/learn/tasks')).data;const chosen=tasks.find(t=>t.source_title==='전체학습자료');assert.ok(chosen);
  for(const kind of ['required','study','setup','direction'])assert.ok(tasks.some(t=>t.kind===kind));
  let r=await call('/api/learn/tasks','POST',{ids:[chosen.id],action:'complete',done:true});assert.equal(r.data.find(t=>t.id===chosen.id).done,true);
  await call('/api/learn/tasks','POST',{ids:[chosen.id],action:'complete',done:false});
  await call('/__reset','POST',undefined,MOCK);
  const sent=await Promise.all([1,2].map(()=>call('/api/learn/tasks','POST',{ids:[chosen.id],action:'todo'})));assert(sent.every(r=>r.status===200));
  r=await call('/api/learn/tasks','POST',{ids:[chosen.id],action:'idea'});const result=r.data.find(t=>t.id===chosen.id);assert.ok(result.todo_id&&result.idea_id);assert.equal(result.done,false);
  const todos=(await call('/api/todos')).data;assert.equal(todos.filter(t=>t.id===result.todo_id).length,1);assert.equal(todos.find(t=>t.id===result.todo_id).notify,false);
  const ideas=(await call('/api/ideas')).data;assert.equal(ideas.filter(t=>t.id===result.idea_id).length,1);
  assert.ok(!(await mockLog()).some(l=>l.path.includes('sendMessage')||JSON.stringify(l.body).includes('AI 학습지의')),"이동은 AI·텔레그램 호출 없음");
  assert.equal((await call('/api/learn/tasks','POST',{ids:['missing'],action:'todo'})).status,400);
});

test("📚 학습 결과를 캐러셀 후킹·블로그·이미지 프롬프트에 반영하고 사용 끄면 제외",async()=>{
  const refs=(await call('/api/learn')).data.items; const ref=refs.find(x=>x.title==='전체학습자료');
  const c=(await call('/api/carousels','POST',{topic:'김밥 준비 방법'})).data;
  assert.match(await stepPrompt('카드뉴스) 카피라이터'),/후킹학습마커/);
  assert.match(JSON.stringify(await mockLog()),/과장 없이/);
  await call(`/api/carousels/${c.id}`,'POST',{action:'hooks'});assert.match(await stepPrompt('표지 카피라이터'),/원문 근거/);assert.match(await stepPrompt('표지 카피라이터'),/후킹학습마커/);
  const pick=await call('/api/keywords','POST',{action:'add',blogId:'blog_algokitchen',keyword:'김밥 학습 확인'});
  const post=await call('/api/posts','POST',{blogId:'blog_algokitchen',pickIds:[pick.data.id]});
  await waitPost(post.data.ids[0],b=>b.project.stage==='titles'&&idle(b),'학습 반영 제목');
  assert.match(await stepPrompt('SEO 제목 전문가'),/블로그학습마커/);assert.match(await stepPrompt('SEO 제목 전문가'),/후킹학습마커/);
  const posts=(await call('/api/posts')).data.filter(p=>p.stage==='ready');
  const imagePost=posts[0].id;
  await call(`/api/posts/${imagePost}`,'POST',{action:'image_prompt',index:0,prompt:'작은 몸집에 큰 머리 토끼 건축가'});
  assert.match(await stepPrompt('expert prompt writer'),/ImageLearningMarker/);
  const grounded=(await call(`/api/carousels/${c.id}`,'POST',{action:'regenerate',feedback:'후킹검증_과장'})).data;
  assert.deepEqual(grounded.style.hooks,['김밥 준비 순서']);assert.equal(grounded.slides[0].headline,'김밥 준비 방법');assert.equal(grounded.slides[0].body,'');
  // 디자인 값 저장·로드·기존 틀로 복귀. 원본 이미지·원고는 그대로.
  const recipe=ref.analysis.recipe;
  const saved=await call(`/api/carousels/${c.id}`,'PUT',{style:{design:recipe,designRef:ref.id}});assert.deepEqual(saved.data.style.design,recipe);
  const page=await (await fetch(`${BASE}/carousels/${c.id}`)).text();assert.ok(page.includes('디자인 학습 시안'));
  const cleared=await call(`/api/carousels/${c.id}`,'PUT',{style:{design:null,designRef:''}});assert.equal(cleared.data.style.design,null);
  for(const r of refs.filter(r=>r.analysis?.categories.includes('hook')))await call(`/api/learn/${r.id}`,'PATCH',{enabled:false});
  await call(`/api/carousels/${c.id}`,'POST',{action:'regenerate'});assert.doesNotMatch(await stepPrompt('카드뉴스) 카피라이터'),/후킹학습마커|학습취향마커/);
  await call(`/api/learn/${ref.id}`,'PATCH',{enabled:true});
});

test("📱 전체 메뉴: 학습지·과제물까지 접근 · 하위 기능 끄기는 상위 학습지를 유지", async()=>{
  const html=await (await fetch(`${BASE}/learn`)).text();
  for(const link of ['/todos','/routines','/learn/tasks','/ideas','/calendar','/convert','/telegram','/study','/studio','/trash'])assert.ok(html.includes(`href="${link}"`),link);
  assert.ok(html.includes('전체 메뉴 열기')&&html.includes('mobile-menu-title'));
  await call('/api/settings/features','POST',{off:['/learn/tasks']});
  const disabled=await (await fetch(`${BASE}/learn/tasks`)).text();assert.ok(disabled.includes('이 기능은 꺼져 있어요'));
  const parent=await (await fetch(`${BASE}/learn`)).text();assert.ok(!parent.includes('이 기능은 꺼져 있어요'),'상위 학습지는 계속 사용');
  await call('/api/settings/features','POST',{off:[]});
});

test('📚 모든 학습은 본문의 지식·조건·근거를 정리 · 대표 이미지만 있으면 생성 차단 · 마크다운 보충',async()=>{
  await call('/__reset','POST',undefined,MOCK);
  const partial=(await call('/api/learn','POST',{category:'other',url:'https://www.instagram.com/p/learn/',title:'본문 미확인 자료'})).data;
  assert.equal(partial.needs_material,true);assert.equal(partial.coverage.caption,false);
  const before=(await mockLog()).filter(l=>l.path.includes('generateContent')).length;
  assert.equal((await call(`/api/learn/${partial.id}`,'POST',{confirm:true})).status,400);
  assert.equal((await mockLog()).filter(l=>l.path.includes('generateContent')).length,before,'부분 자료로 AI 생성 금지');
  const text='무료 GitHub 오픈소스 6가지. Fincept Terminal은 AI 금융 도구이며 LLM 데이터 비용은 별도입니다. Open-Gen-AI는 이미지 영상 모델을 모아 쓰며 클라우드 키 또는 로컬 GPU가 필요합니다. 수익은 보장되지 않아요.';
  const supplemented=await call(`/api/learn/${partial.id}`,'POST',{action:'supplement',text});assert.equal(supplemented.status,200,JSON.stringify(supplemented.data));assert.equal(supplemented.data.needs_material,false);assert.equal(supplemented.data.source_text,text);
  const result=(await call(`/api/learn/${partial.id}`,'POST',{confirm:true})).data;
  assert(result.analysis.knowledge.some(k=>k.topic==='Fincept Terminal'&&k.conditions.includes('비용 별도')));assert(result.analysis.knowledge.some(k=>k.topic==='Open-Gen-AI'));
  const prompt=await stepPrompt('AI 학습지의');assert.match(prompt,/본문의 핵심 지식/);assert.match(prompt,/수익 보장 안 됨/);
  const page=await (await fetch(`${BASE}/learn/other`)).text();assert.ok(page.includes('본문·마크다운'));
});

test('📡 관심 계정 바로가기: 저장·수정·중복 방지, 자동 수집 API 종료',async()=>{
  await call('/__reset','POST',undefined,MOCK);
  for(const [platform,url,name] of [['instagram','@jisick.chanel','인스타 참고'],['youtube','https://www.youtube.com/@radar','영상 참고'],['rss','https://example.org/blog','블로그 참고']]){
    const result=await call('/api/radar','POST',{action:'source',platform,url,name});assert.equal(result.status,200,JSON.stringify(result.data));
    const source=result.data.sources.find(x=>x.name===name);assert(source);assert(source.url.startsWith('https://'));
    assert.equal((await call('/api/radar','POST',{action:'source',platform,url,name})).status,400);
    const edited=await call('/api/radar','POST',{action:'source',id:source.id,name:name+' 수정'});assert.equal(edited.status,200);assert(edited.data.sources.some(x=>x.id===source.id&&x.name===name+' 수정'));
    assert.equal((await call('/api/radar','POST',{action:'check',id:source.id})).status,400);
  }
  for(const action of ['settings','supplement','retry'])assert.equal((await call('/api/radar','POST',{action,confirm:true,auto_learning:true})).status,400);
  for(const url of ['javascript:alert(1)','http://127.0.0.1/internal','https://localhost/path'])assert.equal((await call('/api/radar','POST',{action:'source',platform:'rss',url})).status,400);
  assert.deepEqual((await mockLog()).filter(x=>!x.path.startsWith('/__')),[],'계정 저장·수정은 외부 요청과 AI 호출 없음');
  const hub=await (await fetch(`${BASE}/learn`)).text();assert(!hub.includes('계정·일정 등록 →'));assert(!hub.includes('href="/learn/radar"><h2>'));
  const page=await (await fetch(`${BASE}/learn/radar`)).text();assert(page.includes('관심 계정 바로가기'));assert(page.includes('게시물 직접 추가'));assert(!page.includes('주간 자동 학습'));
});

test('📡 게시물 직접 추가: 본문·마크다운을 학습지에 저장, 자동 AI 학습 없음',async()=>{
  await call('/__reset','POST',undefined,MOCK);
  const text='Fincept Terminal은 AI 금융 도구로 소개되며 LLM 데이터 비용은 별도입니다. Open-Gen-AI는 로컬 GPU 또는 클라우드 키가 필요합니다. 수익은 보장되지 않아요. '.repeat(3);
  const added=await call('/api/radar','POST',{action:'post',url:'https://www.instagram.com/p/multi/',text,title:'직접 넣은 게시물'});
  assert.equal(added.status,201,JSON.stringify(added.data));assert.equal(added.data.source_text,text.trim());assert.equal(added.data.needs_material,false);assert.equal(added.data.analysis,null);
  assert((await call('/api/learn')).data.items.some(x=>x.id===added.data.id&&x.category==='other'));
  assert.deepEqual((await mockLog()).filter(x=>!x.path.startsWith('/__')),[],'본문 직접 저장은 수집·AI 호출 없음');
  const result=await call(`/api/learn/${added.data.id}`,'POST',{confirm:true});assert.equal(result.status,200);assert(result.data.analysis.knowledge.length>0,'기존 비용 확인 후 수동 학습은 유지');
});


test('✍️ 블로그별 제목 규칙 저장·후보 금지 표현 확인·최신 규칙 재적용·검수 반영',async()=>{
  const rules=['제목 끝에 총정리를 붙이지 않는다','독자가 얻는 정보를 구체적으로 쓴다'],forbidden=['|','｜','금지단어'];
  const created=await call('/api/blogs','POST',{name:'제목 규칙 전용',title_rules:rules,title_forbidden:forbidden});assert.equal(created.status,201);const blogId=created.data.id;
  let blog=(await call(`/api/blogs/${blogId}`)).data;assert.deepEqual(blog.title_rules,rules);assert.deepEqual(blog.title_forbidden,forbidden);
  assert.equal((await call(`/api/blogs/${blogId}`,'PUT',{title_rules:'잘못된 형식'})).status,400);assert.equal((await call(`/api/blogs/${blogId}`,'PUT',{title_forbidden:[42]})).status,400);
  assert(!(await call('/api/blogs/blog_algokitchen')).data.title_forbidden.includes('금지단어'),'다른 블로그와 독립 저장');
  const pick=await call('/api/keywords','POST',{action:'add',blogId,keyword:'제목규칙테스트'});const posts=await call('/api/posts','POST',{blogId,pickIds:[pick.data.id]});const id=posts.data.ids[0];
  let b=await waitPost(id,x=>idle(x)&&x.project.stage==='titles','규칙 적용 제목 생성');
  assert.equal(b.project.plan.candidates.length,2);assert(b.project.plan.candidates.every(x=>!/[|｜]/.test(x.title)&&!x.title.includes('금지단어')));assert.equal(b.project.plan.selectedTitle,'제목규칙테스트 안전한 제목');assert.equal(b.project.plan.bestReason,'규칙 통과');
  assert((await stepPrompt('SEO 제목 전문가')).includes(rules[0]));
  await call(`/api/blogs/${blogId}`,'PUT',{title_forbidden:[...forbidden,'안전한']});
  await call(`/api/posts/${id}`,'POST',{action:'rerun',step:'titles'});b=await waitPost(id,x=>idle(x)&&x.project.stage==='titles','저장한 최신 규칙 다시 적용');assert.equal(b.project.plan.candidates.length,1);assert.equal(b.project.plan.selectedTitle,'제목규칙테스트 다른 제목');
  // 직접 입력한 제목은 보존하되, 검수에서 실제 금지 문자 포함을 지적한다.
  await call(`/api/posts/${id}`,'POST',{action:'write',title:'제목규칙테스트 | 직접 입력'});b=await waitPost(id,x=>idle(x)&&x.project.stage==='ready','제목 규칙 검수');assert(b.project.review.issues.some(x=>x.type==='rule'&&x.quote==='|'));assert(b.project.review.ruleChecks.some(x=>x.rule==='제목 금지: |'&&x.passed===false));assert((await stepPrompt('편집장이자 팩트체커')).includes(rules[0]));
  await call(`/api/blogs/${blogId}`,'PUT',{title_forbidden:[],title_rules:[]});blog=(await call(`/api/blogs/${blogId}`)).data;assert.deepEqual(blog.title_forbidden,[]);assert.deepEqual(blog.title_rules,[]);
});
