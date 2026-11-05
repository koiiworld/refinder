import { body, fail, handle, ok } from "@/lib/api";
import { getRevenue, saveRevenue, type MonthRevenue } from "@/lib/dashboard";

export async function GET() {
  return handle(async () => ok(await getRevenue()));
}

/** 이번 달 수익 직접 입력 (쿠팡파트너스·애드포스트·애드센스 정산 화면 숫자) */
export async function PUT(req: Request) {
  return handle(async () => {
    const b = await body<{ month: string; data: MonthRevenue }>(req);
    try {
      return ok(await saveRevenue(String(b.month ?? ""), b.data ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
