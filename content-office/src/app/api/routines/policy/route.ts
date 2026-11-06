import { body, handle, ok } from "@/lib/api";
import { getPolicy, notificationLog, savePolicy, type Policy } from "@/lib/routines";

export async function GET() {
  return handle(async () => ok({ policy: await getPolicy(), log: await notificationLog(50) }));
}
export async function PUT(req: Request) {
  return handle(async () => ok(await savePolicy(await body<Partial<Policy>>(req))));
}
