// 통합 테스트: 실행 중인 서버에 HTTP로 접속해 승인형 워크플로 전체를 검증합니다.
// 사용법: 서버 실행 후  BASE_URL=http://localhost:3000 npm test
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function waitFor(id, pred, label, timeout = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = (await call(`/api/projects/${id}`)).data;
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`시간 초과: ${label} (stage=${last?.project?.stage}, status=${last?.project?.status}, msg=${last?.project?.status_message})`);
}

const idle = (b) => b.project.status !== "running" && b.jobs.length === 0;

test("기본 블로그 3개가 등록되어 있다", async () => {
  const { data } = await call("/api/blogs");
  const names = data.map((b) => b.name);
  assert.ok(names.some((n) => n.includes("티스토리")));
  assert.ok(names.some((n) => n.includes("알고키친")));
  assert.ok(data.length >= 3);
});

test("새 블로그(여행)를 추가하고 독립 설정을 저장한다", async () => {
  const r = await call("/api/blogs", "POST", { name: "테스트 여행 블로그", platform: "naver", category: "여행", style_guide: "여행기 문체", review_rules: ["숙소 가격은 날짜 명시"] });
  assert.equal(r.status, 201);
  const b = (await call(`/api/blogs/${r.data.id}`)).data;
  assert.equal(b.style_guide, "여행기 문체");
  assert.deepEqual(b.review_rules, ["숙소 가격은 날짜 명시"]);
  const u = await call(`/api/blogs/${r.data.id}`, "PUT", { image_style: "필름 감성" });
  assert.equal(u.data.image_style, "필름 감성");
});

test("전체 승인형 워크플로: 주제→기획→원고→검수→승인→이미지→패키지→최종", async () => {
  // 1. 프로젝트 생성
  const c = await call("/api/projects", "POST", { blogId: "blog_tistory", title: "테스트 무선 이어폰 비교", brief: "가성비 위주", scheduledDate: "2026-11-20" });
  assert.equal(c.status, 201);
  const id = c.data.id;
  let b = (await call(`/api/projects/${id}`)).data;
  assert.equal(b.project.stage, "topic_approval");

  // 2. 주제 승인 → 기획안 자동 작성
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "approve", comment: "좋아요" })).data;
  b = await waitFor(id, (x) => x.project.stage === "plan_approval" && idle(x), "기획 승인 대기");
  assert.ok(b.project.plan, "기획안 생성");
  assert.ok(b.project.plan.titleCandidates.length > 0);
  assert.equal(b.versions.filter((v) => v.kind === "plan").length, 1);
  assert.ok(b.runs.some((r) => r.purpose === "plan" && r.status === "succeeded"), "AI 실행 이력 기록");

  // 3. 기획안 직접 수정 → 새 버전
  const plan = { ...b.project.plan, selectedTitle: "직접 고친 제목", titleCandidates: ["직접 고친 제목"] };
  b = (await call(`/api/projects/${id}/plan`, "PUT", { plan })).data;
  assert.equal(b.project.plan.selectedTitle, "직접 고친 제목");
  assert.equal(b.versions.filter((v) => v.kind === "plan").length, 2);

  // 4. 수정 요청 → 기획 재작성
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "request_changes", comment: "가격 비교 섹션 추가" })).data;
  b = await waitFor(id, (x) => x.project.stage === "plan_approval" && idle(x), "기획 재작성");
  assert.ok(b.approvals.some((a) => a.decision === "changes_requested"), "수정 요청이 승인 기록에 별도 저장");

  // 5. 기획 승인 → 원고 작성 → 교차 검수 자동
  await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  b = await waitFor(id, (x) => x.project.stage === "draft_approval" && idle(x), "원고 승인 대기");
  assert.ok(b.document.content_html.length > 0, "원고 작성됨");
  assert.equal(b.document.last_editor, "ai");
  assert.ok(b.reviews.length >= 1, "검수 결과 저장");
  assert.ok(b.project.review, "최근 검수 결과");

  // 6. 사용자 직접 편집 (자동 저장)
  const userHtml = "<h2>내가 쓴 소제목</h2><p>사용자가 직접 수정한 본문입니다.</p>";
  const s = await call(`/api/projects/${id}/document`, "PUT", { html: userHtml, title: "내 제목", revision: b.document.revision });
  assert.equal(s.status, 200);
  const rev = s.data.revision;

  // 7. 오래된 revision으로 저장 → 충돌(409)
  const conflict = await call(`/api/projects/${id}/document`, "PUT", { html: "<p>x</p>", title: "x", revision: rev - 1 });
  assert.equal(conflict.status, 409);

  // 8. 원고 수정 요청 → AI 결과는 사용자 원고를 덮어쓰지 않고 제안으로 보관
  await call(`/api/projects/${id}/actions`, "POST", { action: "request_changes", comment: "더 짧게" });
  b = await waitFor(id, (x) => x.project.stage === "draft_approval" && idle(x), "수정 원고");
  assert.equal(b.document.content_html, userHtml, "사용자 수정 보호");
  assert.ok(b.document.pending_proposal_id, "AI 제안 보관");

  // 9. 제안이 있으면 승인 불가 → 폐기 후 승인
  const blocked = await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  assert.equal(blocked.status, 400);
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "discard_proposal" })).data;
  assert.equal(b.document.pending_proposal_id, null);
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "approve" })).data;
  assert.equal(b.project.stage, "images");
  assert.ok(b.project.approved_version_id);

  // 10. 승인 후 수정 → 재검수 필요
  const s2 = await call(`/api/projects/${id}/document`, "PUT", { html: userHtml + "<p>승인 후 추가</p>", title: "내 제목", revision: b.document.revision });
  assert.equal(s2.data.needsRereview, true);

  // 11. 이미지 단계(2차·수동) 완료 → 이미지 승인 → 패키지 자동 생성
  await call(`/api/projects/${id}/actions`, "POST", { action: "complete_stage" });
  await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  b = await waitFor(id, (x) => x.project.stage === "carousel" && idle(x), "발행 패키지");
  assert.ok(b.project.package.html.includes("승인 후 추가"));
  assert.ok(b.project.package.markdown.includes("# 내 제목"));

  // 12. 캐러셀 건너뛰기 → 최종 승인 (재검수 필요 상태면 차단)
  await call(`/api/projects/${id}/actions`, "POST", { action: "complete_stage" });
  const fb = await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  assert.equal(fb.status, 400, "재검수 없이 최종 승인 차단");

  // 13. 다른 AI로 재검수 → 재검수 필요 해제 → 최종 승인
  await call(`/api/projects/${id}/actions`, "POST", { action: "rereview", provider: "template", model: "offline-template" });
  b = await waitFor(id, (x) => idle(x) && !x.project.needs_rereview, "재검수");
  assert.equal(b.project.stage, "final_approval");
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "approve" })).data;
  assert.equal(b.project.stage, "done");

  // 14. 승인 기록: 각 단계 결정이 모두 남아 있음
  const decisions = b.approvals.map((a) => `${a.stage}:${a.decision}`);
  for (const d of ["topic_approval:approved", "plan_approval:approved", "draft_approval:approved", "image_approval:approved", "final_approval:approved"]) {
    assert.ok(decisions.includes(d), d);
  }

  // 15. 내보내기
  const html = await call(`/api/projects/${id}/export?format=html`);
  assert.equal(html.status, 200);
  assert.ok(String(html.data).includes("<h1>내 제목</h1>"));
  const md = await call(`/api/projects/${id}/export?format=md`);
  assert.ok(String(md.data).includes("## 내가 쓴 소제목"));
  const js = await call(`/api/projects/${id}/export?format=json`);
  assert.ok(js.data.versions.length >= 3);
});

