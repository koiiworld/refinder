import {body,fail,handle,ok} from '@/lib/api';
import {estimateSteps} from '@/lib/estimate';
import {rewriteStudioIdea} from '@/lib/studio';
export async function GET(){return handle(async()=>ok(await estimateSteps(['studio_rewrite'])));}
export async function POST(req:Request){return handle(async()=>{const b=await body<{confirm?:boolean;subjectMode?:string;prompt?:string;feedback?:string;seconds?:number;style?:string}>(req);if(b.confirm!==true)return fail('모델과 예상 비용을 확인한 뒤 다시 생성을 눌러 주세요.');try{return ok(await rewriteStudioIdea({prompt:String(b.prompt??''),subjectMode:b.subjectMode,feedback:b.feedback,seconds:b.seconds,style:b.style}));}catch(e){return fail((e as Error).message,502);}});}
