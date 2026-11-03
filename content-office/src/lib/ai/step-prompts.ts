import type { Blog } from "../types";
import { blogContext, styleSamplesText } from "./prompts";

const NO_FAKE = `- 검색량·순위·통계 수치를 지어내지 마세요. 아래에 주어진 실제 데이터만 근거로 쓰세요.
- 확인되지 않은 사실은 단정하지 말고 "[확인 필요]"로 표시하세요.
- 한국어로 작성하세요.`;

// ───────── ① 키워드 추천 ─────────
export function keywordsPrompt(blog: Blog, ctx: { seasons: string; creator: string; youtube: string; existing: string[]; hint: string }) {
  const system = `당신은 한국 블로그 SEO 키워드 전문가입니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}

[지금 다가오는 시즌·기념일]
${ctx.seasons || "(없음)"}
${ctx.creator}
${ctx.youtube ? `[유튜브 한국 인기 급상승 영상에서 자주 나온 단어 - 실제 조회 데이터]\n${ctx.youtube}\n` : ""}
[최근에 이미 고른 키워드 - 중복 금지]
${ctx.existing.join(", ") || "(없음)"}

[추가 요청]
${ctx.hint || "(없음)"}

이 블로그 분야에서 지금 글을 쓰면 검색 유입이 기대되는 키워드 15개를 추천하세요.
- 사람들이 실제 검색창에 치는 짧은 핵심 키워드(1~3어절) 위주로 쓰세요. 문장형 키워드는 피하세요.
- 시즌·트렌드와 블로그 분야가 겹치는 키워드를 우선하세요.
형식: {"keywords": [{"keyword": "키워드", "reason": "추천 이유 한 줄 (수치 없이)", "season": "관련 시즌 이름 또는 빈 문자열"}]}`;
  return { system, prompt };
}

// ───────── ③ SEO 제목 추천·선택 ─────────
export function titlesPrompt(blog: Blog, keyword: string, related: { keyword: string; total: number }[]) {
  const system = `당신은 네이버·구글 SEO 제목 전문가입니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}

[메인 키워드]
${keyword}

[네이버 연관 키워드와 월간 검색수 - 네이버 검색광고 실제 데이터]
${related.length ? related.map((r) => `${r.keyword}: ${r.total.toLocaleString()}`).join("\n") : "(데이터 없음)"}

블로그 글 제목 후보 5개를 만들고 가장 좋은 하나를 고르세요.
- 메인 키워드를 제목 앞쪽에 넣고, 검색수가 큰 연관 키워드를 자연스럽게 1~2개 포함하세요.
- 30자 안팎, 낚시성 과장·특수문자 남발 금지, 블로그 문체에 맞게.
형식: {"candidates": [{"title": "제목", "reason": "이유"}], "best": 0, "bestReason": "이 제목을 고른 이유", "subKeywords": ["본문에 넣을 연관 키워드 3~6개"]}
best 는 candidates 의 번호(0부터)입니다.`;
  return { system, prompt };
}

// ───────── ④ 글 작성 (해시태그·이미지 프롬프트 포함) ─────────
export function writePrompt(blog: Blog, input: { title: string; keyword: string; subKeywords: string[]; feedback?: string; previousHtml?: string }) {
  const system = `당신은 "${blog.name}" 블로그의 전속 작가입니다. 블로그 문체를 정확히 따릅니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}
${styleSamplesText(blog)}
[제목] ${input.title}
[메인 키워드] ${input.keyword}
[함께 넣을 키워드] ${input.subKeywords.join(", ") || "(없음)"}
${input.previousHtml ? `\n[이전 원고]\n${input.previousHtml}\n` : ""}${input.feedback ? `\n[수정 요청 - 반드시 반영]\n${input.feedback}\n` : ""}
블로그 본문을 작성하세요.
- html: 본문 HTML 조각 (h2, h3, p, ul, ol, li, strong, table, blockquote 만 사용, 제목 h1 은 쓰지 않음)
  - 메인 키워드를 도입부와 소제목에 자연스럽게 넣으세요.
  - 이미지가 들어갈 자리에는 정확히 <p>[이미지 1]</p>, <p>[이미지 2]</p> 처럼 번호만 적은 문단을 넣으세요 (2~4곳).
- hashtags: 해시태그 8~15개 (# 없이 단어만, 띄어쓰기 없이)
- images: 위 이미지 자리 번호 순서대로, Higgsfield 이미지 생성용 프롬프트
  - prompt: 영어. [주체] + [배경] + [구도·카메라] + [조명] + [스타일]. 블로그 이미지 스타일 "${blog.image_style}"를 반영. 글자·손·복잡한 동작은 피함
  - alt: 한국어 이미지 설명 (대체 텍스트)
  - aspect: "1:1", "4:3", "3:4", "16:9", "9:16" 중 하나
형식: {"html": "...", "hashtags": ["..."], "images": [{"prompt": "...", "alt": "...", "aspect": "4:3"}]}`;
  return { system, prompt };
}

// ───────── ⑥ 글·이미지 검수 ─────────
export function postReviewPrompt(blog: Blog, input: { title: string; keyword: string; html: string; hashtags: string[]; images: { alt: string; prompt: string; url?: string | null }[] }) {
  const system = `당신은 까다로운 블로그 편집장이자 팩트체커입니다. 다른 AI가 쓴 글과 이미지를 검수합니다. 반드시 JSON 객체 하나만 출력합니다.
- 인터넷 검색은 하지 않습니다. 확실하지 않은 사실은 "확인 필요"로 둡니다.
- 이미지가 첨부되어 있으면 직접 보고, 글 내용과 맞는지·어색한 부분(손가락, 글자 깨짐, 왜곡)이 있는지 확인하세요.
- 한국어로 작성하세요.`;
  const prompt = `${blogContext(blog)}
${styleSamplesText(blog)}
[제목] ${input.title}
[메인 키워드] ${input.keyword}
[해시태그] ${input.hashtags.map((h) => "#" + h).join(" ")}
[이미지]
${input.images.map((im, i) => `${i + 1}. ${im.alt} ${im.url ? "(생성됨, 첨부)" : "(아직 생성 안 됨 - 프롬프트만 검토)"}\n   프롬프트: ${im.prompt}`).join("\n") || "(없음)"}

[본문 HTML]
${input.html}

다음 형식으로 검수하세요:
{
  "summary": "총평 (3문장 이내)",
  "score": 0~100 정수,
  "issues": [{"type": "fact|source|style|seo|rule|image|other", "severity": "high|medium|low", "quote": "문제 부분", "comment": "설명", "suggestion": "수정 제안"}],
  "factChecks": [{"claim": "사실 주장", "status": "consistent_with_sources|needs_verification|likely_incorrect", "note": ""}],
  "ruleChecks": [{"rule": "블로그 검수 규칙 원문", "passed": true, "note": ""}],
  "imageChecks": [{"index": 1, "ok": true, "note": "이미지 확인 의견"}]
}`;
  return { system, prompt };
}
