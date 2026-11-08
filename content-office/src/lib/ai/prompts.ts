import {commonRulesText,type BlogRuleScope} from "../blog-rule-types";
import {titleRulesText} from "../title-rules";
import type { Blog, Plan, Project, ReviewResult, Source } from "../types";

const BASE_RULES = `
- 확인되지 않은 검색량, 순위, 통계 수치, 트렌드 지표를 만들어내지 마세요.
- 제공된 출처 자료에 없는 사실을 단정하지 말고, 확인이 필요한 내용은 "[확인 필요]"로 표시하세요.
- 출처 URL을 지어내지 마세요. 사용자가 제공한 출처만 인용할 수 있습니다.
- 한국어로 작성하세요.`;

export function blogContext(blog: Blog,scopes:BlogRuleScope|BlogRuleScope[]="body") {
  return `[블로그 정보]
이름: ${blog.name} (${blog.platform})
주제 분야: ${blog.category}
설명: ${blog.description}
작성 문체: ${blog.style_guide}
이미지 스타일: ${blog.image_style}
검수 규칙:
${blog.review_rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${titleRulesText({...blog,common_rules:[]})}
${commonRulesText(blog,scopes)}`;
}

function sourcesText(sources: Source[]) {
  if (!sources.length) return "(사용자가 제공한 출처 자료 없음)";
  return sources
    .map(
      (s, i) =>
        `${i + 1}. ${s.title || "(제목 없음)"} - ${s.url}\n   수집일: ${s.collected_at?.slice(0, 10)}${
          s.description ? `\n   요약: ${s.description}` : ""
        }${s.note ? `\n   메모: ${s.note}` : ""}`,
    )
    .join("\n");
}

/** 블로그 말투 예시 파일 → 프롬프트 블록 (토큰 비용을 위해 총 글자 수 제한) */
export const MAX_SAMPLE_CHARS = 8000;
export function styleSamplesText(blog: Blog | null | undefined): string {
  const samples = blog?.style_samples ?? [];
  if (!samples.length) return "";
  const per = Math.floor(MAX_SAMPLE_CHARS / samples.length);
  const body = samples
    .map((s) => {
      const text = s.content.trim();
      return `<sample file="${s.filename}">\n${text.length > per ? text.slice(0, per) + "\n…(이하 생략)" : text}\n</sample>`;
    })
    .join("\n");
  return `
[말투 예시 - 이 블로그 운영자가 실제로 쓴 글]
아래 예시의 말투, 어미, 문장 길이, 문단 나누기, 이모티콘·강조 사용 습관, 도입과 마무리 방식을 그대로 따라 쓰세요.
예시의 내용·사실·문장을 복사하지 말고 '쓰는 방식'만 참고하세요. 예시와 작성 문체 설명이 다르면 예시를 우선합니다.
${body}
`;
}

// ───────────────────────── 기획안 ─────────────────────────

export function planPrompt(blog: Blog, project: Project, feedback?: string, previous?: Plan | null) {
  const system = `당신은 한국어 블로그 SEO 콘텐츠 기획자입니다. 반드시 JSON 객체 하나만 출력합니다.${BASE_RULES}`;
  const prompt = `${blogContext(blog,["title","body","image"])}

[주제]
${project.topic || project.title}

[사용자 요청사항]
${project.brief || "(없음)"}

[출처 자료]
${sourcesText(project.sources)}
${previous ? `\n[이전 기획안]\n${JSON.stringify(previous, null, 2)}\n` : ""}${feedback ? `\n[사용자 수정 요청 - 반드시 반영]\n${feedback}\n` : ""}
다음 JSON 스키마로 블로그 글 기획안을 작성하세요:
{
  "titleCandidates": ["SEO 제목 후보 5개"],
  "selectedTitle": "추천 제목",
  "mainKeyword": "핵심 키워드",
  "subKeywords": ["연관 키워드 5~8개 (검색량 수치는 쓰지 말 것)"],
  "searchIntent": "검색 의도 분석 (정보형/비교형/구매형 등과 근거)",
  "targetReader": "대상 독자",
  "direction": "콘텐츠 방향과 차별화 포인트",
  "outline": [{"heading": "소제목", "points": ["다룰 내용"]}],
  "sources": [{"title": "제공된 출처 중 활용할 자료", "url": "제공된 URL만", "note": "활용 방법"}],
  "imagePlan": [{"position": "배치 위치(예: 도입부 아래)", "description": "이미지 컷 설명"}],
  "notes": "추가 확인이 필요한 사항"
}`;
  return { system, prompt };
}

