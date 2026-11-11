"use client";
import {useEffect,useRef,useState} from 'react';
import type {Slide,CarouselStyle} from '@/lib/carousel';
import {renderSlide,renderMotionFrame,type Pic} from './render';
import {effectFor,loadVideo,MOTION_KEY,type Choice} from './MotionPanel';
export default function CardZoom({carouselId,slides,index,img,style,fontReady,onIndex,onClose}:{carouselId?:string;slides:Slide[];index:number;img:HTMLImageElement|null;style:CarouselStyle;fontReady:boolean;onIndex:(index:number)=>void;onClose:()=>void}){
 const [moving,setMoving]=useState(()=>{try{return localStorage.getItem('carousel-zoom-motion')!=='0';}catch{return true;}});
 const [note,setNote]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const node=dialog.current;if(!node)return;const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;const previous=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();return()=>{if(node.open)node.close();document.body.style.overflow=previous;if(focused?.isConnected)focused.focus();};},[]);
 useEffect(()=>{
  const cv=canvas.current;if(!cv)return;
  const s=slides[index];
  if(!moving){renderSlide(cv,s,index,slides.length,img,style);return;}
  // 🎞 움직임으로 보기: AI 영상 카드는 그 영상, 나머지는 모션 캐러셀 설정(움직임·길이·글자)대로 반복 재생
  let cfg:{choice?:Choice;seconds?:number;textAnim?:boolean}={};try{cfg=JSON.parse(localStorage.getItem(MOTION_KEY)??'{}');}catch{}
  const seconds=cfg.seconds??5,textAnim=!!cfg.textAnim,fx=effectFor(cfg.choice??'auto',index);
  let alive=true,raf=0,vid:HTMLVideoElement|null=null;const t0=performance.now();setNote('');
  const tick=()=>{if(!alive)return;
   if(vid){const d=vid.duration||5;renderMotionFrame(cv,s,index,slides.length,vid as Pic,style,(vid.currentTime%d)/d,d,'still',textAnim);}
   else{const t=((performance.now()-t0)/1000%seconds)/seconds;renderMotionFrame(cv,s,index,slides.length,img,style,t,seconds,fx,textAnim);}
   raf=requestAnimationFrame(tick);};
  (async()=>{
   if(s.video?.url&&carouselId){try{vid=await loadVideo(`/api/carousels/${carouselId}/video/${s.video.jobId}`);vid.loop=true;await vid.play().catch(()=>{});}catch(e){setNote((e as Error).message);vid=null;}}
   if(alive)raf=requestAnimationFrame(tick);
  })();
  return()=>{alive=false;cancelAnimationFrame(raf);if(vid){vid.pause();vid.removeAttribute('src');vid.load();}};
 },[slides,index,img,style,fontReady,moving,carouselId]);
 return <dialog ref={dialog} aria-label="캐러셀 카드 크게 보기" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}} onKeyDown={e=>{if(e.key==='ArrowLeft'&&index>0){e.preventDefault();onIndex(index-1);}if(e.key==='ArrowRight'&&index<slides.length-1){e.preventDefault();onIndex(index+1);}}} style={{width:'min(94vw,760px)',maxHeight:'94dvh',overflow:'auto',padding:16,border:0,borderRadius:14,background:'var(--panel)',color:'var(--text)'}}>
 <div className="row between" style={{marginBottom:12}}><b>{index+1} / {slides.length}장 · 크게 보기</b><button className={`btn btn-sm ${moving?"btn-primary":""}`} aria-pressed={moving} onClick={()=>{const v=!moving;setMoving(v);try{localStorage.setItem('carousel-zoom-motion',v?'1':'0');}catch{}}}>{moving?"🎞 움직임으로 보는 중":"▶ 움직임으로 보기"}</button><button className="btn btn-sm" autoFocus onClick={onClose} aria-label="카드 확대 닫기">닫기 ✕</button></div>
 {note&&<p className="small notice notice-bad" style={{margin:'0 0 8px'}}>{note}</p>}
 <canvas ref={canvas} aria-label={`${index+1}장 확대 미리보기`} style={{display:'block',width:'min(100%,640px)',height:'auto',margin:'0 auto',borderRadius:10}}/>
 <div className="row between" style={{marginTop:12}}><button className="btn btn-sm" disabled={index===0} onClick={()=>onIndex(index-1)}>← 이전 카드</button><button className="btn btn-sm" disabled={index===slides.length-1} onClick={()=>onIndex(index+1)}>다음 카드 →</button></div><p className="tiny muted" style={{marginTop:8}}>현재 편집 중인 문구·사진·디자인을 보여줘요.</p><style jsx>{`dialog::backdrop{background:rgba(0,0,0,.78)}`}</style>
 </dialog>;
}
