import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { deleteInbox, getInboxItem, listInbox, markUsed } from "@/lib/inbox";
import { setImage } from "@/lib/workflow";

/** 📥 이 글로 받은 내용 */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => ok({ items: await listInbox((await ctx.params).id) }));
}

/** action: used {itemId, how} (편집기에 넣은 뒤 기록) · slot {itemId, slot} (사진을 N번 자리에) · delete {itemId} */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; itemId?: string; how?: string; slot?: number }>(req);
    const it = await getInboxItem(String(b.itemId ?? ""));
    if (!it || it.project_id !== id) return fail("받은 내용을 찾을 수 없어요.");
    try {
      if (b.action === "used") await markUsed(it.id, String(b.how ?? "본문에 넣음").slice(0, 60));
      else if (b.action === "slot") {
        if (it.kind !== "image") return fail("사진만 이미지 자리에 쓸 수 있어요.");
        await setImage(id, Number(b.slot), { url: it.image_url, inserted: false, mediaJobId: null, model: `extension:${it.source?.site ?? ""}` });
        await markUsed(it.id, `이미지 ${Number(b.slot) + 1}번 자리에 씀`);
      } else if (b.action === "delete") await deleteInbox(it.id);
      else return fail("알 수 없는 작업이에요.");
      return ok({ items: await listInbox(id) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
