import { body, fail, handle, ok } from "@/lib/api";
import { importMusic } from "@/lib/music-search";

/** 고른 음원 가져오기 { id } → { videoId, credit } (영상공장 저장소에 저장) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ id?: string }>(req);
    try {
      return ok(await importMusic(String(b.id ?? "")));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
