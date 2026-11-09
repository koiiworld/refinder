'use client';
import {useEffect,useRef,useState} from 'react';
type Post={title:string;url:string;blog:string};
export default function BlogPostPicker({id,recent,value,onChange}:{id:string;recent:Post[];value:string;onChange:(url:string)=>void}){
 const [query,setQuery]=useState(''),[remote,setRemote]=useState<Post[]>([]),[searched,setSearched]=useState(''),[next,setNext]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 const words=query.normalize('NFKC').toLocaleLowerCase('ko-KR').trim().split(/\s+/).filter(Boolean);
 const local=recent.filter(p=>words.every(w=>`${p.blog} ${p.title}`.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(w)));
 const found=[...new Map([...local,...(searched===query.trim()?remote:[])].map(p=>[p.url,p])).values()];
 async function search(start=1){
  active.current?.abort();const controller=new AbortController();active.current=controller;const term=query.trim();setBusy(true);setError('');
  try{const res=await fetch(`/api/carousels/${id}/sources?query=${encodeURIComponent(term)}&start=${start}`,{signal:controller.signal});const data=await res.json();if(!res.ok)throw Error(data.error??'검색하지 못했어요.');if(controller.signal.aborted)return;
   setRemote(old=>start===1?data.items:[...old,...data.items]);setSearched(term);setNext(data.nextStart);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(active.current===controller)setBusy(false);}
 }
 const choose=(p:Post)=><button type="button" key={p.url} className="btn btn-sm" style={{whiteSpace:'normal',textAlign:'left',justifyContent:'flex-start',overflowWrap:'anywhere',width:'100%'}} aria-pressed={value===p.url} onClick={()=>onChange(p.url)}>[{p.blog}] {p.title}{value===p.url?' ✓':''}</button>;
 return <div className="stack" style={{gap:8}}>
  <label className="small" htmlFor="carousel-post-search">블로그 글 검색하기</label>
  <form className="row" style={{gap:6}} onSubmit={e=>{e.preventDefault();if(query.trim())void search();}}>
   <input id="carousel-post-search" className="input" style={{flex:1,minWidth:0}} type="search" value={query} onChange={e=>{active.current?.abort();setBusy(false);setQuery(e.target.value);setError('');}} placeholder="제목·키워드 입력"/>
   <button type="submit" className="btn btn-sm" disabled={busy||!query.trim()}>{busy?'검색 중…':'예전 글도 검색'}</button>
  </form>
  <p className="tiny muted" style={{margin:0}}>입력하면 최근 목록에서 찾고, ‘예전 글도 검색’을 누르면 네이버 검색에 노출된 글까지 찾아요. 검색에 없는 글은 아래에 주소를 넣어 주세요.</p>
  {query.trim()&&<div className="stack" style={{gap:4}}><span className="tiny muted" role="status">검색 결과 {found.length}개</span>{found.length?<div className="stack" style={{maxHeight:240,overflowY:'auto',gap:4}}>{found.map(choose)}</div>:<p className="small muted" style={{margin:0}}>일치하는 글이 없어요. ‘예전 글도 검색’을 누르거나 글 주소를 입력해 주세요.</p>}{searched===query.trim()&&next&&<button className="btn btn-sm" disabled={busy} onClick={()=>search(next)}>검색 결과 더 보기</button>}</div>}
  {error&&<p className="notice small" role="alert">{error} 최근 글 목록과 직접 주소 입력은 계속 사용할 수 있어요.</p>}
  <b className="small">최근 블로그 글 목록 · {recent.length}개</b>
  {recent.length?<div className="stack" style={{maxHeight:220,overflowY:'auto',gap:4}}>{recent.map(choose)}</div>:<p className="small muted">불러온 최근 글이 없어요. 위에서 검색하거나 아래에 글 주소를 넣어 주세요.</p>}
 </div>;
}
