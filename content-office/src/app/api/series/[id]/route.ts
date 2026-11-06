import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { continueSeries, deleteSeries, editEpisode, getSeries, queueEpisodes, setCharacters } from "@/lib/series";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const s = await getSeries((await ctx.params).id);
    return s ? ok(s) : fail("찾을 수 없어요.", 404);
  });
}

/** action: continue {count} · edit {n, request} · characters {text} · queue {ns?} */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    const b = await body<{ action?: string; count?: number; n?: number; request?: string; text?: string; ns?: number[] }>(req);
    try {
      if (b.action === "continue") return ok(await continueSeries(id, Number(b.count) || 5));
      if (b.action === "edit") return ok(await editEpisode(id, Number(b.n), String(b.request ?? "")));
      if (b.action === "characters") return ok(await setCharacters(id, String(b.text ?? "")));
      if (b.action === "queue") return ok({ queued: await queueEpisodes(id, Array.isArray(b.ns) ? b.ns.map(Number) : undefined), series: await getSeries(id) });
      return fail("알 수 없는 작업이에요.");
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    await deleteSeries((await ctx.params).id);
    return ok({ ok: true });
  });
}
