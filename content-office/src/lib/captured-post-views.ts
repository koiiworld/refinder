import 'server-only';
import {q} from './db';
/** 블로그 진단과 캐러셀이 공유: 저장된 최근 7개 일간 기록의 제목별 합계. */
export async function capturedPostViews(blogId:string){
 const rows=await q<{day:string;items:{title:string;views:number}[]}>("SELECT to_char(day,'YYYY-MM-DD') AS day, items FROM view_captures WHERE blog_id=$1 AND kind='day' ORDER BY day DESC LIMIT 7",[blogId]);
 const sums=new Map<string,number>();
 for(const row of rows)for(const it of row.items??[]){const count=Number(it.views);if(it.title&&Number.isFinite(count)&&count>=0)sums.set(it.title,(sums.get(it.title)??0)+count);}
 return {items:[...sums].map(([title,views])=>({title,views})).sort((a,b)=>b.views-a.views),label:rows.length?`${rows.at(-1)!.day} ~ ${rows[0].day} · 일간 기록 ${rows.length}개 합계`:'저장된 일간 조회수 기록 없음'};
}
export function matchCapturedViews(title:string,titles:string[],items:{title:string;views:number}[]):number|null{
 const key=(s:string)=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLocaleLowerCase('ko-KR');
 const target=key(title);if(titles.filter(t=>key(t)===target).length!==1)return null;
 let total=0,matched=false;
 for(const item of items){const k=key(item.title);const truncated=/(…|\.{3})\s*$/.test(item.title);
  if(k===target||(truncated&&k.length>=12&&target.startsWith(k)&&titles.filter(t=>key(t).startsWith(k)).length===1)){total+=item.views;matched=true;}
 }
 return matched?total:null;
}
