import { handle, ok } from "@/lib/api";
import { collectVisits, visitSummary } from "@/lib/visits";

/** 블로그 방문자 수 (?refresh=1 이면 지금 바로 다시 수집) */
export async function GET(req: Request) {
  return handle(async () => {
    if (new URL(req.url).searchParams.get("refresh") === "1") await collectVisits(true);
    return ok(await visitSummary());
  });
}
