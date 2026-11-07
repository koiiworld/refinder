"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import type { CarouselStyle, Slide } from "@/lib/carousel";
import { type LearningRef, type DesignRecipe } from "@/lib/carousel-design-types";
import { renderSlide } from "./render";
function Sample({recipe,slide,img,style,total}:{total:number;recipe?:DesignRecipe;slide:Slide;img:HTMLImageElement|null;style:CarouselStyle}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ref.current)renderSlide(ref.current,slide,0,total,img,{...style,design:recipe});},[recipe,slide,img,style,total]);
  return <canvas ref={ref} style={{width:"100%",height:"auto",borderRadius:8}} aria-label="디자인 시안"/>;
}
export default function DesignPicker({style,slide,img,disabled,onChoose,total}:{total:number;style:CarouselStyle;slide:Slide;img:HTMLImageElement|null;disabled:boolean;onChoose:(style:CarouselStyle)=>void}){
  const [refs,setRefs]=useState<LearningRef[]>([]),[selected,setSelected]=useState(""),[error,setError]=useState("");
  useEffect(()=>{api<{items:LearningRef[]}>("/api/learn").then(r=>{const list=r.items.filter(x=>x.enabled&&x.analysis?.categories.includes("design"));setRefs(list);setSelected(list.find(x=>x.id===style.designRef)?.id??list[0]?.id??"");}).catch(e=>setError(e.message));},[]);
  const source=refs.find(x=>x.id===selected), recipe=source?.analysis?.recipe;
  const options:{label:string;recipe?:DesignRecipe}[]=[{label:"기존 디자인"},{label:"학습한 디자인",recipe},{label:"변형 시안",recipe:recipe?{...recipe,layout:recipe.layout==="poster"?"split":"poster",spacing:recipe.spacing==="airy"?"compact":"airy"}:undefined}];
  return <section className="card card-pad stack" style={{gap:10}}><div className="row between"><b>디자인 학습 시안</b><Link className="small" href="/learn/design">참고 자료 추가·학습 →</Link></div><p className="tiny muted">시안 비교·선택은 AI 호출 없이 무료예요. 선택하면 미리보기에 적용되며 ‘저장’을 눌러 확정해요. 원본 사진과 문구를 복사하지 않아요.</p>{error&&<p className="small">{error}</p>}{!recipe?<p className="small muted">AI 학습지에 디자인 자료를 학습하면 여기서 새 배치를 비교할 수 있어요.</p>:<><select className="input" aria-label="디자인 참고 자료" value={selected} onChange={e=>setSelected(e.target.value)}>{refs.map(r=><option key={r.id} value={r.id}>{r.favorite?"★ ":""}{r.title}</option>)}</select><p className="small">{source?.analysis?.summary}</p><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}>{options.map((o,i)=><div key={o.label} className="stack" style={{gap:6}}><Sample total={total} recipe={o.recipe} slide={slide} img={img} style={style}/><button className="btn btn-sm" disabled={disabled} onClick={()=>onChoose({...style,design:o.recipe??null,accent:o.recipe?.accent??style.accent,designRef:i===0?"":selected})}>{o.label} 선택</button></div>)}</div></>}</section>;
}
