import type { Blog } from "../types";
import { blogContext, styleSamplesText } from "./prompts";

const NO_FAKE = `- 검색량·순위·통계 수치를 지어내지 마세요. 아래에 주어진 실제 데이터만 근거로 쓰세요.
- 확인되지 않은 사실은 단정하지 말고 "[확인 필요]"로 표시하세요.
- 한국어로 작성하세요.`;

// ───────── ① 키워드 추천 ─────────
export function keywordsPrompt(blog: Blog, ctx: { seasons: string; creator: string; youtube: string; existing: string[]; hint: string; written?: string[] }) {
  const system = `당신은 한국 블로그 SEO 키워드 전문가입니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}

[지금 다가오는 시즌·기념일]
${ctx.seasons || "(없음)"}
${ctx.creator}
${ctx.youtube ? `[유튜브 한국 인기 급상승 영상에서 자주 나온 단어 - 실제 조회 데이터]\n${ctx.youtube}\n` : ""}
[최근에 이미 고른 키워드 - 중복 금지]
${ctx.existing.join(", ") || "(없음)"}
${ctx.written?.length ? `\n[이 블로그에 이미 쓴 글 제목 - 블로그 RSS·앱 기록 (같은 주제·같은 제품 비교는 다시 추천하지 말 것)]\n${ctx.written.map((t) => `- ${t}`).join("\n")}\n` : ""}
[추가 요청]
${ctx.hint || "(없음)"}

이 블로그 분야에서 지금 글을 쓰면 검색 유입이 기대되는 키워드 15개를 추천하세요.
- 사람들이 실제 검색창에 치는 짧은 핵심 키워드(1~3어절) 위주로 쓰세요. 문장형 키워드는 피하세요.
- 시즌·트렌드와 블로그 분야가 겹치는 키워드를 우선하세요.
- 이미 쓴 글과 주제가 겹치면 빼세요. 같은 분야라도 아직 다루지 않은 제품·상황·질문을 고르세요.
형식: {"keywords": [{"keyword": "키워드", "reason": "추천 이유 한 줄 (수치 없이)", "season": "관련 시즌 이름 또는 빈 문자열"}]}`;
  return { system, prompt };
}

// ───────── ③ SEO 제목 추천·선택 ─────────
const briefText = (b?: import("../posts-types").PostBrief) =>
  b ? `\n[이 글의 기획 - 핫이슈 리포트에서 블로그 주인이 승인한 글감]\n이슈: ${b.issue}\n추천 제목: ${b.title}\n선정 이유: ${b.why}\n콘텐츠 방향: ${b.direction}\n원출처: ${b.sources.map((s) => `${s.title} (${s.url})`).join(" / ") || "(없음)"}\n` : "";

export function titlesPrompt(blog: Blog, keywords: string[], related: { keyword: string; total: number }[], written: string[] = [], brief?: import("../posts-types").PostBrief) {
  const system = `당신은 네이버·구글 SEO 제목 전문가입니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}
${styleSamplesText(blog)}
[사용자가 고른 키워드 - 첫 번째가 메인]
${keywords.join(", ")}
${briefText(brief)}
[네이버 연관 키워드와 월간 검색수 - 네이버 검색광고 실제 데이터]
${related.length ? related.map((r) => `${r.keyword}: ${r.total.toLocaleString()}`).join("\n") : "(데이터 없음)"}

${written.length ? `[이 블로그에 이미 쓴 글 제목 - 이 글들과 겹치지 않게]\n${written.map((t) => `- ${t}`).join("\n")}\n\n` : ""}블로그 글 제목 후보 6개를 만들고 가장 좋은 하나를 고르세요. 사용자가 이 중에서 직접 고릅니다.
- 이미 쓴 글과 내용이 겹치지 않도록 다른 각도(다른 제품·대상·상황·질문)를 잡으세요. 겹칠 수밖에 없으면 reason 에 "기존 글 ○○과 비슷함"이라고 적으세요.
- 메인 키워드를 제목 앞쪽에 자연스럽게 넣으세요. 고른 키워드가 여러 개면 한 글 주제로 묶어 함께 녹이세요.
- 같은 단어·키워드를 한 제목에 두 번 넣지 마세요 (예: "닭볶음탕 만들기 닭볶음탕만들기" 처럼 띄어쓰기만 바꾼 반복 금지). 키워드 나열식 제목 금지.
- 사람이 직접 쓴 것처럼 자연스러운 한 문장으로, 읽는 사람이 얻는 것(비교, 방법, 비율, 기준, 실패 없는 팁 등)이 드러나게.
- 후보끼리 각도를 다르게 (정보형, 비교형, 초보자용, 숫자·기준 제시형 등).
- 25~35자, 낚시성 과장·특수문자 남발 금지, 위 블로그 문체·예시 글의 분위기에 맞게.
- '｜' '|' '[]' '【】' 같은 구분 기호로 키워드를 나열하지 말고 쉼표나 자연스러운 이음말로 한 문장처럼 쓰세요 (예시 글 제목에 기호가 있어도 따라 하지 말 것).
형식: {"candidates": [{"title": "제목", "reason": "이유"}], "best": 0, "bestReason": "이 제목을 고른 이유", "subKeywords": ["본문에 넣을 연관 키워드 3~6개"]}
best 는 candidates 의 번호(0부터)입니다.`;
  return { system, prompt };
}

