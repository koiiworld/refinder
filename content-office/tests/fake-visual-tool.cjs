#!/usr/bin/env node
// 로컬 AI 모델의 프로세스 경계용 모의 도구. 모델 품질은 검증하지 않음.
// 실제 PNG 변환·프레임 수 변경을 하므로 뒤의 ffmpeg/DB/작업 큐 검증은 그대로 수행.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [mode,...args]=process.argv.slice(2), ffmpeg=require('ffmpeg-static');
const arg=(k)=>args[args.indexOf(k)+1];
let src,dst;
if(mode==='bgremove') {if(!args[0]?.endsWith('bgremove.py'))throw Error('unexpected Python script');[,src,dst]=args;}
else {if(!args.includes('-i')||!args.includes('-o'))throw Error('missing tool arguments');src=arg('-i');dst=arg('-o');}
const folder=fs.statSync(src).isDirectory(), files=folder?fs.readdirSync(src).filter(f=>f.endsWith('.png')).sort():[path.basename(src)];
if(folder)fs.mkdirSync(dst,{recursive:true});
if(mode==='rife') {
  const count=Number(arg('-n'));if(!folder||count<files.length)throw Error('bad frame count');
  for(let i=0;i<count;i++)fs.copyFileSync(path.join(src,files[Math.min(files.length-1,Math.floor(i*files.length/count))]),path.join(dst,String(i+1).padStart(8,'0')+'.png'));
} else {
  for(const f of files){const from=folder?path.join(src,f):src,to=folder?path.join(dst,f):dst;
    const filter=mode==='bgremove'?'format=rgba,colorchannelmixer=aa=0.6':`scale=iw*${Number(arg('-s'))}:ih*${Number(arg('-s'))}`;
    execFileSync(ffmpeg,['-v','error','-y','-i',from,'-vf',filter,'-frames:v','1',to],{stdio:'pipe'});
  }
}
console.log('progress 1');
