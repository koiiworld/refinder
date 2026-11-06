import { q } from "@/lib/db";
import { handle } from "@/lib/api";

/** 전체 백업 내보내기 (API 키는 DB에 저장하지 않으므로 포함되지 않음) */
export async function GET(req: Request) {
  return handle(async () => {
    const scope = new URL(req.url).searchParams.get("scope") ?? "all";
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: "ai-content-office", scope };
    data.blogs = await q("SELECT * FROM blogs ORDER BY created_at");
    data.blog_samples = await q("SELECT * FROM blog_samples ORDER BY created_at");
    data.settings = await q("SELECT * FROM settings WHERE key <> 'api_keys'"); // 앱에 넣은 API 키는 백업에서 뺌
    if (scope === "all") {
      for (const t of ["ideas", "research_snapshots", "projects", "documents", "versions", "approvals", "reviews", "jobs", "ai_runs", "events"]) {
        data[t] = await q(`SELECT * FROM ${t}`);
      }
    }
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="content-office-${scope}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  });
}
