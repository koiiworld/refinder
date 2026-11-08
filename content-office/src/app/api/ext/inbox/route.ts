import { body, fail, handle, ok } from "@/lib/api";
import { addInbox } from "@/lib/inbox";

/** 🧩 확장 프로그램: ChatGPT·제미나이에서 보낸 글·사진 받기 {projectId, kind, html?, text?, image?(data URL), source} */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ projectId?: string; kind?: string; html?: string; text?: string; image?: string; source?: { site?: string; url?: string; title?: string } }>(req);
    if (!b.projectId) return fail("보낼 글을 먼저 골라 주세요.");
    try {
      return ok({ id: await addInbox(String(b.projectId), b) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
