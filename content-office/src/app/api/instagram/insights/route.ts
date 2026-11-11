import { fail, handle, ok } from "@/lib/api";
import { igDashboard, syncInstagram } from "@/lib/ig-api";

/** 📊 인스타 대시보드: 저장된 인사이트 (API 호출 없음) */
export async function GET() {
  return handle(async () => ok(await igDashboard()));
}

/** ↻ 지금 새로고침: 인스타 API에서 받아 오늘 날짜로 저장 (무료, 읽기만) */
export async function POST() {
  return handle(async () => {
    try {
      await syncInstagram();
      return ok(await igDashboard());
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
