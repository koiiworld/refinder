import 'server-only';
import {q,q1,j,newId} from './db';
import {BLOG_RULE_SCOPES,type CommonBlogRule,type BlogRuleTarget} from './blog-rule-types';
export async function listCommonBlogRules(){return q<CommonBlogRule>('SELECT id,rules,forbidden,scopes,target,enabled FROM blog_common_rules ORDER BY created_at,id');}
export async function commonRulesForBlog(blog:{id:string;platform:string}){return (await listCommonBlogRules()).filter(r=>r.enabled&&(r.target.mode==='all'||r.target.mode==='platform'&&r.target.values.includes(blog.platform)||r.target.mode==='blogs'&&r.target.values.includes(blog.id)));}
function lines(value:unknown){if(!Array.isArray(value)||value.length>50||value.some(x=>typeof x!=='string'||x.length>500))throw new Error('규칙·금지 사항은 최대 50줄, 한 줄에 500자 이하로 입력해 주세요.');return [...new Set(value.map(x=>x.trim()).filter(Boolean))];}
export async function saveCommonBlogRules(b:Record<string,unknown>){
  const old=b.id?await q1<CommonBlogRule>('SELECT * FROM blog_common_rules WHERE id=$1',[String(b.id)]):null;
  if(b.id&&!old)throw new Error('공통 규칙을 찾을 수 없어요.');
  const rules=lines(b.rules??old?.rules??[]),forbidden=lines(b.forbidden??old?.forbidden??[]);
  if(!rules.length&&!forbidden.length)throw new Error('규칙이나 금지 사항을 한 줄 이상 입력해 주세요.');
  const scopes=b.scopes??old?.scopes;if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>typeof s!=='string'||!Object.keys(BLOG_RULE_SCOPES).includes(s)))throw new Error('적용 분야를 하나 이상 선택해 주세요.');
  const target=(b.target??old?.target) as BlogRuleTarget|undefined;
  if(!target||!['all','platform','blogs'].includes(target.mode)||!Array.isArray(target.values)||target.values.some(x=>typeof x!=='string'))throw new Error('적용할 블로그를 선택해 주세요.');
  if(target.mode!=='all'&&!target.values.length)throw new Error('적용할 블로그 또는 플랫폼을 선택해 주세요.');
  if(target.mode==='platform'&&target.values.some(x=>!['naver','tistory','wordpress','other'].includes(x)))throw new Error('플랫폼을 확인해 주세요.');
  if(target.mode==='blogs'){const blogs=await q<{id:string}>('SELECT id FROM blogs WHERE id=ANY($1)',[target.values]);if(target.values.some(x=>!blogs.some(blog=>blog.id===x)))throw new Error('선택한 블로그를 찾을 수 없어요.');}
  if(b.enabled!==undefined&&typeof b.enabled!=='boolean')throw new Error('사용 여부를 확인해 주세요.');
  const id=old?.id??newId('brule_');await q(`INSERT INTO blog_common_rules(id,rules,forbidden,scopes,target,enabled) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET rules=$2,forbidden=$3,scopes=$4,target=$5,enabled=$6`,[id,j(rules),j(forbidden),j([...new Set(scopes)]),j(target.mode==='all'?{mode:'all',values:[]}:target),b.enabled??old?.enabled??true]);
  return listCommonBlogRules();
}
