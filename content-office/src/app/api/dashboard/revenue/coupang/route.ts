import { fail, handle, ok } from "@/lib/api";
import { syncCoupang } from "@/lib/coupang";

/** 쿠팡파트너스 이번 달 수익 지금 불러오기 */
export async function POST() {
  return handle(async () => {
    try {
      return ok(await syncCoupang(true));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
