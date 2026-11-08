import { addEvent, createVersion, getDocument, getProject } from "@/lib/repo";
import { q1 } from "@/lib/db";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

/**
 * 📋 붙여넣기 기록: ChatGPT·제미나이 등에서 복사해 온 글·사진을 본문에 붙여넣을 때마다
 * ① 붙여넣기 직전 원고를 버전으로 남기고(1분 안에 연달아 붙이면 한 번만) ② 진행 기록에 무엇을 붙였는지 남김
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ preview?: string; images?: number; chars?: number }>(req);
    if (!(await getProject(id))) return fail("프로젝트 없음", 404);
    const doc = await getDocument(id);
    let version: number | null = null;
    if (doc?.content_html) {
      const recent = await q1("SELECT 1 FROM versions WHERE project_id=$1 AND label LIKE '📋 붙여넣기 전%' AND created_at > NOW() - INTERVAL '1 minute'", [id]).catch(() => null);
      if (!recent) version = (await createVersion({ projectId: id, kind: "draft", title: doc.title, content: doc.content_html, source: "user", label: "📋 붙여넣기 전" })).number;
    }
    const preview = String(b.preview ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const imgs = Math.max(0, Number(b.images) || 0);
    const chars = Math.max(0, Number(b.chars) || 0);
    await addEvent(id, "paste", `📋 붙여넣기${chars ? ` 글 ${chars.toLocaleString("ko-KR")}자` : ""}${imgs ? ` · 사진 ${imgs}장` : ""}${preview ? `: "${preview}${chars > 120 ? "…" : ""}"` : ""}${version ? ` (붙여넣기 전 원고 v${version} 보관)` : ""}`);
    return ok({ ok: true, version });
  });
}
