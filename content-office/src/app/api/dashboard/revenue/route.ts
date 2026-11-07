import { body, fail, handle, ok } from "@/lib/api";
import { getRevenue, saveDailyRevenue, saveGoal, saveRevenue, type MonthRevenue, type RevenueChannel } from "@/lib/dashboard";

export async function GET() {
  return handle(async () => ok(await getRevenue()));
}

/** 이번 달 수익 직접 입력 (쿠팡파트너스·애드포스트·애드센스 정산 화면 숫자) */
export async function PUT(req: Request) {
  return handle(async () => {
    const b = await body<{ month: string; data?: MonthRevenue; goal?: number }>(req);
    try {
      if (typeof b.goal === "number") return ok(await saveGoal(String(b.month ?? ""), b.goal));
      return ok(await saveRevenue(String(b.month ?? ""), b.data ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}

/** 날짜별 입력: { channel, days:[{date, krw}], base?:{krw, from, to} } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ channel?: string; days?: { date: string; krw: number | null }[]; base?: { krw: number; from: string; to: string } }>(req);
    try {
      return ok(await saveDailyRevenue(String(b.channel ?? "adpost") as RevenueChannel, { days: b.days, base: b.base }));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
