import { body, fail, handle, ok } from "@/lib/api";
import { addCalendarEvent, deleteCalendarEvent, monthEvents } from "@/lib/calendar";

export async function GET(req: Request) {
  return handle(async () => {
    const m = new URL(req.url).searchParams.get("m") ?? "";
    if (!/^\d{4}-\d{2}$/.test(m)) return fail("월을 확인해 주세요 (YYYY-MM).");
    return ok(await monthEvents(m));
  });
}

/** 행사 직접 추가 { title, start, end, kind: official|irregular, link, memo } · 지우기 { remove: id } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ title?: string; start?: string; end?: string; kind?: string; link?: string; memo?: string; remove?: string }>(req);
    try {
      if (b.remove) {
        await deleteCalendarEvent(String(b.remove));
        return ok({ ok: true });
      }
      return ok({ id: await addCalendarEvent(b) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
