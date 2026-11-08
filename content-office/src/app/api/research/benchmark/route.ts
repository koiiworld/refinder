import { body, fail, handle, ok } from "@/lib/api";
import { analyzePopular, lastBenchmark,startBenchmarkPost } from "@/lib/benchmark";
import { AiError } from "@/lib/ai/providers";

export async function GET(req: Request) {
  return handle(async () => ok(await lastBenchmark(new URL(req.url).searchParams.get("blogId") ?? "")));
}

/** 인기 글 주소(최대 5개) 분석 → 내 블로그 적용 제안 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?:string;blogId: string; urls: string[] | string;snapshotId?:string;index?:number;title?:string }>(req);
    const urls = Array.isArray(b.urls) ? b.urls : String(b.urls ?? "").split(/[\s,]+/);
    try {
      if(b.action==="start")return ok(await startBenchmarkPost(String(b.blogId??""),String(b.snapshotId??""),Number(b.index),String(b.title??"")),201);
      return ok(await analyzePopular(String(b.blogId ?? ""), urls));
    } catch (e) {
      if (e instanceof AiError) return fail(e.message, 502);
      return fail((e as Error).message);
    }
  });
}
