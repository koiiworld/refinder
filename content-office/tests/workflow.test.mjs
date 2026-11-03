// 통합 테스트 (AI 미연결 상태): 7단계 흐름이 끊기지 않고, 데이터를 지어내지 않는지 확인
// 사용법: 서버 실행 후  BASE_URL=http://localhost:3000 npm test
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
async function waitPost(id, pred, label, timeout = 30000) {
  const t = Date.now();
  let last;
  while (Date.now() - t < timeout) {
    last = (await call(`/api/posts/${id}`)).data;
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`시간 초과: ${label} stage=${last?.project?.stage} status=${last?.project?.status} ${last?.project?.status_message}`);
}
const idle = (b) => b.project.status !== "running" && b.jobs.length === 0;

test("기본 블로그 3개", async () => {
  const { data } = await call("/api/blogs");
  assert.ok(data.length >= 3);
  assert.ok(data.some((b) => b.name.includes("알고키친")));
});

test("① AI 미연결이면 키워드를 지어내지 않고 안내", async () => {
  const r = await call("/api/keywords", "POST", { action: "recommend", blogId: "blog_algokitchen" });
  assert.notEqual(r.status, 200);
  assert.match(r.data.error, /AI/);
});

test("② 직접 넣은 키워드로 글 만들기 → ③④⑥ 자동 진행(템플릿) → ⑦ 발행 완료", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_algokitchen", keyword: "테스트 굴보쌈" });
  assert.equal(add.status, 201);
  const picks = (await call("/api/keywords?blogId=blog_algokitchen")).data;
  const pick = picks.find((p) => p.keyword === "테스트 굴보쌈");
  assert.equal(pick.volume, null, "검색량 미연결이면 비워 둠");
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds: [pick.id] });
  assert.equal(c.status, 201);
  const id = c.data.ids[0];
  let b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  assert.ok(b.project.plan.candidates.length >= 1, "③ 제목 후보");
  assert.ok(b.document.content_html.length > 0, "④ 본문");
  assert.ok(!b.document.content_html.includes("<script"));
  assert.ok(b.project.package.hashtags.length >= 1, "④ 해시태그");
  assert.ok(b.project.package.images.length >= 1, "⑤ 이미지 프롬프트");
  assert.ok(b.project.review, "⑥ 검수");
  // 같은 키워드는 다시 쓰이지 않음
  const again = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds: [pick.id] });
  assert.equal(again.data.ids.length, 0);
  // 제목 직접 변경
  b = (await call(`/api/posts/${id}`, "POST", { action: "select_title", title: "내가 정한 제목" })).data;
  assert.equal(b.document.title, "내가 정한 제목");
  // 해시태그 수정
  b = (await call(`/api/posts/${id}`, "POST", { action: "hashtags", hashtags: ["#굴보쌈", "겨울 요리"] })).data;
  assert.deepEqual(b.project.package.hashtags, ["굴보쌈", "겨울요리"]);
  // 이미지 생성 전엔 본문에 넣기 불가
  const ins = await call(`/api/posts/${id}`, "POST", { action: "insert_image", index: 0 });
  assert.equal(ins.status, 400);
  // 검수 뒤 수정 → 다시 검수 권장
  const s = await call(`/api/projects/${id}/document`, "PUT", { html: b.document.content_html + "<p>추가</p>", title: "내가 정한 제목", revision: b.document.revision });
  assert.equal(s.data.needsRereview, true);
  // 다운로드
  const html = await call(`/api/projects/${id}/export?format=html`);
  assert.ok(String(html.data).includes("<h1>내가 정한 제목</h1>"));
  assert.ok(String(html.data).includes("#굴보쌈"));
  // ⑦ 발행 완료
  b = (await call(`/api/posts/${id}`, "POST", { action: "publish", url: "https://blog.naver.com/x/1" })).data;
  assert.equal(b.project.stage, "published");
  assert.equal(b.project.package.publishedUrl, "https://blog.naver.com/x/1");
  // 목록
  const list = (await call("/api/posts")).data;
  assert.ok(list.some((p) => p.id === id && p.stage === "published"));
  // 삭제하면 키워드가 다시 선택 가능
  await call(`/api/posts/${id}`, "DELETE");
  const back = (await call("/api/keywords?blogId=blog_algokitchen")).data.find((p) => p.id === pick.id);
  assert.equal(back.status, "new");
});

test("서버 재시작 없이 다시 실행: 검수만 다시", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "테스트 노트북" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  await call(`/api/posts/${id}`, "POST", { action: "rerun", step: "review" });
  const b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "재검수");
  assert.ok(b.reviews.length >= 2);
});

test("말투 예시 파일: 업로드·검증·삭제", async () => {
  const bad = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "a.pdf", content: "x" }] });
  assert.equal(bad.status, 400);
  const up = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "후기.md", content: "오늘은 아이랑 다녀왔어요 😊" }] });
  assert.equal(up.status, 201);
  const list = (await call("/api/blogs/blog_naver_life/samples")).data;
  for (const s of list) await call(`/api/blogs/blog_naver_life/samples/${s.id}`, "DELETE");
  assert.equal((await call("/api/blogs/blog_naver_life/samples")).data.length, 0);
});

test("유입 트렌드 붙여넣기 정리", async () => {
  const r = await call("/api/research/creator", "POST", { blogId: "blog_algokitchen", text: "1 김장 양념 비율\n2위 절임배추 ▲3\n3. 굴보쌈 NEW\n절임배추" });
  assert.equal(r.data.count, 3);
  await call(`/api/research/creator?id=${r.data.id}`, "DELETE");
});

test("단계별 AI 설정 저장", async () => {
  const r = await call("/api/settings", "PUT", { stepAi: { titles: { provider: "google", model: "gemini-3.5-flash" }, bogus: { provider: "x", model: "y" } } });
  assert.equal(r.data.stepAi.titles.provider, "google");
  assert.equal(r.data.stepAi.review.provider, "anthropic", "나머지는 기본값 유지");
  assert.ok(!("bogus" in r.data.stepAi));
  await call("/api/settings", "PUT", { stepAi: { titles: { provider: "openai", model: "gpt-5.4-mini" } } });
});
