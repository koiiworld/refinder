import { body, fail, handle, ok } from "@/lib/api";
import { createRoutine, listRoutines, listRuns, routineTick, type Routine } from "@/lib/routines";
import { kstToday } from "@/lib/todos";

export async function GET() {
  return handle(async () => ok({ routines: await listRoutines(), today: await listRuns({ from: kstToday(), to: kstToday() }) }));
}

/** 새 루틴 · { action: "tick" } 지금 바로 한 번 처리 (실행 만들기·마감·발송) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<Partial<Routine> & { action?: string }>(req);
    try {
      if (b.action === "tick") {
        await routineTick();
        return ok({ ok: true });
      }
      return ok(await createRoutine(b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
