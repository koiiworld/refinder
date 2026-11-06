import { createVersion, getDocument, getProject, addEvent, listVersions } from "@/lib/repo";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

/** 원고 버전 목록 (내용 미리보기는 앞부분만) */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const list = await listVersions(id, "draft");
    return ok(list.map((v) => ({ id: v.id, number: v.number, title: v.title, label: v.label, source: v.source, provider: v.provider, model: v.model, created_at: v.created_at, chars: v.content.replace(/<[^>]+>/g, "").length, preview: v.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) })));
  });
}

/** 현재 원고(또는 기획안)를 수동으로 버전 저장 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ kind?: "draft" | "plan"; label?: string }>(req);
    const p = await getProject(id);
    if (!p) return fail("프로젝트 없음", 404);
    if (b.kind === "plan") {
      if (!p.plan) return fail("기획안이 없습니다.");
      const v = await createVersion({ projectId: id, kind: "plan", title: p.plan.selectedTitle, content: JSON.stringify(p.plan), source: "user", label: b.label || "수동 저장" });
      await addEvent(id, "version", `기획안 v${v.number} 수동 저장`);
    } else {
      const doc = await getDocument(id);
      if (!doc?.content_html) return fail("저장할 원고가 없습니다.");
      const v = await createVersion({ projectId: id, kind: "draft", title: doc.title, content: doc.content_html, source: "user", label: b.label || "수동 저장" });
      await addEvent(id, "version", `원고 v${v.number} 수동 저장`);
    }
    return ok({ ok: true });
  });
}
