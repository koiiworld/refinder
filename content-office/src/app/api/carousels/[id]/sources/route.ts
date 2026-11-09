import {handle,ok,fail,type Ctx} from '@/lib/api';
import {getCarousel} from '@/lib/carousel';
import {listBlogs} from '@/lib/repo';
import {naverSearch} from '@/lib/diagnose';
export async function GET(req:Request,ctx:Ctx){return handle(async()=>{
 const carousel=await getCarousel((await ctx.params).id);if(!carousel)return fail('캐러셀을 찾을 수 없습니다.',404);
 const p=new URL(req.url).searchParams,query=(p.get('query')??'').trim(),start=Number(p.get('start')??1);
 if(!query||query.length>100||!Number.isInteger(start)||start<1||start>1000)return fail('검색어는 100자 이내로 입력해 주세요.');
 const blogs=(await listBlogs()).filter(b=>!carousel.blog_id||carousel.blog_id===b.id);
 const results=await Promise.all(blogs.map(async blog=>{
  let home:URL;try{home=new URL(blog.url);}catch{return {items:[],more:false};}
  const naver=['blog.naver.com','m.blog.naver.com'].includes(home.hostname);
  const id=naver?(home.searchParams.get('blogId')||home.pathname.split('/').filter(Boolean)[0]):null;
  if(naver&&(!id||!/^[\w-]{1,64}$/.test(id)))return {items:[],more:false};
  const site=naver?`blog.naver.com/${id}`:home.hostname;
  const r=await naverSearch(naver?'blog':'webkr',`${query} site:${site}`,100,'sim',start);
  const items=r.items.flatMap(item=>{
   try{const u=new URL(item.link);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return [];
    if(naver){if(!['blog.naver.com','m.blog.naver.com'].includes(u.hostname))return [];const parts=u.pathname.split('/').filter(Boolean);const owner=u.searchParams.get('blogId')||parts[0],no=u.searchParams.get('logNo')||parts[1];if(owner?.toLowerCase()!==id!.toLowerCase()||!/^\d+$/.test(no??''))return [];return [{title:item.title,url:`https://blog.naver.com/${id}/${no}`,blog:blog.name}];}
    if(u.hostname!==home.hostname||u.pathname==='/'||!item.title)return [];
    u.hash='';return [{title:item.title,url:u.href,blog:blog.name}];
   }catch{return [];}
  });
  return {items,more:start+100<=1000&&r.total>=start+100};
 }));
 const items=[...new Map(results.flatMap(r=>r.items).map(p=>[p.url,p])).values()];
 return ok({items,nextStart:results.some(r=>r.more)?start+100:null,note:'네이버 검색에 노출된 공개 글 기준입니다. 누락된 글은 주소를 직접 넣어 주세요.'});
});}
