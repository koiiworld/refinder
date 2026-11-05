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
  assert.match(fp, /지적과 관계없는 문장·구성·말투는 그대로/);
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

test("모델 목록 · Higgsfield 연결 확인", async () => {
  assert.deepEqual((await call("/api/ai/models?provider=openai")).data.models, ["gpt-mock-1", "gpt-mock-2"]);
  assert.match((await call("/api/ai/models?provider=higgsfield")).data.note, /인증 성공/);
});
