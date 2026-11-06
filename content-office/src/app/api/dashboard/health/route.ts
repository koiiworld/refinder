import { body, handle, ok } from "@/lib/api";
import { clearProblem, healthProblems } from "@/lib/health";

export async function GET() {
  return handle(async () => ok(await healthProblems()));
}

/** 점검 알림 닫기 (고쳤다고 표시) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ id?: string }>(req);
    await clearProblem(String(b.id ?? ""));
    return ok(await healthProblems());
  });
}
