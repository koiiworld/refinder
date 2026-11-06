import { body, fail, handle, ok } from "@/lib/api";
import { setPosted } from "@/lib/work";

/** { type: carousel|studio|video, id, posted: true/false } — 실제로 올렸는지 직접 표시 (자동 게시 아님) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ type?: string; id?: string; posted?: boolean }>(req);
    try {
      return ok(await setPosted(String(b.type ?? ""), String(b.id ?? ""), b.posted !== false));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
