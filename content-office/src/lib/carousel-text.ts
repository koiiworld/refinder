import 'server-only';
import {getCarousel,type Slide} from './carousel';
import {getBlogForAi} from './repo';
import {commonRulesText} from './blog-rule-types';
import {extractJson,runStep} from './ai/run';
import {HOOK_RULES} from './hook-rules';
import {captionStyleRule} from './caption-styles';
export type CarouselTextInput={kind:'caption'|'slide';index?:number;slides:Slide[];caption?:string;hashtags?:string[];feedback?:string;captionStyle?:string};
export async function rewriteCarouselText(id:string,input:CarouselTextInput){
 const carousel=await getCarousel(id);if(!carousel)throw new Error('캐러셀을 찾을 수 없어요.');
 if(!['caption','slide'].includes(input.kind)||!Array.isArray(input.slides)||!input.slides.length||input.slides.length>15)throw new Error('다시 쓸 카드 내용을 확인해 주세요.');
 const slides=input.slides.map(s=>({kind:s.kind,headline:String(s.headline??'').slice(0,300),body:String(s.body??'').slice(0,1800)}));
 if(input.kind==='slide'&&(!Number.isInteger(input.index)||!slides[input.index!]))throw new Error('다시 쓸 카드를 선택해 주세요.');
 const blog=carousel.blog_id?await getBlogForAi(carousel.blog_id):null;
 const system=`당신은 캐러셀 문구와 인스타그램 검색 관련 태그를 작성하는 한국어 편집자입니다. JSON 객체 하나만 출력하세요.\n${HOOK_RULES}`;
 const prompt=`[현재 캐러셀 제목] ${carousel.title}\n[현재 카드 내용 — 원본보다 우선]\n${slides.map((s,i)=>`${i+1}장 (${s.kind})\n제목: ${s.headline}\n본문: ${s.body}`).join('\n\n')}\n[참고 원문] ${(carousel.style?.sourceText??'').slice(0,5000)}\n${blog?commonRulesText(blog,['keywords','title','body']):''}\n[사용자 수정 의견 — 반드시 반영] ${String(input.feedback??'').slice(0,2000)||'내용을 정확하게 유지하며 자연스럽고 구체적으로 다시 써 주세요.'}\n`+(input.kind==='caption'?`[기존 캡션] ${String(input.caption??'').slice(0,2200)}\n[기존 해시태그] ${JSON.stringify(input.hashtags??[])}\n${captionStyleRule(input.captionStyle)?`[캡션 스타일 — 반드시 따르기] ${captionStyleRule(input.captionStyle)}\n기존 캡션이 비어 있으면 카드 내용으로 새로 쓰세요. 과장 없이 카드·원문에 있는 사실만 쓰세요.`:'캡션 첫 줄은 과장 없이 이 글에서 얻을 정보를 구체적으로, 본문은 3~5줄로 쓰세요.'} 해시태그는 글의 실제 주제·메인 검색어·구체적인 재료/대상/방법에 맞는 3~5개를 추천하세요. 검색량·노출 순위·인기 여부를 측정했다고 주장하지 말고, 무관한 인기 태그·맞팔·좋아요 태그는 쓰지 마세요. 해시태그는 #과 띄어쓰기 없이, 중복 없이. 형식: {"caption":"", "hashtags":[""]}`:`${input.index!+1}장만 다시 쓰세요. 이 카드의 역할(${slides[input.index!].kind}), 핵심 사실·재료·수치를 유지하고 다른 카드와 중복을 줄이세요. 다른 카드·사진·장수는 바꾸지 마세요. 형식: {"headline":"제목", "body":"본문"}`);
 const res=await runStep({step:'carousel',purpose:input.kind==='caption'?'carousel-caption':'carousel-slide-text',blog,projectId:carousel.project_id,system,prompt,json:true,maxTokens:1600,retries:0,noFallback:true});
 const raw=extractJson<{caption?:string;hashtags?:string[];headline?:string;body?:string}>(res.text);
 if(input.kind==='caption'){
  const caption=String(raw.caption??'').trim().slice(0,2200),hashtags=[...new Set((Array.isArray(raw.hashtags)?raw.hashtags:[]).map(x=>String(x).replace(/[^\p{L}\p{N}_]/gu,'')).filter(Boolean))].slice(0,5);
  if(!caption||!hashtags.length)throw new Error('캡션·해시태그 응답이 불완전해요. 기존 내용은 유지돼요.');return {caption,hashtags};
 }
 const headline=String(raw.headline??'').trim().slice(0,300),body=String(raw.body??'').trim().slice(0,1800);if(!headline)throw new Error('새 카드 문구를 받지 못했어요. 기존 내용은 유지돼요.');return {headline,body};
}
