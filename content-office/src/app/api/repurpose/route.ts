import { body, fail, handle, ok } from "@/lib/api";
import { listRepurpose, loadSource, repurpose } from "@/lib/repurpose";

export async function GET() {
  return handle(async () => ok(await listRepurpose()));
}

/** action: load {postId|url} → 글 미리보기 · make {id?, title, text, blogId, postId, url, channels} → 초안 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?: string; id?: string; postId?: string; url?: string; title?: string; text?: string; blogId?: string | null; channels?: string[] }>(req);
    try {
      if (b.action === "load") return ok(await loadSource({ postId: b.postId, url: b.url }));
      return ok(await repurpose({ id: b.id, title: String(b.title ?? ""), text: String(b.text ?? ""), blogId: b.blogId, postId: b.postId, url: b.url, channels: Array.isArray(b.channels) ? b.channels.map(String) : [] }));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
