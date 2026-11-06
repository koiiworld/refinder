import { body, fail, handle, ok } from "@/lib/api";
import { addVideoLink, listVideos } from "@/lib/videos";
import { storageKind } from "@/lib/video-store";

export async function GET() {
  return handle(async () => ok({ videos: await listVideos(), storage: storageKind() }));
}

/** 링크 넣기 → 받기 시작 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ url?: string; removeSubs?: boolean }>(req);
    try {
      return ok({ id: await addVideoLink(String(b.url ?? ""), b.removeSubs !== false) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
