import {body,fail,handle,ok,type Ctx} from '@/lib/api';
import {estimateSteps} from '@/lib/estimate';
import {rewriteCarouselText,type CarouselTextInput} from '@/lib/carousel-text';
export async function GET(req:Request){return handle(async()=>ok(await estimateSteps([new URL(req.url).searchParams.get('kind')==='slide'?'carousel_slide':'carousel_caption'])));}
export async function POST(req:Request,ctx:Ctx){return handle(async()=>{const b=await body<CarouselTextInput&{confirm?:boolean}>(req);if(b.confirm!==true)return fail('모델과 예상 비용을 확인해 주세요.');try{return ok(await rewriteCarouselText((await ctx.params).id,b));}catch(e){return fail((e as Error).message,502);}});}
