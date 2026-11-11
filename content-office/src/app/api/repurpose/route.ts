import { body, fail, handle, ok } from "@/lib/api";
import { listRepurpose, loadSource, repurpose } from "@/lib/repurpose";
import { estimateSteps } from "@/lib/estimate";

export async function GET() {
  return handle(async () => ok(await listRepurpose()));
}

/** action: load {postId|url} → 글 미리보기 · make {id?, title, text, blogId, postId, url, channels} → 초안 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ action?: string; id?: string; postId?: string; url?: string; title?: string; text?: string; blogId?: string | null; channels?: string[]; confirm?: boolean }>(req);
    try {
      if (b.action === "load") return ok(await loadSource({ postId: b.postId, url: b.url }));
      if (b.action === "estimate") return ok(await estimateSteps(["repurpose"]));
      if (b.confirm !== true) return fail("모델과 예상 비용을 확인해 주세요.");
      return ok(await repurpose({ id: b.id, title: String(b.title ?? ""), text: String(b.text ?? ""), blogId: b.blogId, postId: b.postId, url: b.url, channels: Array.isArray(b.channels) ? b.channels.map(String) : [] }));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
