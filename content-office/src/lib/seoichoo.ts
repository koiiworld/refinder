import 'server-only';
import {q,q1,j,newId} from './db';
export type SeoJob={id:string;blog_id:string;kind:string;payload:Record<string,unknown>;status:string;result:Record<string,unknown>;cancelled:boolean;created_at:string;updated_at:string};
export async function seoJobs(blogId?:string){return q<SeoJob>(`SELECT * FROM seoichoo_jobs ${blogId?'WHERE blog_id=$1':''} ORDER BY created_at DESC LIMIT 60`,blogId?[blogId]:[]);}
export async function queueSeo(b:Record<string,unknown>){
 const blog=await q1<{platform:string;url:string}>('SELECT platform,url FROM blogs WHERE id=$1 AND archived=FALSE',[b.blogId]);
 if(!blog||blog.platform!=='naver')throw Error('네이버 블로그를 선택해 주세요.');
 let account:string|undefined;
 try { const u=new URL(blog.url);if(['blog.naver.com','m.blog.naver.com'].includes(u.hostname)){const id=u.searchParams.get('blogId')||u.pathname.split('/').filter(Boolean)[0];if(id&&/^[A-Za-z0-9_-]{1,64}$/.test(id))account=id;} }catch{}
 const kind=String(b.kind),p=(b.payload??{}) as Record<string,unknown>;
 if(!['search','apply','collect'].includes(kind))throw Error('지원하지 않는 작업입니다.');
 let payload:Record<string,unknown>;
 if(kind==='search'){
  const keywords=String(p.keywords??'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
  if(!keywords.length||keywords.length>10||keywords.some(x=>x.length>100))throw Error('검색어는 1~10개, 각 100자 이내로 입력해 주세요.');
  payload={keywords,pages:Math.max(1,Math.min(5,Number(p.pages)||1))};
 }else if(kind==='apply'){
  if(b.confirmed!==true)throw Error('신청할 대상을 확인해 주세요.');
  const ids=Array.isArray(p.ids)?[...new Set(p.ids.map(String))]:[];
  if(!ids.length||ids.length>20||ids.some(x=>! /^[A-Za-z0-9_-]{1,64}$/.test(x)))throw Error('신청 대상은 1~20명까지 선택해 주세요.');
  const source=await q1<SeoJob>("SELECT * FROM seoichoo_jobs WHERE id=$1 AND blog_id=$2 AND kind='search' AND status='done'",[p.source,b.blogId]);
  const candidates=(source?.result.candidates??[]) as {blog_id:string;nick:string}[];
  if(ids.some(id=>!candidates.some(c=>c.blog_id===id)))throw Error('이 블로그에서 검색한 후보를 선택해 주세요.');
  const message=String(p.message??'').trim();if(!message||message.length>2000)throw Error('신청 문구를 2000자 이내로 입력해 주세요.');
  payload={candidates:candidates.filter(c=>ids.includes(c.blog_id)),message,min:30,max:120,limit:100};
 }else{
  const url=new URL(String(p.url??''));
  if(url.protocol!=='https:'||!['blog.naver.com','m.blog.naver.com','creator-advisor.naver.com'].includes(url.hostname)||url.username||url.password)throw Error('네이버 블로그 또는 크리에이터 어드바이저의 https 주소를 입력해 주세요.');
  payload={url:url.href};
 }
 // 연결이 끊겼다고 신청 작업을 자동 재실행하지 않음. 실행 중에는 다음 작업 예약을 막음.
 payload.account=account;
 const id=newId('seo_');
 const rows=await q<{id:string}>(`INSERT INTO seoichoo_jobs(id,blog_id,kind,payload) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM seoichoo_jobs WHERE status IN ('queued','running')) RETURNING id`,[id,b.blogId,kind,j(payload)]);
 if(!rows.length)throw Error('대기·실행 중인 작업을 먼저 완료하거나 중지해 주세요.');
 return {id};
}
