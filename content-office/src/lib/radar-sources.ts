import "server-only";
import {assertRemoteReadAllowed,stopOnRemote429} from "./remote-read-limit";
import net from "node:net";
import { checkImageUrl } from "./official-images";
export type RadarPost={title:string;url:string;date:string|null;text:string;coverage:string};
export function sourceAddress(raw:string,platform:string){
  const input=raw.trim();let u:URL;try{u=new URL(platform==='instagram'&&!input.includes('://')?`https://www.instagram.com/${input.replace(/^@/,'')}/`:input);}catch{throw new Error('계정 또는 RSS 주소를 확인해 주세요.');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||net.isIP(u.hostname.replace(/[\[\]]/g,''))||/^(localhost|.*\.local|.*\.internal)$/.test(u.hostname))throw new Error('공개 https 주소만 등록할 수 있어요.');
  u.hash='';
  if(platform==='instagram'){
    if(!['www.instagram.com','instagram.com'].includes(u.hostname)||!/^\/[\w.]+\/?$/.test(u.pathname)||['p','reel','explore','accounts'].includes(u.pathname.split('/')[1]))throw new Error('게시물 주소 대신 인스타 계정 주소나 @계정을 넣어 주세요.');
    return `https://www.instagram.com/${u.pathname.split('/')[1]}/`;
  }
  if(platform==='youtube'){
    if(!['www.youtube.com','youtube.com'].includes(u.hostname)||!/^\/(?:@[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)\/?$/.test(u.pathname))throw new Error('유튜브 채널 주소(@계정 또는 /channel/…)를 넣어 주세요.');
    return 'https://www.youtube.com'+u.pathname.replace(/\/$/,'');
  }
  if(platform!=='rss')throw new Error('지원하지 않는 계정 종류예요.');
  return u.href;
}
const decode=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const plain=(s:string)=>decode(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
export async function radarFetch(raw:string){
  let u=new URL(raw);
  for(let i=0;i<4;i++){
    sourceAddress(u.href,'rss');
    await assertRemoteReadAllowed(u.href);
    const test=process.env.VIDEO_ALLOW_LOCAL==='1'?process.env.RADAR_TEST_ORIGIN:undefined;
    if(!test)await checkImageUrl(u.href);
    const target=test?new URL(u.pathname+u.search,test):u;
    const res=await fetch(target,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (compatible; ContentOffice/1.0)'},signal:AbortSignal.timeout(20000)});
    await stopOnRemote429(u.href,res);
    if(res.status>=300&&res.status<400&&res.headers.get('location')){await res.body?.cancel();u=new URL(res.headers.get('location')!,u);continue;}
    if(!res.ok){await res.body?.cancel();throw new Error(`공개 피드를 읽지 못했어요 (HTTP ${res.status}). 로그인 제한이면 게시물 본문을 직접 보충해 주세요.`);}
    const reader=res.body?.getReader();if(!reader)throw new Error('빈 응답이에요.');let n=0;const chunks:Uint8Array[]=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>2*1024*1024)throw new Error('피드가 너무 커요 (2MB 초과).');chunks.push(value);}}finally{await reader.cancel();}
    return {text:Buffer.concat(chunks).toString('utf8'),url:u.href};
  }
  throw new Error('피드의 주소 이동이 너무 많아요.');
}
function rssPosts(xml:string):RadarPost[]{
  const out:RadarPost[]=[];
  for(const match of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
    const entry=match[2],tag=(name:string)=>new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i').exec(entry)?.[1]??'';
    const title=plain(tag('title')),link=decode(tag('link')).trim()||/<link\b[^>]*href=["']([^"']+)/i.exec(entry)?.[1]||'';
    let url:string;try{url=sourceAddress(link,'rss');}catch{continue;}
    const date=plain(tag('pubDate')||tag('published')||tag('updated'));const t=date?new Date(date):null;
    const body=plain(tag('content:encoded')||tag('content')||tag('description')||tag('summary'));
    if(title)out.push({title,url,date:t&&!isNaN(t.getTime())?t.toISOString():null,text:(title+'\n'+body).slice(0,16000),coverage:'RSS에 공개된 본문·요약 (원문 전체와 다를 수 있음)'});
    if(out.length>=5)break;
  }
  return out;
}
export async function collectRadarSource(platform:string,url:string):Promise<RadarPost[]>{
  if(platform==='youtube')return (await import('./youtube')).channelPosts(url);
  if(platform==='instagram'){
    const html=(await radarFetch(url)).text,handle=new URL(url).pathname.split('/')[1].toLowerCase(),found=new Map<string,RadarPost>();
    const walk=(v:unknown,depth=0):void=>{
      if(!v||depth>30)return;if(typeof v==='string'&&/^[{[]/.test(v)){try{walk(JSON.parse(v),depth+1);}catch{}return;}if(typeof v!=='object')return;
      const o=v as Record<string,unknown>,code=o.shortcode??o.code,owner=o.owner as {username?:string}|undefined,user=o.user as {username?:string}|undefined;
      if(typeof code==='string'&&(owner?.username??user?.username??'').toLowerCase()===handle){
        const edges=(o.edge_media_to_caption as {edges?:{node?:{text?:string}}[]}|undefined)?.edges;
        const caption=edges?.[0]?.node?.text??(typeof o.caption==='string'?o.caption:(o.caption as {text?:string}|undefined)?.text)??'';
        const stamp=Number(o.taken_at_timestamp??o.taken_at);const date=stamp>0?new Date(stamp*1000).toISOString():null;
        found.set(code,{title:caption.split('\n')[0].slice(0,120)||'인스타 새 게시물',url:`https://www.instagram.com/p/${code}/`,date,text:caption,coverage:'계정 공개 게시물 목록 · 학습 전에 개별 게시물의 본문·장수 확인'});return;
      }
      Object.values(o).forEach(x=>walk(x,depth+1));
    };
    for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1].trim().replace(/^window\._sharedData\s*=\s*/, '').replace(/;$/,'')));}catch{}}
    if(!found.size)throw new Error('이 계정의 게시물 목록을 공개 페이지에서 확인하지 못했어요. 계정 로그인 정보는 요구하지 않습니다. 게시물 링크나 본문을 직접 보충해 주세요.');
    return [...found.values()].sort((a,b)=>(b.date??'').localeCompare(a.date??'')).slice(0,5);
  }
  let feed=url;
  const u=new URL(url);
  if(['blog.naver.com','m.blog.naver.com'].includes(u.hostname))feed=`https://rss.blog.naver.com/${u.pathname.split('/')[1]}.xml`;
  else if(u.hostname.endsWith('.tistory.com')&&u.pathname==='/')feed=u.origin+'/rss';
  let result=await radarFetch(feed);
  if(!/<(?:rss|feed)\b/i.test(result.text)){
    const link=[...result.text.matchAll(/<link\b[^>]*>/gi)].find(m=>/application\/(?:rss|atom)\+xml/.test(m[0]));
    const href=link&&/href=["']([^"']+)/i.exec(link[0])?.[1];if(!href)throw new Error('RSS 주소를 찾지 못했어요. 블로그의 RSS/Atom 주소를 직접 등록해 주세요.');
    result=await radarFetch(new URL(decode(href),result.url).href);
  }
  if(!/<(?:rss|feed)\b/i.test(result.text))throw new Error('정상적인 RSS/Atom 문서가 아니에요.');
  return rssPosts(result.text);
}
