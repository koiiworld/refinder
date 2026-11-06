import { body, fail, handle, ok, type Ctx } from "@/lib/api";
import { completeRun, getRoutine, getRun, saveCapture, setItem, snooze } from "@/lib/routines";

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const run = await getRun((await ctx.params).id);
    return run ? ok({ run, routine: await getRoutine(run.routine_id) }) : fail("찾을 수 없어요.", 404);
  });
}

/** JSON { action: item {itemId, done} | complete | snooze } · 폼 { itemId, file } 캡처 등록 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = (await ctx.params).id;
    try {
      if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
        const form = await req.formData();
        const itemId = String(form.get("itemId") ?? "");
        const file = form.get("file");
        if (!file || typeof file === "string") return fail("캡처 사진을 골라 주세요.");
        const run = await getRun(id);
        const r = run ? await getRoutine(run.routine_id) : null;
        const item = r?.checklist.find((c) => c.id === itemId);
        if (!run || !r || !item) return fail("항목을 찾을 수 없어요.");
        const data = Buffer.from(await file.arrayBuffer());
        const img = await saveCapture(data, file.type || "image/png", `${r.name} · ${item.label} · ${run.base_date}`);
        let note = "";
        // 조회수 순위 캡처: AI가 글 제목·조회수를 읽어 그날 기록으로 저장 (대시보드 인기 글 TOP 10과 같은 기록)
        if (item.kind === "views" && r.blog_id) {
          const { saveViewsFromCapture } = await import("@/lib/top-posts");
          const v = await saveViewsFromCapture(r.blog_id, [`data:${file.type || "image/png"};base64,${data.toString("base64")}`], "day");
          note = `${v.date} · ${v.items.length}개 글 저장`;
        }
        return ok({ run: await setItem(id, itemId, { done: true, img, ...(note ? { note } : {}) }) });
      }
      const b = await body<{ action?: string; itemId?: string; done?: boolean }>(req);
      if (b.action === "item") return ok({ run: await setItem(id, String(b.itemId ?? ""), { done: !!b.done, ...(b.done ? {} : { img: null }) }) });
      if (b.action === "complete") return ok({ ...(await completeRun(id)), run: await getRun(id) });
      if (b.action === "snooze") return ok({ snoozed: await snooze(id, 30) });
      return fail("알 수 없는 작업이에요.");
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
