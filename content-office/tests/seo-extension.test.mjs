import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../chrome-extension/seo-core.js',import.meta.url),'utf8');
const {classify}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('실제 완료 문구만 성공, 확인 질문·차단·한도는 중단',()=>{
 assert.equal(classify('서로이웃 신청 완료\n초보할머니님에게\n서로이웃을 신청하였습니다.'),'success');
 assert.equal(classify('서로이웃 신청하시겠습니까?'),'unconfirmed');
 assert.equal(classify('하루에 100명까지 신청할 수 있습니다'),'unconfirmed');
 assert.equal(classify('하루에 100명 초과로 신청할 수 없습니다'),'limit');
 assert.equal(classify('계정 보호조치가 적용되었습니다'),'error');
 assert.equal(classify('이미 신청 중입니다'),'already');
 assert.equal(classify('서로이웃 그룹 인원이 가득 찼습니다'),'group_full');
 assert.equal(classify('처리 결과를 확인하세요'),'unconfirmed');
});

import vm from 'node:vm';
test('실행창: 확인 후 1회 전송·중복 제외·계정 불일치 중지·끊긴 결과 재전송',async()=>{
 const elements=Object.fromEntries(['start','stop','state','log','naver','baseline'].map(id=>[id,{textContent:'',value:'0',disabled:false}]));
 const storage={},out=[],tabs=new Map();let claims=[],submitted=0,id=0,offline=false,closeOnUpdate=false,closeOnSubmit=false;
 const chrome={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,storage[k]]));},async set(v){Object.assign(storage,structuredClone(v));},async remove(k){delete storage[k];}}},runtime:{async sendMessage(){return {ok:true};}},tabs:{async getCurrent(){return {id:99};},async create(o){const t={id:++id,url:o.url,status:'complete'};tabs.set(id,t);return t;},async update(id,o){if(id===99)return {id};if(closeOnUpdate){closeOnUpdate=false;tabs.delete(id);}if(!tabs.has(id))throw Error('No tab with id: '+id);Object.assign(tabs.get(id),o);return tabs.get(id);},async get(id){if(!tabs.has(id))throw Error('No tab with id: '+id);return tabs.get(id);}},scripting:{async executeScript({target,func,args}){
  const tab=tabs.get(target.tabId);let result;
  if(func.name==='formStep'){if(args[0]==='submit'){if(closeOnSubmit){closeOnSubmit=false;tabs.delete(target.tabId);throw Error('No tab with id: '+target.tabId);}submitted++;result={ok:true};}else result={ok:true,text:'신청 폼'};}
  else if(func.name==='readPage')result={url:tab.url,title:'완료',text:'서로이웃을 신청하였습니다.'};
  else if(func.toString().includes('const urls='))result='myblogid';
  else result=[];
  return [{result}];
 }}};
 storage.appUrl='https://app.example.test';storage.code='fixture';
 const ctx=vm.createContext({console,chrome,document:{getElementById:id=>elements[id]},URL,Intl,Date,Math,Map,Number,Object,Array,String,JSON,AbortSignal,confirm:()=>true,setInterval:()=>1,clearInterval(){},setTimeout:fn=>{fn();return 1;},fetch:async(_url,init)=>{
  const b=JSON.parse(init.body);if(offline&&b.action==='result')throw Error('offline');
  let data={};if(b.action==='claim')data={job:claims.shift()??null};else if(b.action==='heartbeat')data={cancelled:false};else if(b.action==='result')out.push(b);
  return {ok:true,json:async()=>data};
 }});
 const script=source.replaceAll('export function ','function ')+'\n'+fs.readFileSync(new URL('../chrome-extension/seoichoo.js',import.meta.url),'utf8').replace(/^import .*\n/,'');
 vm.runInContext(script,ctx);
 const make=(id,account='myblogid')=>({id,kind:'apply',payload:{account,candidates:[{blog_id:'friend',nick:'친구'}],message:'안녕하세요'}});
 claims=[make('one')];await elements.start.onclick();assert.equal(submitted,1);assert.equal(out[0].result.results[0].status,'success');
 // 이전 작업 탭을 닫아도 다음 작업은 새 탭으로 복구.
 tabs.clear();
 claims=[make('two')];await elements.start.onclick();assert.equal(submitted,1);assert.equal(out[1].result.results[0].status,'already');assert.equal(id,2);
 claims=[make('wrong','different')];await elements.start.onclick();assert.equal(submitted,1);assert.equal(out[2].status,'error');
 // 성공 결과 전송 실패 시 오류로 덮어쓰거나 신청 재실행하지 않음.
 delete storage.seoHistory.friend;offline=true;claims=[make('lost')];await elements.start.onclick();assert.equal(submitted,2);assert.equal(storage.seoPendingResult.result.results[0].status,'success');
 offline=false;claims=[];await elements.start.onclick();assert.equal(submitted,2);assert.equal(out.at(-1).id,'lost');assert.equal(storage.seoPendingResult,undefined);
 // 탭 확인 직후 닫힌 경우에도 화면 열기만 복구, 신청은 1회.
 delete storage.seoHistory.friend;closeOnUpdate=true;claims=[make('race')];await elements.start.onclick();assert.equal(submitted,3);assert.equal(out.at(-1).result.results[0].status,'success');
 // 전송 단계에서 탭이 닫히면 미확인 기록을 남기고 자동 전송 재시도 금지.
 delete storage.seoHistory.friend;closeOnSubmit=true;claims=[make('closed-at-submit')];await elements.start.onclick();assert.equal(submitted,3);assert.equal(out.at(-1).status,'unconfirmed');assert.match(out.at(-1).result.results[0].detail,/탭이 닫혔어요/);
 claims=[make('after-closed-submit')];await elements.start.onclick();assert.equal(submitted,3);assert.equal(out.at(-1).result.results[0].status,'already');
});
