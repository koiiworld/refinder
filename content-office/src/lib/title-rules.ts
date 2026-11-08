import {rulesForScope} from "./blog-rule-types";
import type {Blog} from './types';
export const DEFAULT_TITLE_FORBIDDEN=['|','｜'];
export const DEFAULT_TITLE_RULES=['키워드를 나열하지 않고 자연스러운 한 문장으로 쓴다','과장하거나 확인되지 않은 효과·수익을 약속하지 않는다'];
export function titleLists(blog:Pick<Blog,'title_rules'|'title_forbidden'|'common_rules'>){const common=rulesForScope(blog,'title');return {rules:[...new Set([...(blog.title_rules??DEFAULT_TITLE_RULES),...common.flatMap(r=>r.rules)])],forbidden:[...new Set([...(blog.title_forbidden??DEFAULT_TITLE_FORBIDDEN),...common.flatMap(r=>r.forbidden)])]};}
export function parseTitleList(value:unknown){
  if(!Array.isArray(value)||value.length>50||value.some(x=>typeof x!=='string'||x.length>500))throw new Error('제목 규칙·금지 표현은 한 줄에 하나씩, 최대 50개·줄당 500자로 입력해 주세요.');
  return Array.from(new Set(value.map(x=>x.trim()).filter(Boolean)));
}
export function titleRulesText(blog:Pick<Blog,'title_rules'|'title_forbidden'|'common_rules'>){const {rules,forbidden}=titleLists(blog);return `[사용자가 저장한 제목 전용 규칙 — 예시 글보다 우선, 제목 생성·수정·검수에 적용]\n작성 규칙:\n${rules.map(x=>'- '+x).join('\n')||'(없음)'}\n제목 금지 문자·표현(문자 그대로 포함하지 말 것): ${JSON.stringify(forbidden)}\n자연어 규칙은 제목 검수의 ruleChecks에도 확인하세요. 금지 표현 위반은 rule 문제로 표시하며 검색 순위 하락을 단정하지 마세요.`;}
export function forbiddenInTitle(title:string,blog:Pick<Blog,'title_rules'|'title_forbidden'|'common_rules'>){const normalized=title.normalize('NFKC').toLowerCase();return titleLists(blog).forbidden.filter(x=>normalized.includes(x.normalize('NFKC').toLowerCase()));}
/** 기호 금지는 공백으로 정리하고, 단어 금지를 어긴 후보는 사용하지 않음. 유료 재호출 없음. */
export function cleanTitleCandidate(title:string,blog:Pick<Blog,'title_rules'|'title_forbidden'|'common_rules'>){let result=title.normalize('NFKC');for(const x of titleLists(blog).forbidden){if(/^[\p{P}\p{S}]+$/u.test(x))result=result.split(x.normalize('NFKC')).join(' ');}result=result.replace(/\s+/g,' ').trim();return forbiddenInTitle(result,blog).length?'':result;}
