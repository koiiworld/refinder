import { q } from "@/lib/db";
import { getBlog, getDocument, getProject } from "@/lib/repo";
import { escapeHtml, htmlToMarkdown, plainText } from "@/lib/exporter";
import type { PostExtras, PostPlan } from "@/lib/posts-types";
import { Ctx, fail, handle } from "@/lib/api";

/** ⑦ 발행용 내려받기: format=html | md | json */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "html";
    const project = await getProject(id);
    if (!project) return fail("글 없음", 404);
    const blog = (await getBlog(project.blog_id))!;
    const doc = await getDocument(id);
    const plan = project.plan as unknown as PostPlan | null;
    const extras = (project.package as unknown as PostExtras | null) ?? { hashtags: [], images: [] };
    const title = doc?.title || plan?.selectedTitle || project.title;
    const html = doc?.content_html ?? "";
    const tags = extras.hashtags ?? [];
    const base = (title || project.id).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);

    let content: string;
    let type: string;
    let ext: string;
    if (format === "md") {
      content = `# ${title}\n\n${htmlToMarkdown(html)}\n\n${tags.map((t) => "#" + t).join(" ")}\n`;
      type = "text/markdown";
      ext = "md";
    } else if (format === "json") {
      const [versions, reviews, events, runs] = await Promise.all([
        q("SELECT * FROM versions WHERE project_id=$1 ORDER BY number", [id]),
        q("SELECT * FROM reviews WHERE project_id=$1 ORDER BY created_at", [id]),
        q("SELECT * FROM events WHERE project_id=$1 ORDER BY created_at", [id]),
        q("SELECT * FROM ai_runs WHERE project_id=$1 ORDER BY created_at", [id]),
      ]);
      content = JSON.stringify({ exportedAt: new Date().toISOString(), blog: { id: blog.id, name: blog.name }, project, document: doc, versions, reviews, events, aiRuns: runs }, null, 2);
      type = "application/json";
      ext = "json";
    } else {
      content = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(plainText(html).slice(0, 150))}">
<style>body{max-width:760px;margin:40px auto;padding:0 16px;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.7}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px}</style>
</head><body>
<!-- ${escapeHtml(blog.name)} -->
<h1>${escapeHtml(title)}</h1>
${html}
<p>${tags.map((t) => "#" + escapeHtml(t)).join(" ")}</p>
</body></html>`;
      type = "text/html";
      ext = "html";
    }
    return new Response(content, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`,
      },
    });
  });
}