// ───────── ③-2 기획안 (목차·핵심 주장·근거·이미지 계획) ─────────
export function outlinePrompt(blog: Blog, input: { title: string; keyword: string; subKeywords: string[]; brief?: import("../posts-types").PostBrief }) {
  const system = `당신은 "${blog.name}" 블로그의 편집 기획자입니다. 글을 쓰기 전에 목차와 근거를 설계합니다. 확인할 수 없는 사실을 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}
[제목] ${input.title}
[메인 키워드] ${input.keyword}
[함께 넣을 키워드] ${input.subKeywords.join(", ") || "(없음)"}
${briefText(input.brief)}
이 제목으로 쓸 글의 기획안을 만드세요.
- sections: 소제목 4~7개. 각 소제목마다 들어갈 내용 points 2~3개 (짧게)
- claims: 글의 핵심 주장·사실 3~6개. evidence 에는 근거(경험·공식 발표·일반 상식 등), source 에는 확인할 공식 출처(기관·사이트 이름이나 주소, 모르면 빈 문자열), check 는 블로그 주인이 확인해야 하는 사실(금액·날짜·정책·수치)이면 true
- images: 넣을 사진 2~4개. n 은 순서, what 은 무엇을 찍은/그린 사진인지
형식: {"sections": [{"heading": "", "points": [""]}], "claims": [{"claim": "", "evidence": "", "source": "", "check": true}], "images": [{"n": 1, "what": ""}]}`;
  return { system, prompt };
}

