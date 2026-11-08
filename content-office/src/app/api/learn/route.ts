import { RemoteReadLimited } from "@/lib/remote-read-limit";
import { body, fail, handle, ok } from "@/lib/api";
import { addLearning, learningEstimate, listLearning } from "@/lib/learning";
export async function GET() { return handle(async()=>ok({ items:await listLearning(), estimate:await learningEstimate() })); }
export async function POST(req: Request) {
  return handle(async()=>{ try { return ok(await addLearning(await body(req)),201); } catch(e) { return fail((e as Error).message,e instanceof RemoteReadLimited?429:400,e instanceof RemoteReadLimited?{retryAt:e.retryAt}:{}); } });
}
