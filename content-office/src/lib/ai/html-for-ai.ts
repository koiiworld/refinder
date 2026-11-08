/**
 * 본문 HTML 을 AI 에 보낼 때: 편집기에 직접 올린 사진(data:image/...;base64,…)은 글자 수가 수백만 개라
 * AI 한도를 넘어 버림 (예: 640만 토큰). → 짧은 표시(data-ai-img="N")로 바꿔 보내고,
 * AI 가 돌려준 HTML 에서는 원래 사진으로 되돌림 (사진이 사라지지 않게)
 */
const DATA_URI = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;

export function shrinkHtml(html: string) {
  const saved: string[] = [];
  const out = String(html ?? "").replace(DATA_URI, (m) => {
    saved.push(m);
    return `ai-image:${saved.length}`;
  });
  return {
    html: out,
    count: saved.length,
    /** AI 가 돌려준 HTML 의 표시를 원래 사진으로 */
    restore(aiHtml: string) {
      return String(aiHtml ?? "").replace(/ai-image:(\d+)/g, (m, n) => saved[Number(n) - 1] ?? m);
    },
  };
}

/** 보내기만 할 때 (검수 등): 사진 자리는 짧게 */
export const htmlForAi = (html: string) => shrinkHtml(html).html;
