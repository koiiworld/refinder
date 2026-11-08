import {parseTitleList,DEFAULT_TITLE_RULES,DEFAULT_TITLE_FORBIDDEN} from "@/lib/title-rules";
import { q, newId, j } from "@/lib/db";
import { listBlogs } from "@/lib/repo";
import { DEFAULT_ROLES } from "@/lib/seed";
import { body, fail, handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const all = new URL(req.url).searchParams.get("all") === "1";
    return ok(await listBlogs(all));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<Record<string, unknown>>(req);
    if (!String(b.name ?? "").trim()) return fail("블로그 이름을 입력하세요.");
    let titleRules:string[],titleForbidden:string[];
    try{titleRules=parseTitleList(b.title_rules??DEFAULT_TITLE_RULES);titleForbidden=parseTitleList(b.title_forbidden??DEFAULT_TITLE_FORBIDDEN);}catch(e){return fail((e as Error).message);}
    const id = newId("blog_");
    await q(
      `INSERT INTO blogs (id, name, platform, url, category, description, style_guide, review_rules, image_style, ai_roles, color, title_rules, title_forbidden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        String(b.name).trim(),
        String(b.platform ?? "other"),
        String(b.url ?? ""),
        String(b.category ?? ""),
        String(b.description ?? ""),
        String(b.style_guide ?? ""),
        j(Array.isArray(b.review_rules) ? b.review_rules : []),
        String(b.image_style ?? ""),
        j(b.ai_roles ?? DEFAULT_ROLES),
        String(b.color ?? "#2563eb"),
        j(titleRules),j(titleForbidden),
      ],
    );
    return ok({ id }, 201);
  });
}
