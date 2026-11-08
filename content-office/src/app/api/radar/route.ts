import {RemoteReadLimited} from '@/lib/remote-read-limit';
import {body,fail,handle,ok} from '@/lib/api';
import {radarState,saveRadarSource} from '@/lib/radar';
import {addLearning} from '@/lib/learning';
export async function GET(){return handle(async()=>ok(await radarState()));}
export async function POST(req:Request){return handle(async()=>{const b=await body(req);try{
  if(b.action==='source')return ok(await saveRadarSource(b));
  if(b.action==='post')return ok(await addLearning({category:'other',url:String(b.url??''),text:String(b.text??''),title:String(b.title??'')}),201);
  return fail('자동 수집·자동 학습은 종료했어요. 계정 바로가기와 게시물 직접 추가를 이용해 주세요.');
}catch(e){return e instanceof RemoteReadLimited?fail(e.message,429,{retryAt:e.retryAt}):fail((e as Error).message);}});}
