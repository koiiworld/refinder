import { handle, ok } from "@/lib/api";
import { workItems } from "@/lib/work";

export async function GET() {
  return handle(async () => ok(await workItems()));
}
