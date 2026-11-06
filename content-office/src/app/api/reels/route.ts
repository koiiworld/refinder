import { body, fail, handle, ok } from "@/lib/api";
import { createReel, listReels } from "@/lib/reels";

export async function GET() {
  return handle(async () => ok(await listReels()));
}

/** { videoId } 영상공장 영상으로 릴스 편집 시작 (맥이 받아쓰기로 초안) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ videoId?: string }>(req);
    try {
      return ok({ id: await createReel(String(b.videoId ?? "")) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
