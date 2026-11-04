import { q, j } from "@/lib/db";
import { getBlog } from "@/lib/repo";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

const FIELDS = ["name", "platform", "url", "category", "description", "style_guide", "review_rules", "image_style", "image_source", "ai_roles", "color", "archived"] as const;
const JSON_FIELDS = new Set<string>(["review_rules", "ai_roles"]);

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const blog = await getBlog((await params).id);
    return blog ? ok(blog) : fail("블로그 없음", 404);
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<Record<string, unknown>>(req);
    if ("image_source" in b && b.image_source !== "official") b.image_source = "ai";
    const keys = FIELDS.filter((k) => k in b);
    if (!keys.length) return fail("변경할 항목이 없습니다.");
    const vals = keys.map((k) => (JSON_FIELDS.has(k) ? j(b[k]) : b[k]));
    await q(
      `UPDATE blogs SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=NOW() WHERE id=$1`,
      [id, ...vals],
    );
    return ok(await getBlog(id));
  });
}