export function planTemplate(blog: Blog, project: Project): Plan {
  const topic = project.topic || project.title;
  return {
    titleCandidates: [topic, `${topic} 정리`, `${topic} 알아보기`],
    selectedTitle: topic,
    mainKeyword: topic.split(/\s+/).slice(0, 2).join(" "),
    subKeywords: [],
    searchIntent: "[작성 필요] 템플릿 모드에서는 검색 의도를 분석하지 않습니다.",
    targetReader: `[작성 필요] ${blog.category} 관심 독자`,
    direction: project.brief || "[작성 필요] 콘텐츠 방향을 입력하세요.",
    outline: [
      { heading: "도입: 이 글에서 다룰 내용", points: ["[작성 필요]"] },
      { heading: "본문 1", points: ["[작성 필요]"] },
      { heading: "본문 2", points: ["[작성 필요]"] },
      { heading: "정리", points: ["[작성 필요]"] },
    ],
    sources: project.sources.map((s) => ({ title: s.title, url: s.url, note: s.note ?? "" })),
    imagePlan: [
      { position: "도입부 아래", description: `대표 이미지 (${blog.image_style})` },
      { position: "본문 중간", description: "[작성 필요]" },
    ],
    notes: "⚠ AI가 연결되지 않아 템플릿으로 만든 기획안 뼈대입니다. 직접 수정하거나 AI 연결 후 재실행하세요.",
  };
}

// ───────────────────────── 원고 ─────────────────────────

const HTML_RULES = `출력 형식: HTML 조각만 출력합니다 (<html>, <body>, 마크다운 코드블록 없이).
사용 가능한 태그: h2, h3, p, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, hr.
이미지 자리에는 <p>[이미지: 설명]</p> 형태로 표시합니다.`;

export function draftPrompt(blog: Blog, project: Project, plan: Plan) {
  const system = `당신은 "${blog.name}" 블로그의 전속 작가입니다. 블로그 문체를 정확히 따릅니다.${BASE_RULES}\n${HTML_RULES}`;
  const prompt = `${blogContext(blog,["body","image"])}

${styleSamplesText(blog)}
[승인된 기획안]
${JSON.stringify(plan, null, 2)}

[출처 자료]
${sourcesText(project.sources)}

[사용자 요청사항]
${project.brief || "(없음)"}

위 기획안의 목차를 따라 블로그 본문을 작성하세요. 제목(h1)은 쓰지 말고 본문부터 시작합니다.
출처를 인용할 때는 본문 끝에 "참고 자료" 섹션을 만들어 링크를 답니다.`;
  return { system, prompt };
}

export function revisePrompt(blog: Blog, plan: Plan | null, currentHtml: string, feedback: string, review?: ReviewResult | null) {
  const system = `당신은 "${blog.name}" 블로그의 전속 작가입니다.${BASE_RULES}\n${HTML_RULES}`;
  const prompt = `${blogContext(blog,"body")}

${styleSamplesText(blog)}
${plan ? `[기획안]\n${JSON.stringify(plan, null, 2)}\n` : ""}
[현재 원고]
${currentHtml}

${review ? `[최근 AI 검수 의견]\n${JSON.stringify({ summary: review.summary, issues: review.issues }, null, 2)}\n` : ""}
[사용자 수정 요청 - 반드시 반영]
${feedback}

수정 요청을 반영해 원고 전체를 다시 출력하세요. 요청과 무관한 부분은 최대한 그대로 유지합니다.`;
  return { system, prompt };
}

