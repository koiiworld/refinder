"use client";
import {useEffect,useRef} from 'react';
import type {Slide,CarouselStyle} from '@/lib/carousel';
import {renderSlide} from './render';
export default function CardZoom({slides,index,img,style,fontReady,onIndex,onClose}:{slides:Slide[];index:number;img:HTMLImageElement|null;style:CarouselStyle;fontReady:boolean;onIndex:(index:number)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const node=dialog.current;if(!node)return;const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;const previous=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();return()=>{if(node.open)node.close();document.body.style.overflow=previous;if(focused?.isConnected)focused.focus();};},[]);
 useEffect(()=>{if(canvas.current)renderSlide(canvas.current,slides[index],index,slides.length,img,style);},[slides,index,img,style,fontReady]);
 return <dialog ref={dialog} aria-label="캐러셀 카드 크게 보기" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}} onKeyDown={e=>{if(e.key==='ArrowLeft'&&index>0){e.preventDefault();onIndex(index-1);}if(e.key==='ArrowRight'&&index<slides.length-1){e.preventDefault();onIndex(index+1);}}} style={{width:'min(94vw,760px)',maxHeight:'94dvh',overflow:'auto',padding:16,border:0,borderRadius:14,background:'var(--panel)',color:'var(--text)'}}>
 <div className="row between" style={{marginBottom:12}}><b>{index+1} / {slides.length}장 · 크게 보기</b><button className="btn btn-sm" autoFocus onClick={onClose} aria-label="카드 확대 닫기">닫기 ✕</button></div>
 <canvas ref={canvas} aria-label={`${index+1}장 확대 미리보기`} style={{display:'block',width:'min(100%,640px)',height:'auto',margin:'0 auto',borderRadius:10}}/>
 <div className="row between" style={{marginTop:12}}><button className="btn btn-sm" disabled={index===0} onClick={()=>onIndex(index-1)}>← 이전 카드</button><button className="btn btn-sm" disabled={index===slides.length-1} onClick={()=>onIndex(index+1)}>다음 카드 →</button></div><p className="tiny muted" style={{marginTop:8}}>현재 편집 중인 문구·사진·디자인을 보여줘요.</p><style jsx>{`dialog::backdrop{background:rgba(0,0,0,.78)}`}</style>
 </dialog>;
}
