import { body, fail, handle, ok } from "@/lib/api";
import { learningTaskAction, listLearningTasks } from "@/lib/learning-tasks";
export async function GET() { return handle(async()=>ok(await listLearningTasks())); }
export async function POST(req:Request) { return handle(async()=>{const b=await body(req);try{return ok(await learningTaskAction(b.ids,b.action,b.done));}catch(e){return fail((e as Error).message);} }); }