// ───────── ④ 글 작성 (해시태그·이미지 프롬프트 포함) ─────────
export function writePrompt(blog: Blog, input: { title: string; keyword: string; subKeywords: string[]; feedback?: string; previousHtml?: string; myPosts?: { title: string; url: string }[]; titleByUser?: boolean; brief?: import("../posts-types").PostBrief; outline?: import("../posts-types").PostOutline }) {
  const posts = (input.myPosts ?? []).filter((p) => p.title.trim() !== input.title.trim());
  const system = `당신은 "${blog.name}" 블로그의 전속 작가입니다. 블로그 문체를 정확히 따릅니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}
${styleSamplesText(blog)}
[제목] ${input.title}${input.titleByUser ? "\n(사용자가 직접 고친 제목입니다. 제목에 나온 제품·모델·주제·각도를 기준으로 본문을 쓰세요. 메인 키워드와 다르면 제목을 따르세요.)" : ""}
[메인 키워드] ${input.keyword}
[함께 넣을 키워드] ${input.subKeywords.join(", ") || "(없음)"}
${input.outline?.approved ? `\n[승인된 기획안 - 이 목차·주장 순서대로 쓰고, check 표시된 사실은 출처가 없으면 단정하지 말 것]\n${input.outline.sections.map((s, i) => `${i + 1}. ${s.heading} — ${s.points.join(" / ")}`).join("\n")}\n주장·근거: ${input.outline.claims.map((c) => `${c.claim} (근거: ${c.evidence}${c.source ? ` · 출처: ${c.source}` : ""}${c.check ? " · 확인 필요" : ""})`).join(" / ")}\n이미지 계획: ${input.outline.images.map((m) => `[이미지 ${m.n}] ${m.what}`).join(" / ")}\n` : ""}${input.brief ? `${briefText(input.brief)}- 위 기획의 방향을 따르되, 원출처에서 확인되는 사실만 쓰고 확실하지 않은 숫자·날짜는 [확인 필요]로 두세요. 본문 끝에 참고한 원출처를 '참고:' 로 짧게 밝히세요.\n` : ""}${posts.length ? `\n[내 블로그의 실제 글 목록 - 블로그 RSS에서 가져옴 (제목 | 주소)]\n${posts.map((p) => `- ${p.title} | ${p.url}`).join("\n")}\n` : ""}${input.previousHtml ? `\n[이전 원고]\n${input.previousHtml}\n` : ""}${input.feedback ? `\n[수정 요청 - 반드시 반영]\n${input.feedback}\n` : ""}
블로그 본문을 작성하세요.
- html: 본문 HTML 조각 (h2, h3, p, ul, ol, li, strong, table, blockquote, a 만 사용, 제목 h1 은 쓰지 않음)${posts.length ? `
  - 글 끝에서 다른 글을 소개할 때는(블로그 문체의 마무리 규칙이 있으면 그대로 따름) 위 '내 블로그의 실제 글 목록'에서 이 글 주제와 관련 깊은 글 2~3개만 골라 <a href="주소">제목</a> 으로 넣으세요. 목록에 없는 글 제목·주소는 절대 만들지 마세요.` : ""}
  - 메인 키워드를 도입부와 소제목에 자연스럽게 넣으세요.
  - 이미지가 들어갈 자리에는 정확히 <p>[이미지 1]</p>, <p>[이미지 2]</p> 처럼 번호만 적은 문단을 넣으세요 (2~4곳).
${
    blog.image_source === "official"
      ? `- images: 위 이미지 자리 번호 순서대로. 이 블로그는 AI 이미지를 만들지 않고 **제조사 공식 홈페이지의 제품 이미지**를 씁니다.
  - product: 그 자리에 들어갈 실제 제품 이름 (예: "Mac mini (M6)")
  - pageUrl: 그 제품의 공식 홈페이지(한국 사이트 우선)나 공식 뉴스룸 제품 페이지 주소. 확실히 아는 주소만 쓰고, 모르면 빈 문자열
  - credit: 본문에 붙일 출처 표기 (예: "출처: Apple", "출처: 삼성전자 뉴스룸")
  - alt: 한국어 이미지 설명 (대체 텍스트)
  - prompt: 빈 문자열
형식: {"html": "...", "images": [{"product": "...", "pageUrl": "https://...", "credit": "출처: ...", "alt": "...", "prompt": ""}]}`
      : `- images: 위 이미지 자리 번호 순서대로, Higgsfield 이미지 생성용 프롬프트
  - prompt: 영어. [주체] + [배경] + [구도·카메라] + [조명] + [스타일]. 블로그 이미지 스타일 "${blog.image_style}"를 반영. 글자·손·복잡한 동작은 피함
  - alt: 한국어 이미지 설명 (대체 텍스트)
  - aspect: "1:1", "4:3", "3:4", "2:3", "3:2", "16:9", "9:16" 중 하나 (블로그 이미지 스타일에 비율 규칙이 있으면 그대로 따름. 이미지 1번이 대표(메인) 이미지)
형식: {"html": "...", "images": [{"prompt": "...", "alt": "...", "aspect": "4:3"}]}`
  }`;
  return { system, prompt };
}