test("이전 버전 복원: 복원 전 상태를 백업하고 내용을 되돌린다", async () => {
  const c = await call("/api/projects", "POST", { blogId: "blog_algokitchen", title: "테스트 된장찌개", autoApproveTopic: true });
  const id = c.data.id;
  await waitFor(id, (x) => x.project.stage === "plan_approval" && idle(x), "기획");
  await call(`/api/projects/${id}/actions`, "POST", { action: "approve" });
  let b = await waitFor(id, (x) => x.project.stage === "draft_approval" && idle(x), "원고");
  const aiHtml = b.document.content_html;
  const firstDraft = b.versions.find((v) => v.kind === "draft");
  await call(`/api/projects/${id}/document`, "PUT", { html: "<p>전부 지움</p>", title: "t", revision: b.document.revision });
  b = (await call(`/api/projects/${id}/actions`, "POST", { action: "restore", versionId: firstDraft.id })).data;
  assert.equal(b.document.content_html, aiHtml);
  assert.ok(b.versions.some((v) => v.label === "복원 전 백업"));
});

test("글감 등록 → 주제 승인 시 프로젝트 생성 및 기획 자동 시작", async () => {
  const r = await call("/api/ideas", "POST", { blogId: "blog_naver_life", title: "테스트 아기 이유식 일정", memo: "6개월차", keywords: ["이유식"] });
  assert.equal(r.status, 201);
  const a = await call(`/api/ideas/${r.data.id}`, "PATCH", { action: "approve" });
  assert.ok(a.data.projectId);
  const b = await waitFor(a.data.projectId, (x) => x.project.stage === "plan_approval" && idle(x), "기획");
  assert.ok(b.approvals.some((x) => x.stage === "topic_approval" && x.decision === "approved"));
});

