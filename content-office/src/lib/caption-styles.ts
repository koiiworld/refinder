/** 캐러셀 캡션 스타일 (화면·서버 공용) */
export const CAPTION_STYLES = [
  { id: "hook", label: "짧게 + 후킹 멘트", rule: "첫 줄은 궁금증을 만드는 후킹 한 줄(40자 이내), 이어서 핵심만 2~3줄로 짧게. 저장·공유를 부르는 한 줄로 마무리." },
  { id: "recipe", label: "상세한 레시피", rule: "재료(분량 포함)와 조리 순서를 번호 목록으로 자세히. 카드에 나온 재료·순서·수치를 빠짐없이 정확하게. 마지막에 팁 한 줄." },
  { id: "info", label: "정보 전달 확실하게", rule: "핵심 정보를 항목별로 정리해 분명하게 전달. 숫자·기준·주의점을 구체적으로. 감탄사와 과장은 빼고 담백하게." },
  { id: "summary", label: "블로그 내용 요약", rule: "참고 원문(블로그 글)의 핵심을 4~6줄로 요약. 마지막 줄에 '전체 내용은 프로필 링크에서'를 넣기." },
  { id: "story", label: "경험담·공감형", rule: "직접 해 본 사람의 말투로 상황·느낌을 담아 공감을 이끌고, 핵심 정보 2~3개를 자연스럽게 녹이기." },
] as const;
export type CaptionStyleId = (typeof CAPTION_STYLES)[number]["id"];
export function captionStyleRule(id?: string) {
  return CAPTION_STYLES.find((s) => s.id === id)?.rule ?? "";
}

/** 해시태그 입력값 정리: 띄어쓰기·쉼표·줄바꿈으로 나누고 # 붙이기 */
export function hashtagTokens(raw: string) {
  return raw.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);
}
export function formatHashtags(raw: string, openNext: boolean) {
  const tokens = [...new Set(hashtagTokens(raw))];
  const out = tokens.map((t) => "#" + t).join(" ");
  return openNext ? (out ? out + " #" : "#") : out;
}
