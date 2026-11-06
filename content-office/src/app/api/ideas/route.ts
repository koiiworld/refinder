import { body, fail, handle, ok } from "@/lib/api";
import { createIdea, listIdeasNotes } from "@/lib/ideas";

export async function GET(req: Request) {
  return handle(async () => ok(await listIdeasNotes(new URL(req.url).searchParams.get("q") ?? "")));
}

/** 아이디어 저장 (AI 호출 없음) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ memo?: string; blog_id?: string | null; link?: string; source?: string }>(req);
    try {
      return ok(await createIdea(b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
