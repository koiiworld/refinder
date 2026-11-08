import type {Slide} from './carousel';
/** 이미 만든 장별 문구를 편집 가능한 슬라이드로 옮김. AI 재생성 없음. */
export function parseRepurposeCards(raw:string):Slide[]{
 const groups:{headline:string;body:string[]}[]=[];let current:typeof groups[number]|null=null;
 for(const original of raw.replace(/\r/g,'').split('\n')){
  const line=original.trim().replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'');
  const marker=line.match(/^(\d{1,2})\s*장\s*(?:[:：.\-]\s*)?(.*)$/);
  if(marker){current={headline:marker[2].replace(/^(?:제목|표지)\s*[:：]\s*/,''),body:[]};groups.push(current);continue;}
  if(!current||!line||/^[-─━]{3,}$/.test(line))continue;
  const title=line.match(/^(?:제목|타이틀|표지)\s*[:：]\s*(.*)$/);if(title){current.headline=title[1];continue;}
  const body=line.match(/^(?:본문|내용)\s*[:：]\s*(.*)$/);if(body){current.body.push(body[1]);continue;}
  if(!current.headline&&!current.body.length)current.headline=line;else current.body.push(line);
 }
 if(groups.length<2||groups.length>15)throw new Error('장 번호(1장, 2장…)가 있는 카드뉴스 2~15장이 필요해요. 원문 문구를 확인해 주세요.');
 return groups.map((g,i)=>({kind:i===0?'cover':i===groups.length-1?'cta':'content',headline:g.headline||`${i+1}장`,body:g.body.join('\n'),image:null}));
}
