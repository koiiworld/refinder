import { fail, handle, ok, type Ctx } from "@/lib/api";
import { getConversion } from "@/lib/convert";

/** 결과 보기 · ?download=1 이면 .md 파일로 받기 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const c = await getConversion((await ctx.params).id);
    if (!c) return fail("찾을 수 없어요.", 404);
    if (new URL(req.url).searchParams.get("download")) {
      const name = `${c.filename.replace(/\.\w+$/, "") || "문서"}.md`;
      return new Response(c.markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
    }
    return ok(c);
  });
}

/** 지우기 → 휴지통 (30일 뒤 자동 완전 삭제) */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { snapToTrash } = await import("@/lib/trash-snap");
    await snapToTrash("convert", (await ctx.params).id);
    return ok({ ok: true, trashed: true });
  });
}
