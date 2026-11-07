import { body, fail, handle, ok } from "@/lib/api";
import { createEdit, listEdits } from "@/lib/edit";

export async function GET() {
  return handle(async () => ok(await listEdits()));
}
/** { videoIds, title } 새 편집 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ videoIds?: string[]; title?: string }>(req);
    try {
      return ok({ id: await createEdit(Array.isArray(b.videoIds) ? b.videoIds.map(String) : [], b.title) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
