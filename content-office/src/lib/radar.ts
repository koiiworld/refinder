import 'server-only';
import {q,q1,newId} from './db';
import {sourceAddress} from './radar-sources';

// 관심 계정 바로가기. 외부 사이트 수집·AI 호출 없이 기존 계정도 그대로 표시.
export type RadarSource={id:string;platform:string;url:string;name:string};
export async function radarState(){return {sources:await q<RadarSource>('SELECT id,platform,url,name FROM radar_sources ORDER BY created_at DESC')};}
export async function saveRadarSource(input:Record<string,unknown>){
  const old=input.id?await q1<RadarSource>('SELECT id,platform,url,name FROM radar_sources WHERE id=$1',[String(input.id)]):null;
  if(input.id&&!old)throw new Error('계정을 찾을 수 없어요.');
  const platform=String(input.platform??old?.platform??'instagram');
  const url=sourceAddress(String(input.url??old?.url??''),platform);
  const name=String(input.name??old?.name??'').trim().slice(0,100)||url;
  const duplicate=await q1<{id:string}>('SELECT id FROM radar_sources WHERE url=$1',[url]);
  if(duplicate&&duplicate.id!==old?.id)throw new Error('이미 저장한 계정이에요.');
  if(old)await q('UPDATE radar_sources SET name=$2,url=$3,platform=$4,enabled=FALSE WHERE id=$1',[old.id,name,url,platform]);
  else await q('INSERT INTO radar_sources(id,platform,url,name,enabled,next_run_at) VALUES($1,$2,$3,$4,FALSE,NOW())',[newId('rad_'),platform,url,name]);
  return radarState();
}
