import { body, handle, ok } from "@/lib/api";
import { getFeatureOff, saveFeatureOff } from "@/lib/features";

export async function GET() {
  return handle(async () => ok({ off: await getFeatureOff() }));
}

/** { off: ['g:insta', '/diagnose'] } — 끈 기능 전체 목록으로 저장 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ off?: string[] }>(req);
    return ok({ off: await saveFeatureOff(b.off) });
  });
}
