import {RemoteReadLimited} from "@/lib/remote-read-limit";
import {body,fail,handle,ok} from '@/lib/api';
import {radarState,saveRadarSettings,saveRadarSource,queueRadarSource,supplementRadarItem,addRadarPost,retryRadarItem} from '@/lib/radar';
export async function GET(){return handle(async()=>ok(await radarState()));}
export async function POST(req:Request){return handle(async()=>{const b=await body(req);try{
  if(b.action==='settings')return ok(await saveRadarSettings(b));
  if(b.action==='source')return ok(await saveRadarSource(b));
  if(b.action==='check'){await queueRadarSource(String(b.id));return ok(await radarState());}
  if(b.action==='supplement')return ok(await supplementRadarItem(String(b.id),String(b.text??'')));
  if(b.action==='retry'){if(b.confirm!==true)return fail('예산 내 재시도를 먼저 확인해 주세요.');return ok(await retryRadarItem(String(b.id)));}
  if(b.action==='post')return ok(await addRadarPost(String(b.source_id),String(b.url??''),String(b.text??'')));
  return fail('알 수 없는 요청이에요.');
}catch(e){return e instanceof RemoteReadLimited?fail(e.message,429,{retryAt:e.retryAt}):fail((e as Error).message);}});}
