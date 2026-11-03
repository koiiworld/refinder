import { q } from "@/lib/db";
import { naverConnected, naverTrend } from "@/lib/research";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () =>
    ok({
      naverConnected: naverConnected(),
      snapshots: await q("SELECT * FROM research_snapshots ORDER BY collected_at DESC LIMIT 20"),
    }),
  );
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{
      blogId?: string;
      keywords: string[];
      startDate: string;
      endDate: string;
      timeUnit?: "date" | "week" | "month";
    }>(req);
    try {
      return ok(
        await naverTrend({
          blogId: b.blogId || null,
          keywords: b.keywords ?? [],
          startDate: b.startDate,
          endDate: b.endDate,
          timeUnit: b.timeUnit ?? "week",
        }),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
