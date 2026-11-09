import {body,handle,ok,fail} from '@/lib/api';
import {q} from '@/lib/db';
import {seoJobs,queueSeo} from '@/lib/seoichoo';
export async function GET(req:Request){return handle(async()=>ok(await seoJobs(new URL(req.url).searchParams.get('blogId')??undefined)));}
export async function POST(req:Request){return handle(async()=>{
 const b=await body<Record<string,unknown>>(req);
 if(b.action==='cancel'){
  await q("UPDATE seoichoo_jobs SET cancelled=TRUE,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=NOW() WHERE id=$1 AND status IN ('queued','running')",[b.id]);return ok({ok:true});
 }
 if(b.action==='resolve'){
  if(b.confirmed!==true)return fail('확장 프로그램 실행을 중지하고 실제 신청 여부를 확인한 뒤 눌러 주세요.');
  await q("UPDATE seoichoo_jobs SET cancelled=TRUE,status='unconfirmed',updated_at=NOW() WHERE id=$1 AND status='running' AND updated_at < NOW()-INTERVAL '2 minutes'",[b.id]);return ok({ok:true});
 }
 try{return ok(await queueSeo(b),201);}catch(e){return fail((e as Error).message);}
});}
