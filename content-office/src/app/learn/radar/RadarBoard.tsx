"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api} from '@/components/client-utils';
import type {radarState} from '@/lib/radar';
type State=Awaited<ReturnType<typeof radarState>>;
const LABELS:Record<string,string>={instagram:'인스타그램',youtube:'유튜브',rss:'블로그 / 웹사이트'};
export default function RadarBoard(){
  const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const [editing,setEditing]=useState(''),[platform,setPlatform]=useState('instagram'),[url,setUrl]=useState(''),[name,setName]=useState('');
  const [postUrl,setPostUrl]=useState(''),[postText,setPostText]=useState(''),[postTitle,setPostTitle]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{api<State>('/api/radar').then(setData).catch(e=>setMsg(e.message));},[]);
  function reset(){setEditing('');setPlatform('instagram');setUrl('');setName('');}
  async function save(){setBusy(true);try{setData(await api<State>('/api/radar','POST',{action:'source',...(editing?{id:editing}:{}),platform,url,name}));setMsg('관심 계정을 저장했어요.');reset();}catch(e){setMsg((e as Error).message);}finally{setBusy(false);}}
  async function addPost(){setBusy(true);setSaved(false);try{await api('/api/radar','POST',{action:'post',url:postUrl,text:postText,title:postTitle});setSaved(true);setMsg('기타 학습지에 자료를 저장했어요. 비용을 확인한 뒤 학습해 주세요.');setPostUrl('');setPostText('');setPostTitle('');}catch(e){setMsg((e as Error).message);}finally{setBusy(false);}}
  return <>
    <p className="notice small">관심 계정을 모아 두고 원본 사이트에서 직접 확인해요. 계정 저장과 바로가기는 AI 비용이 없어요.</p>
    <section className="card card-pad stack" style={{gap:8}}><h2>{editing?'관심 계정 수정':'관심 계정 저장'}</h2><select className="input" aria-label="계정 종류" value={platform} onChange={e=>setPlatform(e.target.value)}>{Object.entries(LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><input className="input" aria-label="계정 이름" placeholder="알아보기 쉬운 이름" value={name} onChange={e=>setName(e.target.value)}/><input className="input" aria-label="계정 주소" placeholder={platform==='instagram'?'@계정 또는 인스타 프로필 주소':platform==='youtube'?'https://www.youtube.com/@계정':'블로그 또는 웹사이트 주소'} value={url} onChange={e=>setUrl(e.target.value)}/><div className="row"><button className="btn btn-primary" disabled={busy||!url.trim()} onClick={save}>{editing?'수정 저장':'계정 저장'}</button>{editing&&<button className="btn" disabled={busy} onClick={reset}>취소</button>}</div></section>
    {msg&&<p className="notice small" role="status">{msg}</p>}
    <h2>관심 계정 바로가기</h2>
    {data&&!data.sources.length&&<p className="small muted">자주 보는 계정을 저장해 주세요.</p>}
    {data?.sources.map(s=><section className="card card-pad stack" key={s.id} style={{gap:8}}><div className="row between"><b style={{overflowWrap:'anywhere'}}>{s.name}</b><span className="small muted">{LABELS[s.platform]??s.platform}</span></div><a className="small" href={s.url} target="_blank" rel="noopener noreferrer" style={{overflowWrap:'anywhere'}}>{s.url}</a><div className="row"><a className="btn btn-primary btn-sm" href={s.url} target="_blank" rel="noopener noreferrer">계정 바로가기 ↗</a><button className="btn btn-sm" disabled={busy} onClick={()=>{setEditing(s.id);setPlatform(s.platform);setUrl(s.url);setName(s.name);window.scrollTo({top:0,behavior:'smooth'});}}>계정 수정</button></div></section>)}
    <section className="card card-pad stack" style={{gap:8}}><h2>게시물 직접 추가</h2><p className="small muted">링크와 본문·마크다운을 학습 자료로 저장해요. 본문을 함께 넣으면 자동 읽기가 막힌 게시물도 저장할 수 있어요. AI 학습은 학습지에서 비용을 확인한 뒤 실행해요.</p><input className="input" aria-label="게시물 제목" placeholder="자료 이름 (선택)" value={postTitle} onChange={e=>setPostTitle(e.target.value)}/><input className="input" aria-label="게시물 주소" placeholder="참고할 게시물 주소" value={postUrl} onChange={e=>setPostUrl(e.target.value)}/><textarea className="input" aria-label="게시물 본문" placeholder="게시물 본문·마크다운" value={postText} onChange={e=>setPostText(e.target.value)}/><input type="file" accept=".md,.txt" aria-label="게시물 마크다운 파일" onChange={async e=>{const file=e.target.files?.[0];if(file){if(file.size>200000){setMsg('200KB 이하의 파일을 넣어 주세요.');return;}setPostText(await file.text());}}}/><button className="btn" disabled={busy||(!postUrl.trim()&&!postText.trim())} onClick={addPost}>학습지에 자료 저장 (AI 호출 없음)</button>{saved&&<Link className="btn btn-primary" href="/learn/other">기타 학습지에서 확인·학습 →</Link>}</section>
  </>;
}
