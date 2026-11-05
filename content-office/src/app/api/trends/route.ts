import { body, fail, handle, ok } from "@/lib/api";
import { addScrap, listScraps, removeScrap, trendTab } from "@/lib/trends";

/** ?c=카테고리ID&refresh=1 · ?scraps=1 */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    if (sp.get("scraps") === "1") return ok(await listScraps());
    return ok(await trendTab(sp.get("c") ?? "", sp.get("refresh") === "1"));
  });
}

/** 스크랩 추가·삭제 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action: "scrap" | "unscrap"; item_id: string; title?: string; channel?: string; thumbnail?: string; url?: string; views?: number; category?: string }>(req);
    try {
      if (b.action === "unscrap") await removeScrap(String(b.item_id ?? ""));
      else await addScrap({ item_id: String(b.item_id ?? ""), title: String(b.title ?? ""), channel: b.channel, thumbnail: b.thumbnail, url: String(b.url ?? ""), views: b.views ?? null, category: b.category });
    } catch (e) {
      return fail((e as Error).message);
    }
    return ok({ ok: true, scraps: await listScraps() });
  });
}
