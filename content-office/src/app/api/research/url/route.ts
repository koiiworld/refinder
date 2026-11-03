import { fetchUrlMeta } from "@/lib/research";
import { body, fail, handle, ok } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ url: string; note?: string }>(req);
    try {
      return ok(await fetchUrlMeta(b.url ?? "", b.note ?? ""));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
