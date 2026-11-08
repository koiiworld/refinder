"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate, fmtUsd } from "@/components/ui";
import { LEARN_CATEGORIES, type LearningRef, type LearnCategory } from "@/lib/carousel-design-types";
type Estimate={provider:string;model:string;usd:number|null;connected:boolean};
export default function LearningBoard({category}:{category:LearnCategory}) {
  const [items,setItems]=useState<LearningRef[]>([]), [estimate,setEstimate]=useState<Estimate|null>(null);
  const [text,setText]=useState(""),[url,setUrl]=useState(""),[title,setTitle]=useState(""),[note,setNote]=useState(""),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(""),[msg,setMsg]=useState("");
  async function refresh(){const r=await api<{items:LearningRef[];estimate:Estimate}>("/api/learn");setItems(r.items);setEstimate(r.estimate);}
  useEffect(()=>{refresh().catch(e=>setMsg(e.message));},[]);
  const change=(r:LearningRef)=>setItems(all=>[r,...all.filter(x=>x.id!==r.id)]);
  async function save(){setBusy("save");setMsg("");try {
    const images=await Promise.all(files.map(f=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>no(new Error("사진을 읽지 못했어요."));r.readAsDataURL(f);})));
    const r=await api<LearningRef>("/api/learn","POST",{category,url,title,note,images,text});change(r);setText("");setUrl("");setTitle("");setNote("");setFiles([]);setMsg(r.needs_material ? `본문·전체 자료를 확인하지 못해 아직 학습할 수 없어요. 확보한 이미지 ${r.images.length}장만으로 글 내용을 읽었다고 하지 않아요. 아래에서 본문·마크다운을 보충해 주세요.` : `아직 학습 전이에요. 본문 ${r.source_text?.length??0}자와 이미지 ${r.images.length}장을 저장했어요. 읽은 본문을 확인한 뒤 내용 학습을 시작하세요.`);
  } catch(e){setMsg((e as Error).message);} finally{setBusy("");}}
  async function analyze(r:LearningRef){
    if(!estimate?.connected)return;
    if(!confirm(`이 자료를 AI로 분석할까요? 예상 ${estimate.usd===null?"단가 미등록":fmtUsd(estimate.usd)} · ${estimate.model}. 이미지와 글 길이에 따라 실제 비용이 달라져요. 다른 AI로 자동 전환하지 않아요.`))return;
    setBusy(r.id);try{change(await api<LearningRef>(`/api/learn/${r.id}`,"POST",{confirm:true}));setMsg("학습했어요. 켜져 있는 자료의 원칙을 다음 생성에 참고해요.");}catch(e){setMsg((e as Error).message);}finally{setBusy("");}
  }
  async function update(r:LearningRef,patch:Record<string,unknown>){setBusy(r.id);try{change(await api<LearningRef>(`/api/learn/${r.id}`,"PATCH",patch));}catch(e){setMsg((e as Error).message);}finally{setBusy("");}}
  const shown=items.filter(r=>r.category===category||r.analysis?.categories.includes(category as never));
  return <>
    <nav className="row" aria-label="학습 분야"><Link className="btn btn-sm" href="/learn">AI 학습지</Link><Link className="btn btn-sm" href="/learn/tasks">과제물</Link>{LEARN_CATEGORIES.map(c=><Link className={`btn btn-sm ${category===c.id?"btn-primary":""}`} key={c.id} href={`/learn/${c.id}`}>{c.label}</Link>)}</nav>
    <section className="card card-pad stack" style={{gap:10}}>
      <b>참고 링크 붙여넣기</b><p className="small muted">인스타 게시물·핀터레스트 핀(pin.it 포함)·네이버/티스토리 글을 지원해요. 공개 자료만 읽으며, 접근이 막히면 캡처를 올려 주세요. 최대 6장만 분석해요.</p>
      <input className="input" aria-label="참고 링크" placeholder="https://www.instagram.com/p/… 또는 핀터레스트·블로그 링크" value={url} onChange={e=>setUrl(e.target.value)}/>
      <textarea className="input" aria-label="본문·마크다운" placeholder="게시물 설명문·본문 또는 마크다운을 붙여넣어도 돼요. 핵심 정보·추가 비용·주의사항을 함께 넣어 주세요." value={text} onChange={e=>setText(e.target.value)}/>
      <label className="small">마크다운·텍스트 파일<input type="file" accept=".md,.txt,text/plain,text/markdown" onChange={async e=>{const f=e.target.files?.[0];if(f&&f.size<=200000)setText(await f.text());else if(f)setMsg("본문 파일은 200KB 이하로 넣어 주세요.");}}/></label>
      <input className="input" aria-label="자료 이름" placeholder="자료 이름 (선택)" value={title} onChange={e=>setTitle(e.target.value)}/>
      <textarea className="input" aria-label="좋은 점" placeholder="어떤 점이 좋은가요? (선택 · 나중에도 수정할 수 있어요)" value={note} onChange={e=>setNote(e.target.value)}/>
      <label className="small">캡처 대신 올리기 (장당 4MB 이하)<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!!busy} onChange={e=>{const fs=Array.from(e.target.files??[]).slice(0,6);if(fs.some(f=>f.size>4*1024*1024)){setMsg("사진은 장당 4MB 이하로 올려 주세요.");return;}setFiles(fs);}}/></label>
      {files.length>0&&<span className="small">선택한 캡처 {files.length}장</span>}
      <button className="btn btn-primary" disabled={!!busy||(!url.trim()&&!files.length&&!text.trim())} onClick={save}>{busy==="save"?"가져오는 중…":"자료 가져오기 (AI 호출 없음)"}</button>
      <p className="tiny muted">AI 학습 1회 예상: {estimate ? estimate.usd===null?"단가 미등록":fmtUsd(estimate.usd):"불러오는 중…"} · {estimate?.model} · 실제 비용과 다를 수 있어요. 분석은 학습 버튼을 누를 때만 실행해요.</p>
      {estimate&&!estimate.connected&&<p className="small">분석 AI가 연결되지 않았어요. 설정의 ‘릴스 분석’ 담당 AI를 확인해 주세요.</p>}
    </section>
    {msg&&<div role="status" className="notice small" style={{whiteSpace:"pre-wrap"}}>{msg}</div>}
    <p className="small muted">최근 자료와 ★ 선호 자료를 우선 참고해요. 사용 끄기는 기록을 보관하며, 다음 생성부터 제외해요. 같은 자료를 다시 학습해도 이미 완료된 결과를 불러와요.</p>
    {!shown.length&&<p className="muted">아직 자료가 없어요. 참고 링크 하나로 시작해 보세요.</p>}
    {shown.map(r=><article key={r.id} className="card card-pad stack" style={{gap:10,opacity:r.enabled?1:0.65}}>
      <div className="row between"><b>{r.title}</b><span className="tiny muted">{fmtDate(r.created_at,false)}</span></div>
      {r.source_url&&<a href={r.source_url} target="_blank" rel="noopener noreferrer" className="small">원본 자료 ↗</a>}
      <div className="notice small"><b>{r.analysis?.knowledge?.length?"내용 학습 완료":r.analysis?"이전 방식 분석 · 내용 재학습 필요":r.needs_material?"본문·자료 보충 필요":"수집 완료 · 아직 학습 전"}</b><p>{r.coverage?.note??"이전 자료는 읽은 범위를 확인하지 못했어요. 본문을 다시 읽거나 보충해 주세요."}</p><p>읽은 본문 {r.source_text?.length??0}자 · 이미지 {r.images.length}장{r.coverage?.expectedImages!=null?` / 확인된 전체 ${r.coverage.expectedImages}장`:""}</p></div>
      <details><summary className="small">실제로 가져온 본문 보기</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:320,overflowY:"auto"}}>{r.source_text||"가져온 본문이 없습니다. 이미지나 제목만으로 본문을 읽었다고 간주하지 않아요."}</pre></details>
      <MaterialEditor reference={r} disabled={!!busy} onSaved={change} onError={setMsg}/>
      <div className="row">{r.images.map((url,i)=><a href={url} target="_blank" rel="noopener noreferrer" key={url}><img src={url} alt={`참고 ${i+1}장`} style={{width:100,height:125,objectFit:"cover",borderRadius:8}}/></a>)}</div>
      <textarea className="input" aria-label={`${r.title} 취향 메모`} defaultValue={r.note} onBlur={e=>{if(e.target.value!==r.note)void update(r,{note:e.target.value});}} placeholder="좋은 점·피하고 싶은 점 (칸 밖을 누르면 저장)"/>
      <div className="row"><button className="btn btn-sm" disabled={!!busy} onClick={()=>update(r,{favorite:!r.favorite})}>{r.favorite?"★ 선호함":"☆ 선호하기"}</button><button className="btn btn-sm" disabled={!!busy} onClick={()=>update(r,{enabled:!r.enabled})}>{r.enabled?"사용 중 · 끄기":"사용 꺼짐 · 켜기"}</button>{!r.analysis&&<button className="btn btn-primary btn-sm" disabled={!!busy||!estimate?.connected||r.needs_material} onClick={()=>analyze(r)}>{busy===r.id?"학습 중…":"비용 확인 후 AI 학습"}</button>}</div>
      {r.analysis&&<><p>{r.analysis.summary}</p>{r.analysis.knowledge?.map((k,i)=><section key={i} className="notice small"><b>{k.topic}</b><p>{k.detail}</p>{k.evidence&&<p className="muted">원문 근거: “{k.evidence}”</p>}<p>사용 조건·주의: {k.conditions||"원문에서 확인되지 않음"}</p><p>우리 작업에 활용: {k.application}</p><span className="tiny muted">출처의 설명을 정리한 내용이며, 실제 기능·가격·성과는 별도 확인이 필요해요.</span></section>)}</>}
      {r.analysis&&<><p className="small muted">분류 이유: {r.analysis.reason}</p><div className="row">{LEARN_CATEGORIES.filter(c=>c.id!=="other").map(c=><label className="small" key={c.id}><input type="checkbox" disabled={!!busy} checked={r.analysis!.categories.includes(c.id as never)} onChange={e=>update(r,{categories:e.target.checked?[...r.analysis!.categories,c.id]:r.analysis!.categories.filter(x=>x!==c.id)})}/>{c.label}에 활용</label>)}</div>
        {Object.entries(r.analysis.lessons).map(([key,lessons])=><div key={key}><b className="small">{LEARN_CATEGORIES.find(c=>c.id===key)?.label} 원칙</b><ul className="small">{lessons?.map((s,i)=><li key={i}>{s}</li>)}</ul></div>)}
        {r.analysis.hooks.map((h,i)=><div className="notice small" key={i}><b>“{h.quote}”</b><p>{h.why}</p><p>응용 구조: {h.pattern}</p></div>)}
        {!!r.analysis.avoid.length&&<p className="small">피할 점: {r.analysis.avoid.join(" · ")}</p>}
        {r.analysis.categories.includes("design")&&<Link className="btn btn-sm" href="/carousels">캐러셀에서 디자인 시안 보기 →</Link>}
      </>}
    </article>)}
  </>;
}

