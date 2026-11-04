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

test("② 키워드 선택 → ③ 제목 후보에서 멈춤 → 글 쓰기 버튼 → ④⑥ 자동(템플릿) → ⑦ 발행 완료", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_algokitchen", keyword: "테스트 굴보쌈" });
  assert.equal(add.status, 201);
  const picks = (await call("/api/keywords?blogId=blog_algokitchen")).data;
  const pick = picks.find((p) => p.keyword === "테스트 굴보쌈");
  assert.equal(pick.volume, null, "검색량 미연결이면 비워 둠");
  const c = await call("/api/posts", "POST", { blogId: "blog_algokitchen", pickIds: [pick.id] });
  assert.equal(c.status, 201);
  const id = c.data.ids[0];
  let b = await waitPost(id, (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  assert.equal(b.project.status, "waiting", "③ 제목 후보에서 멈춤");
  assert.ok(b.project.plan.candidates.length >= 1, "③ 제목 후보");
  assert.equal(b.document?.content_html ?? "", "", "글 쓰기 전에는 본문 없음");
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal((await call(`/api/posts/${id}`)).data.project.stage, "titles", "자동으로 넘어가지 않음");
  await call(`/api/posts/${id}`, "POST", { action: "write", index: 1 });
  b = await waitPost(id, (x) => x.project.stage === "ready" && idle(x), "발행 대기");
  assert.equal(b.document.title, b.project.plan.candidates[1].title, "고른 제목으로 작성");
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
  // 삭제 → 휴지통 (목록에서 빠지고 키워드는 아직 사용됨)
  await call(`/api/posts/${id}`, "DELETE");
  assert.ok(!(await call("/api/posts")).data.some((p) => p.id === id), "진행 현황에서 빠짐");
  assert.ok((await call("/api/trash")).data.some((p) => p.id === id), "휴지통에 있음");
  assert.equal((await call("/api/keywords?blogId=blog_algokitchen")).data.find((p) => p.id === pick.id).status, "used");
  // 되살리기
  await call("/api/trash", "POST", { action: "restore", ids: [id] });
  assert.ok((await call("/api/posts")).data.some((p) => p.id === id), "되살림");
  // 휴지통에 없는 글은 완전 삭제되지 않음
  assert.equal((await call("/api/trash", "POST", { action: "purge", ids: [id] })).data.count, 0);
  // 휴지통으로(여러 개 선택 방식) → 완전 삭제하면 키워드가 다시 선택 가능
  assert.equal((await call("/api/trash", "POST", { action: "trash", ids: [id] })).data.count, 1);
  assert.equal((await call("/api/trash", "POST", { action: "purge", ids: [id] })).data.count, 1);
  assert.equal((await call(`/api/posts/${id}`)).status, 404, "완전 삭제됨");
  const back = (await call("/api/keywords?blogId=blog_algokitchen")).data.find((p) => p.id === pick.id);
  assert.equal(back.status, "new");
});

test("휴지통으로 옮기면 대기 작업 정리 · 휴지통 비우기", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "테스트 휴지통" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await call("/api/trash", "POST", { action: "trash", ids: [id] });
  await new Promise((r) => setTimeout(r, 3000));
  const b = (await call(`/api/posts/${id}`)).data;
  assert.equal(b.jobs.length, 0, "남은 작업 없음");
  assert.ok(!(await call("/api/posts")).data.some((p) => p.id === id), "진행 현황에서 빠짐");
  assert.ok((await call("/api/trash", "POST", { action: "empty" })).data.count >= 1);
  assert.equal((await call("/api/trash")).data.length, 0);
});

test("서버 재시작 없이 다시 실행: 검수만 다시", async () => {
  const add = await call("/api/keywords", "POST", { action: "add", blogId: "blog_tistory", keyword: "테스트 노트북" });
  const c = await call("/api/posts", "POST", { blogId: "blog_tistory", pickIds: [add.data.id] });
  const id = c.data.ids[0];
  await waitPost(id, (x) => x.project.stage === "titles" && idle(x), "제목 선택 대기");
  await call(`/api/posts/${id}`, "POST", { action: "write" });
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
  // HTML: 블로그 글 화면 저장 파일 → 본문만 마크다운으로
  const html = `<html><head><style>.x{}</style><script>track()</script></head><body>
    <div class="gnb">메뉴 로그인 이웃추가</div>
    <div class="se-main-container"><div class="se-module"><h3>오늘의 나들이</h3><p>아이랑 <b>공원</b>에 다녀왔어요 😊</p>
    <img src="a.jpg" alt="공원 사진"><ul><li>준비물: 돗자리</li></ul>
    <table><tr><th>항목</th><th>가격</th></tr><tr><td>입장료</td><td>무료</td></tr></table>
    <p>다음에 또 가고 싶어요. <a href="https://x.com">링크</a></p></div></div>
    <div class="comment">댓글 12</div></body></html>`;
  const upHtml = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "나들이.html", content: html }] });
  assert.equal(upHtml.status, 201, JSON.stringify(upHtml.data));
  const list = (await call("/api/blogs/blog_naver_life/samples")).data;
  const h = list.find((s) => s.filename === "나들이.html").content;
  assert.match(h, /### 오늘의 나들이/);
  assert.match(h, /아이랑 \*\*공원\*\*에 다녀왔어요 😊/);
  assert.match(h, /\[이미지: 공원 사진\]/);
  assert.match(h, /\| 입장료 \| 무료 \|/);
  assert.ok(!/track\(\)|<p>|메뉴 로그인|댓글 12|https:\/\/x\.com/.test(h), "태그·스크립트·메뉴·댓글·링크 주소 제거");
  const empty = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "빈.html", content: "<html><body><script>x()</script></body></html>" }] });
  assert.equal(empty.status, 400);
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
