import {body,fail,handle,ok} from '@/lib/api';
import {getBlog} from '@/lib/repo';
import {recentPosts} from '@/lib/blog-posts';
export async function POST(req:Request){return handle(async()=>{const b=await body<{blogId?:string}>(req);const blog=b.blogId?await getBlog(b.blogId):null;if(!blog)return fail('업데이트할 블로그를 선택해 주세요.');try{const posts=await recentPosts(blog,30,{force:true,strict:true});return ok({blogId:blog.id,count:posts.length,at:new Date().toISOString()});}catch(e){return fail((e as Error).message,502);}});}