test("AI 미연결 시 글감 추천·부분 수정은 결과를 지어내지 않고 오류로 안내", async () => {
  const s = await call("/api/ideas/suggest", "POST", { blogId: "blog_tistory" });
  assert.equal(s.status, 400);
  const projects = (await call("/api/projects")).data;
  const e = await call("/api/ai/edit", "POST", { projectId: projects[0].id, selected: "문장", instruction: "다듬기" });
  assert.equal(e.status, 400);
  assert.match(e.data.error, /AI 연결/);
});

test("AI 실행 내역과 작업 큐가 기록된다", async () => {
  const runs = await call("/api/export?scope=all");
  assert.ok(runs.data.ai_runs.length > 0);
  assert.ok(runs.data.jobs.every((j) => ["succeeded", "failed", "canceled"].includes(j.status)));
  assert.ok(runs.data.approvals.length > 0);
  // API 키 같은 비밀값은 백업에 포함되지 않음
  assert.ok(!JSON.stringify(runs.data).includes("API_KEY="));
});

test("프롬프트 수정실: 대상 AI×용도 조합 검증, 버전·직접 수정·복원", async () => {
  // 지원하지 않는 조합은 거부
  const c1 = await call("/api/prompts", "POST", { target: "claude", kind: "visual", text: "고양이 그림" });
  assert.equal(c1.status, 400);
  const c2 = await call("/api/prompts", "POST", { target: "higgsfield", kind: "writing", text: "블로그 글" });
  assert.equal(c2.status, 400);
  // 지원 조합 9개 모두 생성 가능 (AI 미연결이면 템플릿: 원문 유지 + 구조 안내)
  const combos = [
    ["gpt", "visual", "image"], ["gpt", "visual", "video"], ["gemini", "visual", "image"], ["gemini", "visual", "video"],
    ["higgsfield", "visual", "image"], ["higgsfield", "visual", "video"],
    ["gpt", "writing"], ["claude", "writing"], ["gemini", "writing"], ["gpt", "info"], ["claude", "info"], ["gemini", "info"],
  ];
  let last;
  for (const [target, kind, media] of combos) {
    const r = await call("/api/prompts", "POST", { target, kind, media, text: "맛있는 계란말이 영상", blogId: "blog_algokitchen" });
    assert.equal(r.status, 201, `${target}/${kind}/${media}: ${JSON.stringify(r.data)}`);
    assert.ok(r.data.current.prompt.includes("맛있는 계란말이 영상"), "원문 보존");
    assert.equal(r.data.versions.length, 1);
    if (target === "higgsfield") assert.ok(r.data.current.negative, "Higgsfield는 제외 프롬프트 제공");
    if (kind === "writing") assert.equal(r.data.current.negative, "", "글 원고는 제외 프롬프트 없음");
    last = r.data;
  }
  // 직접 수정 → v2, 복원 → v3 (v1 내용)
  const s = await call(`/api/prompts/${last.id}`, "POST", { action: "save", result: { ...last.current, prompt: "내가 고친 프롬프트" } });
  assert.equal(s.data.versions.length, 2);
  assert.equal(s.data.current.prompt, "내가 고친 프롬프트");
  const r = await call(`/api/prompts/${last.id}`, "POST", { action: "restore", n: 1 });
  assert.equal(r.data.versions.length, 3);
  assert.equal(r.data.current.prompt, last.current.prompt);
  const list = await call("/api/prompts");
  assert.ok(list.data.length >= combos.length);
  assert.equal((await call(`/api/prompts/${last.id}`, "DELETE")).status, 200);
});

test("말투 예시 파일: 업로드 형식 검증, 목록, 사용 전환, 삭제", async () => {
  const bad = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "a.pdf", content: "x" }] });
  assert.equal(bad.status, 400);
  const empty = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "a.md", content: "  " }] });
  assert.equal(empty.status, 400);
  const up = await call("/api/blogs/blog_naver_life/samples", "POST", { files: [{ filename: "후기1.md", content: "# 제목\r\n오늘은 우리 아이랑 다녀왔어요 😊" }, { filename: "일상.txt", content: "짧게 써볼게요." }] });
  assert.equal(up.status, 201);
  let list = (await call("/api/blogs/blog_naver_life/samples")).data;
  assert.equal(list.length, 2);
  assert.ok(!list[0].content.includes("\r"), "줄바꿈 정리");
  await call(`/api/blogs/blog_naver_life/samples/${list[0].id}`, "PATCH", { enabled: false });
  list = (await call("/api/blogs/blog_naver_life/samples")).data;
  assert.equal(list.find((s) => s.filename === "후기1.md").enabled, false);
  for (const s of list) await call(`/api/blogs/blog_naver_life/samples/${s.id}`, "DELETE");
  assert.equal((await call("/api/blogs/blog_naver_life/samples")).data.length, 0);
});
