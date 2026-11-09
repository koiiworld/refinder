import {body,handle,ok,fail} from '@/lib/api';
import {q,q1,j} from '@/lib/db';
import type {SeoJob} from '@/lib/seoichoo';
// /api/ext/는 proxy.ts에서 기존 앱 연결 코드로 인증. 비밀번호/네이버 쿠키 전송 없음.
export async function POST(req:Request){return handle(async()=>{
 const b=await body<Record<string,unknown>>(req);
 if(b.action==='claim'){
  const job=await q1<SeoJob>(`UPDATE seoichoo_jobs SET status='running',updated_at=NOW() WHERE id=(SELECT id FROM seoichoo_jobs WHERE status='queued' AND cancelled=FALSE ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`);
  return ok({job});
 }
 const job=await q1<SeoJob>('SELECT * FROM seoichoo_jobs WHERE id=$1',[b.id]);if(!job)return fail('작업을 찾지 못했습니다.',404);
 if(b.action==='heartbeat'){
  if(b.result&&JSON.stringify(b.result).length<200000)await q("UPDATE seoichoo_jobs SET result=$2,updated_at=NOW() WHERE id=$1 AND status='running'",[job.id,j(b.result)]);
  else await q("UPDATE seoichoo_jobs SET updated_at=NOW() WHERE id=$1 AND status='running'",[job.id]);return ok({cancelled:job.cancelled||job.status!=='running'});
 }
 if(b.action==='result'){
  if(!['done','error','cancelled','unconfirmed'].includes(String(b.status)))return fail('결과 상태가 올바르지 않습니다.');
  const text=JSON.stringify(b.result??{});if(text.length>200000)return fail('자료가 너무 큽니다.');
  await q("UPDATE seoichoo_jobs SET status=$2,result=$3,updated_at=NOW() WHERE id=$1 AND status='running'",[job.id,b.status,j(b.result)]);return ok({ok:true});
 }
 return fail('지원하지 않는 요청입니다.');
});}
