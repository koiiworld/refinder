import { body, fail, handle, ok } from "@/lib/api";
import { addStudies, listStudies } from "@/lib/reel-study";

export async function GET() {
  return handle(async () => ok(await listStudies()));
}

/** { urls: [...], mine } 릴스 링크 넣기 (맥에서 받아쓰기·장면 사진 → 무료 Gemini 분석) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ urls?: string[]; mine?: boolean }>(req);
    try {
      return ok({ ids: await addStudies(Array.isArray(b.urls) ? b.urls.map(String) : [], !!b.mine) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