export function draftTemplate(blog: Blog, plan: Plan): string {
  const parts = [
    `<p><strong>⚠ AI 미연결 상태에서 만든 템플릿 원고입니다.</strong> 아래 목차에 맞춰 직접 작성하거나, 설정에서 AI를 연결한 뒤 '원고 재작성'을 실행하세요.</p>`,
  ];
  for (const sec of plan.outline) {
    parts.push(`<h2>${esc(sec.heading)}</h2>`);
    if (sec.points.length) parts.push(`<ul>${sec.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`);
    parts.push(`<p>[작성 필요]</p>`);
  }
  for (const img of plan.imagePlan) parts.push(`<p>[이미지: ${esc(img.position)} - ${esc(img.description)}]</p>`);
  if (plan.sources.length) {
    parts.push(`<h2>참고 자료</h2><ul>${plan.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title || s.url)}</a></li>`).join("")}</ul>`);
  }
  void blog;
  return parts.join("\n");
}

// ───────────────────────── 검수 ─────────────────────────

export function reviewPrompt(blog: Blog, project: Project, plan: Plan | null, html: string) {
  const system = `당신은 까다로운 블로그 편집장이자 팩트체커입니다. 다른 AI가 쓴 원고를 교차 검수합니다. 반드시 JSON 객체 하나만 출력합니다.
- 당신은 인터넷 검색을 하지 않습니다. 사실관계는 '제공된 출처와 일치', '확인 필요', '오류 가능성 높음' 중 하나로만 판정하고, 확실하지 않으면 '확인 필요'로 둡니다.
- 한국어로 작성하세요.`;
  const prompt = `${blogContext(blog,["review","title","body","image"])}

${plan ? `[기획안]\n${JSON.stringify(plan, null, 2)}\n` : ""}
[출처 자료]
${sourcesText(project.sources)}

${styleSamplesText(blog)}
[검수 대상 원고 (HTML)]
${html}

다음 JSON 형식으로 검수 결과를 작성하세요:
{
  "summary": "총평 (3문장 이내)",
  "score": 0~100 정수 (블로그 규칙·문체·구성 기준 품질 점수),
  "issues": [{"type": "fact|source|style|seo|rule|other", "severity": "high|medium|low", "quote": "문제 문장 원문", "comment": "문제 설명", "suggestion": "수정 제안"}],
  "factChecks": [{"claim": "사실 주장", "status": "consistent_with_sources|needs_verification|likely_incorrect", "note": "근거"}],
  "ruleChecks": [{"rule": "블로그 검수 규칙 원문", "passed": true, "note": ""}]
}
말투 예시가 있으면 원고의 말투가 예시와 다른 부분을 issues 에 type "style" 로 지적하세요.
ruleChecks 에는 위 검수 규칙을 모두 하나씩 포함하세요.`;
  return { system, prompt };
}

export function reviewTemplate(blog: Blog, html: string): Omit<ReviewResult, "provider" | "model" | "reviewedAt"> {
  const text = html.replace(/<[^>]+>/g, " ");
  const issues: ReviewResult["issues"] = [];
  const todo = (text.match(/\[작성 필요\]/g) || []).length;
  if (todo) issues.push({ type: "other", severity: "high", quote: "[작성 필요]", comment: `작성되지 않은 자리 ${todo}곳이 남아 있습니다.`, suggestion: "해당 부분을 작성하세요." });
  const verify = (text.match(/\[확인 필요\]/g) || []).length;
  if (verify) issues.push({ type: "fact", severity: "medium", quote: "[확인 필요]", comment: `확인이 필요한 내용 ${verify}곳`, suggestion: "출처를 확인해 수정하세요." });
  return {
    summary: "⚠ AI 미연결: 규칙 기반 기본 점검만 수행했습니다 (사실관계·문체 검수는 하지 않음). AI를 연결해 재검수하세요.",
    score: null,
    issues,
    factChecks: [],
    ruleChecks: blog.review_rules.map((r) => ({ rule: r, passed: false, note: "자동 판정 불가 - 직접 확인 필요" })),
  };
}

// ───────────────────────── 부분 수정 ─────────────────────────

export function editPrompt(blog: Blog, selected: string, instruction: string, context: string, hasImage = false) {
  const system = `당신은 블로그 문장 교정 전문가입니다. 선택된 부분만 수정해 결과 텍스트만 출력합니다 (설명·따옴표·마크다운 없이).${BASE_RULES}`;
  const prompt = `${blogContext(blog,"body")}

${styleSamplesText(blog)}
[주변 문맥]
${context.slice(0, 3000)}

[수정할 부분]
${selected}

[수정 지시]
${instruction}
${hasImage ? "\n[첨부한 캡처] 사용자가 고칠 곳을 화면에서 드래그해 잘라낸 캡처예요. 위 '수정할 부분'이 그 캡처 영역의 글이에요. 표·목록 모양도 참고하세요.\n" : ""}
수정된 부분만 출력하세요. 문단이 여러 개면 문단마다 줄을 바꾸세요.`;
  return { system, prompt };
}

// ───────────────────────── 글감 추천 ─────────────────────────

export function ideasPrompt(blog: Blog, existingTitles: string[], hint: string, trendContext = "") {
  const system = `당신은 블로그 콘텐츠 전략가입니다. JSON 객체 하나만 출력합니다.
- 검색량, 경쟁도, 트렌드 수치 등 실제로 조회하지 않은 지표는 절대 쓰지 마세요.
- 추천 이유는 블로그 주제 적합성과 독자 관점으로만 설명하세요.`;
  const prompt = `${blogContext(blog,["keywords","title"])}

${trendContext}
[이미 등록된 글감 - 중복 금지]
${existingTitles.slice(0, 50).join("\n") || "(없음)"}

[추가 요청]
${hint || "(없음)"}

다음 형식으로 글감 6개를 추천하세요:
{"ideas": [{"title": "글감 제목", "keywords": ["키워드"], "reason": "추천 이유 (수치 없이)"}]}`;
  return { system, prompt };
}

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ✂️ 캡처·여러 문단 수정: 표·목록·굵은 글씨 구조를 그대로 살려 HTML 로 고침 */
export function editHtmlPrompt(blog: Blog, html: string, instruction: string, context: string, hasImage = false) {
  const system = `당신은 블로그 원고 편집자입니다. 받은 HTML 조각에서 수정 지시대로 고친 HTML 조각만 출력합니다 (설명·마크다운·코드블록 없이).
- 쓸 수 있는 태그: p, h2, h3, strong, em, u, s, ul, ol, li, blockquote, table, thead, tbody, tr, th, td, a, br
- 지시가 없으면 원래 구조를 그대로 두세요: 표는 표로(행·열 구조 유지), 목록은 목록으로, 소제목은 소제목으로. 표에 행·열을 더하거나 칸 안 글만 바꾸는 식으로 고치세요.
- 지시와 관계없는 칸·문장은 글자 하나도 바꾸지 마세요. 확인할 수 없는 숫자·사실을 지어내지 마세요.${BASE_RULES}`;
  const prompt = `${blogContext(blog,"body")}

${styleSamplesText(blog)}
[주변 문맥 - 참고만]
${context.slice(0, 3000)}

[수정할 부분 - HTML]
${html.slice(0, 20000)}

[수정 지시]
${instruction}
${hasImage ? "\n[첨부한 캡처] 사용자가 고칠 곳을 화면에서 드래그해 잘라낸 캡처예요. 위 HTML 이 그 영역이에요. 사용자가 보는 모양을 참고하세요.\n" : ""}
고친 HTML 조각만 출력하세요.`;
  return { system, prompt };
}
