import { addCustomEvent } from "@/lib/marketing";
import { body, handle, ok } from "@/lib/api";

/** 직접 이벤트 추가 (예: 블로그 기념일, 브랜드 세일, 지역 축제) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string; name: string; start: string; end?: string; leadDays?: number; keywords?: string[]; note?: string }>(req);
    return ok({ id: await addCustomEvent(b) }, 201);
  });
}