// ───────── ⑥ 글·이미지 검수 ─────────
/** ④ 해시태그: 글을 다 쓴 뒤 가벼운(무료) 모델이 따로 뽑음 */
export function hashtagsPrompt(blog: Blog, input: { title: string; keyword: string; subKeywords: string[]; html: string }) {
  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
  const system = `당신은 "${blog.name}" 블로그의 해시태그 담당자입니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `[플랫폼] ${blog.platform === "tistory" ? "티스토리" : "네이버 블로그"}
[제목] ${input.title}
[메인 키워드] ${input.keyword}
[보조 키워드] ${input.subKeywords.join(", ") || "(없음)"}
[본문 요약용 텍스트] ${text}

이 글에 붙일 해시태그 8~15개를 뽑으세요.
- 메인 키워드는 반드시 포함, 실제로 검색할 만한 한국어 단어 위주
- # 없이 단어만, 띄어쓰기 없이 (예: 김장양념)
- 본문과 관계없는 인기 태그·중복 태그 금지
형식: {"hashtags": ["...", "..."]}`;
  return { system, prompt };
}

export function postReviewPrompt(blog: Blog, input: { title: string; keyword: string; html: string; hashtags: string[]; images: { alt: string; prompt: string; url?: string | null; kind?: string; product?: string; credit?: string }[] }) {
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
${input.images.map((im, i) => (im.kind === "official" ? `${i + 1}. ${im.alt} [공식 이미지: ${im.product || "제품"} · ${im.credit || "출처 미표기"}] ${im.url ? "(선택됨, 첨부 - 제품과 맞는지 확인)" : "(아직 선택 안 됨)"}` : `${i + 1}. ${im.alt} ${im.url ? "(생성됨, 첨부)" : "(아직 생성 안 됨 - 프롬프트만 검토)"}\n   프롬프트: ${im.prompt}`)).join("\n") || "(없음)"}

[본문 HTML]
${input.html}

간결하게 검수하세요. 중요한 지적 위주로 issues 최대 8개, factChecks 최대 8개, 각 설명은 1~2문장. 본문을 다시 옮겨 적지 마세요.
- 제목·본문에서 확인되지 않은 사실을 단정한 부분(예: 아직 확정 안 된 정책을 "달라진"으로 단정, 출처 없는 금액·날짜)은 type "fact" 로 지적하세요. 원문 출처 주소가 본문에 있으면 fact 로 지적하지 마세요.
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

// ───────── ⑥ 검수 지적 반영 (AI 수정) ─────────
export function fixPrompt(blog: Blog, input: { title: string; html: string; issues: { type: string; severity: string; quote: string; comment: string; suggestion: string; userNote?: string }[]; general?: string }) {
  const general = input.general?.trim();
  const system = `당신은 "${blog.name}" 블로그의 전속 작가입니다. 편집자의 검수 지적을 반영해 원고를 고칩니다. 반드시 JSON 객체 하나만 출력합니다.\n${NO_FAKE}`;
  const prompt = `${blogContext(blog)}
${styleSamplesText(blog)}
[제목] ${input.title}

${input.issues.length ? "[고쳐야 할 검수 지적]\n" : ""}${input.issues.map((it, i) => `${i + 1}. (${it.severity}/${it.type}) 문제 부분: "${it.quote}"\n   설명: ${it.comment}\n   수정 제안: ${it.suggestion || "(없음)"}${it.userNote?.trim() ? `\n   ★ 블로그 주인 코멘트 (수정 제안보다 우선, 반드시 따를 것): ${it.userNote.trim()}` : ""}`).join("\n")}
${general ? `
[★ 글 전체 수정사항 — 블로그 주인 요청 (반드시 반영)]
${general}
- 요청이 짧아도(예: "OO 정책 추가해줘") 글의 주제·흐름에 맞는 위치를 골라, 필요하면 소제목·문단을 새로 만들어 기존 말투로 자연스럽게 녹여 넣으세요.
- 빼 달라는 내용은 지우고 앞뒤 문장이 매끄럽게 이어지도록 다듬으세요. 목차·요약·마무리에 같은 내용이 있으면 함께 맞추세요.
- 추가하는 금액·날짜·조건 등이 확실하지 않으면 지어내지 말고 [확인 필요]로 표시하세요.
` : ""}
[현재 원고 HTML]
${input.html}

위 ${input.issues.length ? "지적" : ""}${input.issues.length && general ? "과 " : ""}${general ? "글 전체 수정사항" : ""}만 반영해 원고를 고치세요.
- 요청·지적과 관계없는 문장·구성·말투는 그대로 두세요 (전체를 새로 쓰지 말 것).
- <img ...> 태그, 출처 문단, <p>[이미지 N]</p> 자리 표시는 그대로 두세요.
- 확인할 수 없는 사실은 지어내지 말고, 단정하지 않는 표현으로 바꾸거나 [확인 필요]로 두세요.
- changes: 무엇을 어떻게 고쳤는지 지적 번호별로 한 줄씩${general ? " (글 전체 수정사항은 \"전체: ...\"로)" : ""}
형식: {"html": "고친 전체 본문 HTML", "changes": ["1. ...", "2. ..."]}`;
  return { system, prompt };
}
