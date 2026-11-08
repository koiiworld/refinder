export const BLOG_RULE_SCOPES={keywords:'키워드 추천',title:'제목',body:'본문',image:'이미지',review:'검수'} as const;
export type BlogRuleScope=keyof typeof BLOG_RULE_SCOPES;
export type BlogRuleTarget={mode:'all'|'platform'|'blogs';values:string[]};
export type CommonBlogRule={id:string;rules:string[];forbidden:string[];scopes:BlogRuleScope[];target:BlogRuleTarget;enabled:boolean};
export function rulesForScope(blog:{common_rules?:CommonBlogRule[]},scope:BlogRuleScope){return (blog.common_rules??[]).filter(r=>r.enabled&&r.scopes.includes(scope));}
export function commonRulesText(blog:{common_rules?:CommonBlogRule[]},scopes:BlogRuleScope|BlogRuleScope[]){const wanted=Array.isArray(scopes)?scopes:[scopes];const rows=(blog.common_rules??[]).filter(r=>r.enabled&&r.scopes.some(s=>wanted.includes(s)));return rows.length?'\n[적용 중인 블로그 공통 규칙 — 해당 분야에 적용, 예시보다 우선]\n'+rows.map(r=>`적용 분야: ${r.scopes.filter(s=>wanted.includes(s)).map(s=>BLOG_RULE_SCOPES[s]).join(', ')}\n작성 규칙:\n${r.rules.map(x=>'- '+x).join('\n')||'(없음)'}\n금지 사항:\n${r.forbidden.map(x=>'- '+x).join('\n')||'(없음)'}`).join('\n'):'';}
