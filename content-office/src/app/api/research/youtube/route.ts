import { searchVideos, trending, youtubeConnected } from "@/lib/youtube";
import { fail, handle, ok } from "@/lib/api";

/** ?mode=trending&category=26  또는  ?q=키워드 */
export async function GET(req: Request) {
  return handle(async () => {
    if (!youtubeConnected()) return fail("YouTube API 키(YOUTUBE_API_KEY)가 설정되지 않았습니다.", 400);
    const sp = new URL(req.url).searchParams;
    try {
      const qy = sp.get("q")?.trim();
      return ok(qy ? await searchVideos(qy) : await trending(sp.get("category") ?? ""));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
