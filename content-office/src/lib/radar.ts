import "server-only";
import {assertRemoteReadAllowed,remoteReadLimits,remoteReadHost,RemoteReadLimited} from "./remote-read-limit";
import { q,q1,j,newId } from './db';
import { sourceAddress,collectRadarSource } from './radar-sources';
import { addLearning,analyzeLearning,getLearning,learningEstimate } from './learning';
import { getSettings } from './settings';
import { countGoogleInput } from './ai/providers';
export type RadarSource={id:string;platform:string;url:string;name:string;enabled:boolean;weekday:number;time:string;next_run_at:string;last_checked:string|null;last_error:string;retry_after?:string|null};
export type RadarItem={id:string;source_id:string;url:string;title:string;source_text:string;published_at:string|null;coverage:string;state:string;message:string;learn_id:string|null;source_name?:string};
export function radarWeek(now=new Date()){
  const kst=new Date(now.getTime()+9*3600000);kst.setUTCDate(kst.getUTCDate()-((kst.getUTCDay()+6)%7));return kst.toISOString().slice(0,10);
}
export function nextRadarRun(day:number,time:string,now=new Date()){
  const kst=new Date(now.getTime()+9*3600000),[h,m]=time.split(':').map(Number);
  const target=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate(),h-9,m));
  target.setUTCDate(target.getUTCDate()+((day-kst.getUTCDay()+7)%7));if(target.getTime()<=now.getTime())target.setUTCDate(target.getUTCDate()+7);return target;
}
async function budget(){
  const week=radarWeek();await q('INSERT INTO radar_weeks(week,limit_usd) SELECT $1,weekly_limit FROM radar_settings WHERE id=1 ON CONFLICT DO NOTHING',[week]);
  return (await q1<{week:string;limit_usd:number;spent:number;reserved:number}>('SELECT * FROM radar_weeks WHERE week=$1',[week]))!;
}
export async function radarState(){
  const limits=await remoteReadLimits(),sources=await q<RadarSource>('SELECT * FROM radar_sources ORDER BY created_at DESC');
  return {sources:sources.map(s=>({...s,retry_after:limits.find(l=>l.host===remoteReadHost(s.url))?.retry_at??null})),items:await q<RadarItem>('SELECT i.*,s.name AS source_name FROM radar_items i JOIN radar_sources s ON s.id=i.source_id ORDER BY i.created_at DESC LIMIT 150'),settings:await q1<{auto_learning:boolean;weekly_limit:number}>('SELECT * FROM radar_settings WHERE id=1'),budget:await budget(),estimate:await learningEstimate()};
}
export async function saveRadarSettings(input:{auto_learning?:unknown;weekly_limit?:unknown;confirm?:unknown}){
  const cur=(await q1<{auto_learning:boolean;weekly_limit:number}>('SELECT * FROM radar_settings WHERE id=1'))!;
  const limit=input.weekly_limit===undefined?Number(cur.weekly_limit):Number(input.weekly_limit),enabled=input.auto_learning===undefined?cur.auto_learning:input.auto_learning===true;
  if(!Number.isFinite(limit)||limit<0.01||limit>100)throw new Error('주간 한도는 $0.01 (₩15)~$100 (₩150,000) 사이로 입력해 주세요.');
  if((enabled&&!cur.auto_learning||limit!==Number(cur.weekly_limit))&&input.confirm!==true)throw new Error('자동 학습과 주간 비용 한도를 먼저 확인해 주세요.');
  const b=await budget();
  const updated=await q(`WITH changed AS (UPDATE radar_weeks SET limit_usd=$2 WHERE week=$1 AND spent+reserved<=$2 RETURNING week)
    UPDATE radar_settings SET weekly_limit=$2,auto_learning=$3 WHERE id=1 AND EXISTS(SELECT 1 FROM changed) RETURNING id`,[b.week,limit,enabled]);
  if(!updated.length)throw new Error('이미 사용·예약한 비용보다 한도를 낮출 수 없어요. 자동 학습을 끄고 다음 주 한도를 설정해 주세요.');
  return radarState();
}
export async function saveRadarSource(input:Record<string,unknown>){
  const old=input.id?await q1<RadarSource>('SELECT * FROM radar_sources WHERE id=$1',[String(input.id)]):null;
  if(input.id&&!old)throw new Error('계정을 찾을 수 없어요.');
  const platform=String(input.platform??old?.platform??'instagram'),url=sourceAddress(String(input.url??old?.url??''),platform),name=String(input.name??old?.name??url).trim().slice(0,100)||url;
  const weekday=Number(input.weekday??old?.weekday??1),time=String(input.time??old?.time??'09:00');
  if(!Number.isInteger(weekday)||weekday<0||weekday>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('매주 확인할 요일·한국 시간을 확인해 주세요.');
  if(old&&(url!==old.url||platform!==old.platform))throw new Error("계정 주소를 바꾸려면 새 계정으로 등록해 주세요. 기존 수집 기록을 보존해요.");
  const id=old?.id??newId('rad_'),enabled=input.enabled===undefined?old?.enabled??true:input.enabled===true;
  await q(`INSERT INTO radar_sources(id,platform,url,name,enabled,weekday,time,next_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(id) DO UPDATE SET name=$4,enabled=$5,weekday=$6,time=$7,next_run_at=$8`,[id,platform,url,name,enabled,weekday,time,nextRadarRun(weekday,time).toISOString()]);
  return radarState();
}
export async function queueRadarSource(id:string){
  const source=await q1<RadarSource>('SELECT * FROM radar_sources WHERE id=$1',[id]);
  if(!source)throw new Error('계정을 찾을 수 없어요.');
  await assertRemoteReadAllowed(source.url);
  const rows=await q('UPDATE radar_sources SET queued_until=NOW()+INTERVAL \'10 minutes\' WHERE id=$1 AND enabled=TRUE AND (queued_until IS NULL OR queued_until<NOW()) RETURNING id',[id]);
  if(!rows.length)throw new Error('계정이 꺼져 있거나 이미 확인 중이에요.');
  try{const {enqueue}=await import('./jobs');await enqueue('radar_collect',{payload:{sourceId:id},maxAttempts:1});}catch(e){await q('UPDATE radar_sources SET queued_until=NULL WHERE id=$1',[id]);throw e;}
}
export async function radarTick(){
  await q("UPDATE radar_items SET state='error',message='서버 중단으로 결과를 확인하지 못했어요. 예약 비용을 유지하고 자동 재학습하지 않아요.' WHERE state='processing' AND processing_at<NOW()-INTERVAL '10 minutes'");
  const due=await q<{id:string}>('SELECT id FROM radar_sources WHERE enabled=TRUE AND next_run_at<=NOW() AND (queued_until IS NULL OR queued_until<NOW()) ORDER BY next_run_at LIMIT 100');
  for(const s of due)try{await queueRadarSource(s.id);}catch{}
  const config=await q1<{auto_learning:boolean}>('SELECT auto_learning FROM radar_settings WHERE id=1');if(!config?.auto_learning)return;
  const b=await budget();if(Number(b.spent)+Number(b.reserved)>=Number(b.limit_usd))return;
  const backlog=await q<{id:string}>("SELECT i.id FROM radar_items i JOIN radar_sources s ON s.id=i.source_id WHERE s.enabled=TRUE AND i.state IN ('new','budget') ORDER BY i.created_at LIMIT 3");
  for(const row of backlog)await queueRadarItem(row.id);
}
async function queueRadarItem(id:string){
  const rows=await q("UPDATE radar_items SET state='queued',message='학습 대기 중' WHERE id=$1 AND state IN ('new','budget') RETURNING id",[id]);if(!rows.length)return;
  try{const {enqueue}=await import('./jobs');await enqueue('radar_learn',{payload:{itemId:id},maxAttempts:1});}catch(e){await q("UPDATE radar_items SET state='error',message=$2 WHERE id=$1",[id,(e as Error).message]);}
}
export async function runRadarSource(id:string){
  const s=await q1<RadarSource>('SELECT * FROM radar_sources WHERE id=$1',[id]);if(!s||!s.enabled)return;
  let error='',retryAt:string|null=null;
  try{
    const posts=await collectRadarSource(s.platform,s.url);
    for(const post of posts){
      const recent=post.date&&Date.parse(post.date)>Date.now()-7*86400000&&Date.parse(post.date)<Date.now()+86400000;
      const state=!post.date?'needs_material':recent?'new':'old';
      const note=!post.date?'게시 날짜를 확인하지 못했어요. 본문을 보충하고 직접 학습을 예약해 주세요.':recent?'새 게시물 수집':'최근 7일 이전 글 · 자동 학습 제외';
      await q('INSERT INTO radar_items(id,source_id,url,title,source_text,published_at,coverage,state,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[newId('raditem_'),id,post.url,post.title,post.text,post.date,post.coverage,state,note]);
    }
  }catch(e){error=(e as Error).message.slice(0,1000);if(e instanceof RemoteReadLimited)retryAt=e.retryAt;}
  await q('UPDATE radar_sources SET queued_until=NULL,last_checked=NOW(),last_error=$2,next_run_at=$3 WHERE id=$1',[id,error,new Date(Math.max(nextRadarRun(s.weekday,s.time).getTime(),retryAt?Date.parse(retryAt):0)).toISOString()]);
  if(!error)await radarTick();
}
export async function runRadarItem(id:string){
  const item=await q1<RadarItem & {platform:string;enabled:boolean}>('SELECT i.*,s.platform,s.enabled FROM radar_items i JOIN radar_sources s ON s.id=i.source_id WHERE i.id=$1',[id]);if(!item)return;
  const config=await q1<{auto_learning:boolean}>('SELECT auto_learning FROM radar_settings WHERE id=1');
  if(!config?.auto_learning||!item.enabled){await q("UPDATE radar_items SET state='new',message='자동 학습 또는 계정이 꺼져 있어 보류' WHERE id=$1 AND state='queued'",[id]);return;}
  const claimed=await q("UPDATE radar_items SET state='processing',processing_at=NOW(),message='읽은 범위·예산 확인 중' WHERE id=$1 AND state='queued' RETURNING id",[id]);if(!claimed.length)return;
  const prior=await q1<{id:string}>("SELECT id FROM ai_learning_refs WHERE source_url=$1 AND analysis IS NOT NULL AND jsonb_array_length(COALESCE(analysis->'knowledge','[]'::jsonb))>0 AND coverage->>'complete'='true' ORDER BY analyzed_at DESC LIMIT 1",[item.url]);
  if(prior){await q("UPDATE radar_items SET state='learned',learn_id=$2,message='이미 내용 학습한 기록을 재사용했어요. 추가 AI 호출 없음' WHERE id=$1",[id,prior.id]);return;}
  let reservation:{week:string;amount:number;id:string}|null=null;
  const rate={input:0,output:0};
  let stage:"material"|"ai"="material";
  try{
    let learn=item.learn_id?await getLearning(item.learn_id):null;
    if(!learn){
      if(item.platform==='instagram'){
        const created=await addLearning({category:'other',url:item.url,title:item.title});learn=await getLearning(created.id);
      }else{
        if(item.source_text.length<100)throw new Error('공개된 본문이 너무 짧아요. 마크다운이나 본문을 보충해 주세요.');
        const created=await addLearning({category:'other',url:item.url,text:item.source_text,title:item.title});learn=await getLearning(created.id);
        await q('UPDATE ai_learning_refs SET coverage=$2 WHERE id=$1',[created.id,j({caption:true,imageCount:0,expectedImages:null,complete:true,method:item.coverage,note:item.coverage})]);
        learn=await getLearning(created.id);
      }
      await q('UPDATE radar_items SET learn_id=$2 WHERE id=$1',[id,learn!.id]);
    }
    await q('UPDATE radar_items SET source_text=$2,coverage=$3 WHERE id=$1',[id,learn!.source_text,learn!.coverage?.method??item.coverage]);
    if(!learn!.coverage?.complete){await q("UPDATE radar_items SET state='needs_material',message='본문이나 전체 장을 읽지 못했어요. 자료를 보충해 주세요.' WHERE id=$1",[id]);return;}
    stage='ai';
    const attempt=newId('radcost_');
    await analyzeLearning(learn!.id,{purpose:`radar-learning:${attempt}`,strictTokens:true,beforeCall:async(request,assignment)=>{
      const {pricing}=await getSettings(),price=pricing[`${assignment.provider}:${assignment.model}`];
      if(assignment.provider!=='google'||!price||price.input<=0||price.output<=0)throw new Error('자동 학습은 토큰 수를 사전 확인할 수 있는 Gemini 텍스트 모델만 사용해요. 설정의 릴스 분석 담당 AI를 확인해 주세요.');
      Object.assign(rate,price);
      const count=await countGoogleInput(request),amount=(Math.ceil(count*1.05+200)*price.input+(request.maxTokens??6000)*price.output)/1000000;
      const b=await budget();
      const rows=await q(`WITH charged AS (UPDATE radar_weeks SET reserved=reserved+$2 WHERE week=$1 AND spent+reserved+$2<=limit_usd AND (SELECT auto_learning FROM radar_settings WHERE id=1) RETURNING week)
        INSERT INTO radar_attempts(id,item_id,week,reserved) SELECT $3,$4,week,$2 FROM charged RETURNING id`,[b.week,amount,attempt,id]);
      if(!rows.length)throw new Error('WEEKLY_BUDGET: 주간 한도가 부족해 생성 호출 없이 보류했어요.');
      reservation={week:b.week,amount,id:attempt};
    }});
    // 응답·사용량을 확인한 성공만 예약금을 실제 앱 계산 비용으로 정산. 불확실한 실패는 예약금 유지.
    if(reservation){const charged=reservation as {week:string;amount:number;id:string};const used=await q1<{input_tokens:number;output_tokens:number}>('SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens FROM ai_runs WHERE purpose=$1',[`radar-learning:${attempt}`]);
      const actual=(Number(used?.input_tokens??0)*rate.input+Number(used?.output_tokens??0)*rate.output)/1000000;await q(`WITH settled AS (UPDATE radar_attempts SET actual=$2 WHERE id=$1 AND actual IS NULL RETURNING week,reserved)
        UPDATE radar_weeks SET reserved=GREATEST(0,radar_weeks.reserved-settled.reserved),spent=spent+$2 FROM settled WHERE radar_weeks.week=settled.week`,[charged.id,actual]);}
    await q("UPDATE radar_items SET state='learned',message='본문 내용 학습 완료 · AI 학습지와 과제물에 반영' WHERE id=$1",[id]);
  }catch(e){const message=(e as Error).message,state=message.startsWith('WEEKLY_BUDGET')?'budget':reservation||stage==='ai'?'error':'needs_material';await q('UPDATE radar_items SET state=$2,message=$3 WHERE id=$1',[id,state,message.replace(/^WEEKLY_BUDGET:\s*/,'').slice(0,1000)+(reservation?' 응답 실패 시 예약 비용을 유지하며 자동 재호출하지 않아요.':'')]);}
}
export async function supplementRadarItem(id:string,text:string){
  const item=await q1<RadarItem>('SELECT * FROM radar_items WHERE id=$1',[id]);if(!item)throw new Error('게시물을 찾을 수 없어요.');
  if(item.state==='processing'||item.state==='queued')throw new Error('이미 처리 중이에요.');
  if(text.trim().length<100)throw new Error('본문·마크다운을 100자 이상 넣어 주세요.');
  const material=await addLearning({category:'other',url:item.url,text:text.slice(0,16000),title:item.title});
  await q("UPDATE radar_items SET learn_id=$2,source_text=$3,state='new',message='보충한 본문으로 학습 예약' WHERE id=$1",[id,material.id,text.slice(0,16000)]);
  await queueRadarItem(id);return radarState();
}

export async function addRadarPost(sourceId:string,url:string,text:string){
  const source=await q1<RadarSource>('SELECT * FROM radar_sources WHERE id=$1',[sourceId]);if(!source)throw new Error('등록 계정을 골라 주세요.');
  const {referenceUrl}=await import('./instagram-design');
  const canonical=source.platform==='instagram'?referenceUrl(url):sourceAddress(url,'rss');
  const id=newId('raditem_');
  const rows=await q("INSERT INTO radar_items(id,source_id,url,title,source_text,coverage,state,message) VALUES($1,$2,$3,$4,$5,'직접 추가한 게시물','new','직접 추가한 게시물 학습 예약') ON CONFLICT DO NOTHING RETURNING id",[id,sourceId,canonical,text.trim().split('\n')[0].slice(0,120)||'직접 추가한 게시물',text.slice(0,16000)]);
  if(!rows.length)throw new Error('이미 등록한 게시물이에요. 기존 항목에서 본문을 보충해 주세요.');
  if(text.trim().length>=100)return supplementRadarItem(id,text);
  await queueRadarItem(id);return radarState();
}

export async function retryRadarItem(id:string){
  const rows=await q("UPDATE radar_items SET state='new',message='사용자가 재시도 요청' WHERE id=$1 AND state IN ('error','budget') AND learn_id IN (SELECT id FROM ai_learning_refs WHERE coverage->>'complete'='true') RETURNING id",[id]);
  if(!rows.length)throw new Error('먼저 본문을 보충하거나 진행 중인 학습을 기다려 주세요.');
  await queueRadarItem(id);return radarState();
}
