import {body,fail,handle,ok} from '@/lib/api';
import {listCommonBlogRules,saveCommonBlogRules} from '@/lib/blog-common-rules';
export async function GET(){return handle(async()=>ok(await listCommonBlogRules()));}
export async function POST(req:Request){return handle(async()=>{try{return ok(await saveCommonBlogRules(await body(req)));}catch(e){return fail((e as Error).message);}});}
