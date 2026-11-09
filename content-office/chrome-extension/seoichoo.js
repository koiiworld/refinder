import {classify,formStep,readPage} from './seo-core.js';
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let running=false,stopped=false,job=null,tabId=null,history={},base=0,heartbeat=null,progress=[];
async function ask(text){const current=await chrome.tabs.getCurrent();await chrome.tabs.update(current.id,{active:true});return confirm(text);}
const log=t=>{$('log').textContent+=t+'\n';$('state').textContent=t;};
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function api(payload){
 const {appUrl,code}=await chrome.storage.local.get(['appUrl','code']);
 if(!appUrl)throw Error('확장 아이콘에서 앱 주소와 연결 코드를 먼저 저장해 주세요.');
 const u=new URL(appUrl);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('앱 주소는 https가 필요해요.');
 const res=await fetch(u.origin+'/api/ext/seoichoo',{method:'POST',headers:{'content-type':'application/json','x-co-ext':code||''},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=await res.json();if(!res.ok)throw Error(data.error||'웹앱 연결 실패');return data;
}
function missingTab(error){return /No tab with id|Invalid tab ID/i.test(error?.message??'');}
async function inject(func,args=[]){
 try{const [r]=await chrome.scripting.executeScript({target:{tabId},func,args});return r.result;}
 catch(e){if(missingTab(e)){tabId=null;throw Error('네이버 작업 탭이 닫혔어요. 신청 여부를 직접 확인해 주세요. 이미 보낸 신청은 다시 전송하지 않습니다.');}throw e;}
}
async function open(url){
 // 이전 작업에서 닫힌 탭 ID를 재사용하지 않음. 전송 자체는 재시도하지 않음.
 if(tabId!==null){try{await chrome.tabs.get(tabId);}catch(e){if(!missingTab(e))throw e;tabId=null;}}
 if(tabId!==null){try{await chrome.tabs.update(tabId,{url,active:true});}catch(e){if(!missingTab(e))throw e;tabId=null;}}
 if(tabId===null){const tab=await chrome.tabs.create({url,active:true});tabId=tab.id;}
 const until=Date.now()+30000;
 while(Date.now()<until){
  if(stopped)throw Error('중지 요청됨');
  let tab;try{tab=await chrome.tabs.get(tabId);}catch(e){if(!missingTab(e))throw e;tabId=null;throw Error('네이버 작업 탭이 닫혔어요. 실행창에서 작업을 다시 확인해 주세요.');}
  if(tab.status==='complete'){await sleep(700);return;}await sleep(250);
 }
 throw Error('네이버 화면을 불러오지 못했습니다. 직접 확인해 주세요.');
}
async function saveHistory(){await chrome.storage.local.set({seoHistory:history});}
function todayCount(){return base+Object.values(history).filter(x=>x.day===day()).length;}
async function flush(){const {seoPendingResult}=await chrome.storage.local.get('seoPendingResult');if(seoPendingResult){await api(seoPendingResult);await chrome.storage.local.remove('seoPendingResult');}}
async function publish(status,result){const payload={action:'result',id:job.id,status,result};await chrome.storage.local.set({seoPendingResult:payload});await flush();}
async function identify(){
 await open('https://blog.naver.com/MyBlog.naver');
 const identity=await inject(()=>{
  const urls=[location.href,...[...document.querySelectorAll('iframe')].map(f=>f.src)];
  for(const raw of urls){try{const u=new URL(raw);if(!['blog.naver.com','m.blog.naver.com'].includes(u.hostname))continue;const id=u.searchParams.get('blogId')||u.pathname.split('/').filter(Boolean)[0];if(/^[A-Za-z0-9_-]{1,64}$/.test(id??'')&&!['myblog','postlist','postview'].includes(id.toLowerCase()))return id;}catch{}}
  return null;
 });
 if(!identity)throw Error('로그인 또는 내 블로그 주소를 확인하지 못했어요. 열린 네이버 화면을 직접 확인하세요. 반복 로그인하지 마세요.');
 if(job.payload.account&&identity.toLowerCase()!==job.payload.account.toLowerCase())throw Error('웹앱에서 선택한 블로그와 현재 네이버 로그인 블로그가 달라요. 계정을 확인해 주세요.');
 return identity;
}
async function search(){
 const mine=await identify(),found=new Map();
 for(const keyword of job.payload.keywords){
  if(stopped)break;
  await open('https://section.blog.naver.com/Search/Post.naver?keyword='+encodeURIComponent(keyword));
  for(let p=1;p<=Math.min(5,job.payload.pages||1);p++){
   if(stopped)break;
   const items=await inject(async(keyword,currentPage)=>{
    const params=new URLSearchParams({countPerPage:'7',currentPage:String(currentPage),endDate:'',keyword,orderBy:'sim',startDate:'',type:'post'});
    const r=await fetch('/ajax/SearchList.naver?'+params,{credentials:'include'});if(!r.ok)throw Error('네이버 검색 오류 '+r.status);const t=await r.text();return JSON.parse(t.slice(t.indexOf('{'))).result?.searchList??[];
   },[keyword,p]);
   const strip=t=>String(t??'').replace(/<[^>]*>/g,'').slice(0,200);
   for(const item of items){const id=String(item.domainIdOrBlogId||item.blogId||'').trim();if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||id.toLowerCase()===mine.toLowerCase()||history[id.toLowerCase()]||found.has(id.toLowerCase()))continue;found.set(id.toLowerCase(),{blog_id:id,nick:strip(item.nickName),blog_name:strip(item.blogName),keyword});}
   if(!items.length)break;await sleep(1000);
  }
 }
 return {candidates:[...found.values()],message:`새 후보 ${found.size}명`};
}
async function apply(){
 const mine=await identify(),targets=job.payload.candidates;
 if(!Array.isArray(targets)||!targets.length||targets.length>20)throw Error('대상 수를 확인해 주세요.');
 if(!await ask(`로그인 블로그: ${mine}\n${targets.map(c=>c.blog_id).join(', ')}\n위 대상 최대 ${targets.length}명에게 신청합니다.\n문구: ${job.payload.message}\n간격 30~120초, 오늘 남은 한도 ${Math.max(0,100-todayCount())}명. 진행할까요?`))return {status:'cancelled',result:{message:'신청 전 확인에서 취소했습니다.'}};
 const results=progress;let status='done';
 for(let i=0;i<targets.length;i++){
  if(stopped){status='cancelled';break;}
  if(todayCount()>=100){log('오늘 신청 한도에 도달했습니다.');break;}
  const c=targets[i],key=c.blog_id.toLowerCase();
  if(key===mine.toLowerCase()||history[key]){results.push({blog_id:c.blog_id,status:'already',detail:'이전 전송 기록 또는 내 블로그라 제외'});continue;}
  try{
   await open('https://m.blog.naver.com/BuddyAddForm.naver?blogId='+encodeURIComponent(c.blog_id));
   const message=String(job.payload.message).replaceAll('{닉네임}',c.nick||c.blog_id);
   const prepared=await inject(formStep,['prepare',message]);
   if(!prepared.ok){const state=classify(prepared.text);results.push({blog_id:c.blog_id,status:state==='unconfirmed'?'error':state,detail:prepared.text.slice(0,300)});if(state==='already'||state==='refused')continue;status='error';break;}
   // 전송 직전에 중복 방지 기록을 저장. 결과 불명/창 종료 시 재전송하지 않음.
   if(stopped){status='cancelled';break;}
   history[key]={day:day(),status:'unconfirmed'};await saveHistory();
   const sent=await inject(formStep,['submit',message]);
   if(!sent.ok){results.push({blog_id:c.blog_id,status:'unconfirmed',detail:sent.text});status='unconfirmed';break;}
   let result='unconfirmed',text='';
   for(let attempt=0;attempt<10;attempt++){
    await sleep(600);
    try{text=(await inject(readPage)).text;result=classify(text);if(result!=='unconfirmed')break;}catch{/* 이동 중이면 읽기만 다시 시도, 전송은 재시도하지 않음 */}
   }
   history[key].status=result;await saveHistory();results.push({blog_id:c.blog_id,status:result,detail:result==='unconfirmed'?'완료를 확인하지 못했어요. 네이버 화면을 직접 확인하세요.':text.slice(0,180)});
   log(`${i+1}/${targets.length} ${c.blog_id}: ${result}`);
   if(!['success','already','refused'].includes(result)){status=result==='unconfirmed'?'unconfirmed':'error';break;}
  }catch(e){status='unconfirmed';results.push({blog_id:c.blog_id,status:'unconfirmed',detail:e.message});break;}
  if(i<targets.length-1){const end=Date.now()+30000+Math.random()*90000;log('다음 신청까지 30~120초 간격을 지켜 기다립니다.');while(Date.now()<end&&!stopped)await sleep(300);}
 }
 return {status:stopped?'cancelled':status,result:{results,message:`오늘 누적 ${todayCount()}명 (다른 신청 입력 수 포함)`}};
}
async function collect(){
 const u=new URL(job.payload.url);if(u.protocol!=='https:'||!['blog.naver.com','m.blog.naver.com','creator-advisor.naver.com'].includes(u.hostname))throw Error('지원하는 네이버 주소가 아닙니다.');
 await open(u.href);
 if(!await ask('열린 네이버 화면에서 로그인·주제·날짜 선택을 마친 뒤 확인을 누르세요. 현재 보이는 글을 가져옵니다.'))return {status:'cancelled',result:{message:'자료 가져오기를 취소했습니다.'}};
 const data=await inject(readPage),actual=new URL(data.url);
 if(!['blog.naver.com','m.blog.naver.com','creator-advisor.naver.com'].includes(actual.hostname)||/계정\s*보호|자동입력 방지|CAPTCHA/i.test(data.text))throw Error('로그인·계정보호 화면에서는 자료를 보내지 않습니다.');
 if(!data.text.trim())throw Error('화면에서 글을 읽지 못했습니다.');
 if(!await ask(`웹앱으로 아래 자료를 보낼까요?\n${data.title}\n${data.text.slice(0,800)}\n(총 ${data.text.length}자)`))return {status:'cancelled',result:{message:'전송을 취소했습니다.'}};
 return {status:'done',result:data};
}
$('stop').onclick=()=>{stopped=true;log('중지 요청됨. 현재 전송은 다시 시도하지 않습니다.');};
$('naver').onclick=()=>chrome.tabs.create({url:'https://blog.naver.com/MyBlog.naver'});
$('start').onclick=async()=>{
 if(running)return;running=true;stopped=false;progress=[];$('start').disabled=true;
 try{
  const lock=await chrome.runtime.sendMessage({type:'seo-lock',tabId:(await chrome.tabs.getCurrent()).id});if(!lock?.ok)throw Error(lock?.error||'다른 실행창에서 작업 중입니다.');
  await flush();
  const stored=await chrome.storage.local.get(['seoHistory','seoBaseline']);history=stored.seoHistory??{};
  base=Math.max(Number($('baseline').value)||0,stored.seoBaseline?.day===day()?stored.seoBaseline.count:0);await chrome.storage.local.set({seoBaseline:{day:day(),count:base}});
  ({job}=await api({action:'claim'}));if(!job){log('대기 작업이 없어요. 웹앱에서 검색·신청을 요청해 주세요.');return;}
  log(`작업 수신: ${job.kind}`);
  heartbeat=setInterval(()=>api({action:'heartbeat',id:job.id,result:{results:progress}}).then(r=>{if(r.cancelled)stopped=true;}).catch(()=>{stopped=true;log('웹앱 연결이 끊겨 추가 신청을 중지합니다.');}),4000);
  let result;if(job.kind==='search')result={status:'done',result:await search()};else if(job.kind==='apply')result=await apply();else if(job.kind==='collect')result=await collect();else throw Error('알 수 없는 작업');
  await publish(stopped?'cancelled':result.status,result.result);log('결과를 웹앱으로 보냈어요.');
 }catch(e){log(e.message);if(job){try{const pending=await chrome.storage.local.get('seoPendingResult');if(!pending.seoPendingResult)await publish('error',{error:e.message});else log('기존 결과를 PC에 보관했습니다. 다음 연결 때 결과만 다시 전송합니다.');}catch{log('결과 전달 실패. 연결 후 다시 실행을 누르면 저장된 결과만 전송합니다. 신청은 재시도하지 않아요.');}}}
 finally{clearInterval(heartbeat);job=null;running=false;$('start').disabled=false;await chrome.runtime.sendMessage({type:'seo-unlock',tabId:(await chrome.tabs.getCurrent()).id}).catch(()=>{});}
};
chrome.storage.local.get('seoBaseline').then(r=>{if(r.seoBaseline?.day===day())$('baseline').value=r.seoBaseline.count;});