function MaterialEditor({reference:r,disabled,onSaved,onError}:{reference:LearningRef;disabled:boolean;onSaved:(r:LearningRef)=>void;onError:(s:string)=>void}) {
  const [text,setText]=useState(""),[working,setWorking]=useState(false);
  async function save(refresh=false){setWorking(true);try{onSaved(await api<LearningRef>(`/api/learn/${r.id}`,"POST",refresh?{action:"refresh"}:{action:"supplement",text}));setText("");onError("자료를 다시 준비했어요. 읽은 본문을 확인한 뒤 학습하세요. 이전 분석은 보관해요.");}catch(e){onError((e as Error).message);}finally{setWorking(false);}}
  return <details><summary className="small">본문·마크다운 보충 / 원본 다시 읽기</summary><div className="stack" style={{gap:8,paddingTop:8}}><textarea className="input" aria-label={`${r.title} 본문 보충`} placeholder="설명문·본문·마크다운 붙여넣기" value={text} onChange={e=>setText(e.target.value)}/><input type="file" accept=".md,.txt" aria-label={`${r.title} 마크다운 파일`} onChange={async e=>{const f=e.target.files?.[0];if(f&&f.size<=200000)setText(await f.text());else if(f)onError("본문 파일은 200KB 이하로 넣어 주세요.");}}/><div className="row"><button className="btn btn-sm" disabled={disabled||working||!text.trim()} onClick={()=>save()}>본문 보충 저장 (AI 호출 없음)</button>{r.source_url&&<button className="btn btn-sm" disabled={disabled||working} onClick={()=>save(true)}>원본 다시 읽기</button>}</div></div></details>;
}
