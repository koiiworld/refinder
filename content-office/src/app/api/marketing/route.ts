import { eventsForYear, listSeasonKeywords } from "@/lib/marketing";
import { handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const year = Number(sp.get("year")) || new Date().getFullYear();
    const blogId = sp.get("blogId");
    return ok({
      year,
      events: await eventsForYear(year, blogId),
      keywords: blogId ? await listSeasonKeywords(blogId, year) : [],
    });
  });
}
