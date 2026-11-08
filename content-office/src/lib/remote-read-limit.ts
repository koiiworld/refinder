import "server-only";
import { q,q1 } from './db';

/** 웹사이트가 보낸 429를 존중. 같은 서버·계정들의 반복 읽기도 함께 잠시 멈춤. */
export function remoteReadHost(raw:string){
  const host=new URL(raw).hostname.toLowerCase().replace(/^www\./,'');
  return host==='instagram.com'||host.endsWith('.cdninstagram.com')||host.endsWith('.fbcdn.net')?'instagram.com':host;
}
export class RemoteReadLimited extends Error {
  constructor(public host:string,public retryAt:string){
    const when=new Date(retryAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    super(`${host==='instagram.com'?'인스타그램':host}에서 자동 읽기 요청을 제한했어요 (HTTP 429). ${when} (한국 시간)까지 이 서버의 반복 요청을 멈춰요. 이후에도 읽기가 보장되지는 않아요. 기다리는 동안 게시물 본문·마크다운을 직접 넣을 수 있어요. 이 읽기 실패로 AI 학습 비용은 발생하지 않아요.`);
  }
}
export async function assertRemoteReadAllowed(url:string){
  const host=remoteReadHost(url),row=await q1<{retry_at:string}>('SELECT retry_at FROM remote_read_limits WHERE host=$1 AND retry_at>NOW()',[host]);
  if(row)throw new RemoteReadLimited(host,row.retry_at);
}
export async function stopOnRemote429(url:string,response:Response){
  if(response.status!==429)return;
  const now=Date.now(),header=response.headers.get('retry-after');
  const parsed=header ? /^\d+$/.test(header.trim()) ? now+Number(header)*1000 : Date.parse(header) : NaN;
  const millis=Number.isFinite(parsed)&&Math.abs(parsed)<8640000000000000?Math.max(now+60000,parsed):now+3600000;
  const host=remoteReadHost(url),retryAt=new Date(millis).toISOString();
  await response.body?.cancel();
  const saved=await q1<{retry_at:string}>(`INSERT INTO remote_read_limits(host,retry_at) VALUES($1,$2)
    ON CONFLICT(host) DO UPDATE SET retry_at=GREATEST(remote_read_limits.retry_at,EXCLUDED.retry_at) RETURNING retry_at`,[host,retryAt]);
  throw new RemoteReadLimited(host,saved?.retry_at??retryAt);
}
export async function remoteReadLimits(){return q<{host:string;retry_at:string}>('SELECT host,retry_at FROM remote_read_limits WHERE retry_at>NOW()');}
