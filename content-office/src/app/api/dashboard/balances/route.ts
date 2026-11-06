import { body, fail, handle, ok } from "@/lib/api";
import { addTopUp, balances, removeTopUp } from "@/lib/balances";

export async function GET() {
  return handle(async () => ok(await balances()));
}

/** 충전 기록 추가: { provider, usd, at?, note? } · 지우기: { provider, remove: index } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ provider?: string; usd?: number; at?: string; note?: string; remove?: number }>(req);
    try {
      if (typeof b.remove === "number") await removeTopUp(String(b.provider), b.remove);
      else await addTopUp(String(b.provider), Number(b.usd), b.at, b.note);
      return ok(await balances());
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
