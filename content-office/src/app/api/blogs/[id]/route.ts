import {parseTitleList} from "@/lib/title-rules";
import { q, j } from "@/lib/db";
import { getBlog } from "@/lib/repo";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

const FIELDS = ["name", "platform", "url", "category", "description", "style_guide", "review_rules", "title_rules", "title_forbidden", "image_style", "image_source", "ai_roles", "color", "archived"] as const;
const JSON_FIELDS = new Set<string>(["review_rules", "title_rules", "title_forbidden", "ai_roles"]);

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
    try{for(const key of ["title_rules","title_forbidden"])if(key in b)b[key]=parseTitleList(b[key]);}catch(e){return fail((e as Error).message);}
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
