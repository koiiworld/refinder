import { body, fail, handle, ok } from "@/lib/api";
import { createSeries, listSeries } from "@/lib/series";

export async function GET() {
  return handle(async () => ok(await listSeries()));
}

/** { hero, friend, theme, style, count } → N화 한 번에 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ hero?: string; friend?: string; theme?: string; style?: string; count?: number }>(req);
    try {
      return ok({ id: await createSeries({ hero: String(b.hero ?? ""), friend: b.friend, theme: String(b.theme ?? ""), style: b.style, count: b.count }) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
