// 실제 화면 문구를 보수적으로 판정. 확인 질문·단순 URL 이동은 성공으로 보지 않음.
export function classify(text){
 if(/계정\s*보호|보호조치|비정상적인 접근|자동입력 방지|캡차|CAPTCHA/i.test(text))return 'error';
 if(/(?:하루|100명|신청).{0,70}(?:초과|한도에 도달|더 이상 신청)/.test(text))return 'limit';
 if(/이미 (?:서로)?이웃|이미 신청|신청\s*중/.test(text))return 'already';
 if(/그룹.{0,40}(?:가득|최대.{0,15}(?:초과|도달))/.test(text))return 'group_full';
 if(/서로이웃 신청을 받지|신청할 수 없|차단/.test(text))return 'refused';
 if(/(?:서로이웃|이웃)\s*신청(?:이|을)?\s*(?:완료되었습니다|완료됐습니다|완료했습니다)|(?:서로이웃|이웃)(?:을|이)?\s*(?:신청했습니다|신청하였습니다|신청되었습니다)/.test(text))return 'success';
 return 'unconfirmed';
}
// chrome.scripting에 전달하므로 외부 변수/함수에 의존하지 않음.
export function formStep(mode,message=''){
 const text=document.body?.innerText??'';
 if(location.hostname!=='m.blog.naver.com'||!location.pathname.endsWith('/BuddyAddForm.naver'))return {ok:false,text:'로그인 또는 신청 화면 확인 필요'};
 if(/계정\s*보호|보호조치|자동입력 방지|CAPTCHA|캡차|비정상적인 접근/i.test(text))return {ok:false,text};
 const radio=document.querySelector('#bothBuddyRadio');
 const box=document.querySelector('textarea#buddyAddMsg,textarea[name="message"],textarea');
 const visible=e=>e&&e.getClientRects().length&&!e.disabled;
 const button=[...document.querySelectorAll('button,a,input[type="submit"]')].find(e=>visible(e)&&/^(확인|신청|신청하기)$/.test((e.innerText||e.value||'').trim()));
 if(!radio||radio.disabled||!box||box.disabled||box.readOnly||!visible(box)||!button)return {ok:false,text:'신청 폼을 확인하지 못했습니다. '+text.slice(0,500)};
 if(mode==='prepare'){
  radio.click();
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(box,message);box.dispatchEvent(new Event('input',{bubbles:true}));box.dispatchEvent(new Event('change',{bubbles:true}));
  return {ok:radio.checked&&box.value===message,text};
 }
 if(mode==='submit'&&radio.checked&&box.value===message){button.click();return {ok:true};}
 return {ok:false,text:'선택 또는 문구가 달라 전송하지 않았습니다.'};
}
export function readPage(){
 const frames=[document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument;}catch{return null;}}).filter(Boolean)];
 const texts=frames.map(d=>(d.querySelector('.se-main-container,#postViewArea,.post_ct')??d.body)?.innerText??'');
 return {url:location.href,title:document.title,text:texts.sort((a,b)=>b.length-a.length)[0]?.slice(0,100000)??''};
}
