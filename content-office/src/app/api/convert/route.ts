import { fail, handle, ok } from "@/lib/api";
import { createConversion, listConversions } from "@/lib/convert";

export async function GET() {
  return handle(async () => ok(await listConversions()));
}

/** 파일 올리기 (폼 'file', 여러 개 가능) → 맥에서 마크다운으로 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData().catch(() => null);
    const files = (form?.getAll("file") ?? []).filter((f): f is File => typeof f !== "string").slice(0, 10);
    if (!files.length) return fail("바꿀 파일을 골라 주세요.");
    try {
      const ids: string[] = [];
      for (const f of files) ids.push(await createConversion(f.name, Buffer.from(await f.arrayBuffer())));
      return ok({ ids });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
