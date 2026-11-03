import { q } from "@/lib/db";
import { getBlog, getDocument, getProject } from "@/lib/repo";
import { buildPackage, htmlToMarkdown, packageHtmlFile } from "@/lib/exporter";
import { Ctx, fail, handle } from "@/lib/api";

/**
 * 내보내기
 * format=html  : 발행용 HTML 파일
 * format=md    : 마크다운
 * format=json  : 프로젝트 전체 (기획안·원고·버전·승인·검수 기록)
 */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "json";
    const project = await getProject(id);
    if (!project) return fail("프로젝트 없음", 404);
    const blog = (await getBlog(project.blog_id))!;
    const doc = await getDocument(id);
    const pkg = project.package ?? buildPackage(blog, project, doc, null);
    const base = `${project.id}-${(doc?.title || project.title).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40)}`;

    let content: string;
    let type: string;
    let ext: string;
    if (format === "html") {
      content = packageHtmlFile(blog, pkg);
      type = "text/html";
      ext = "html";
    } else if (format === "md") {
      content = `---\ntitle: "${pkg.title.replace(/"/g, '\\"')}"\ntags: [${pkg.tags.map((t) => `"${t}"`).join(", ")}]\ndescription: "${pkg.metaDescription.replace(/"/g, '\\"')}"\nblog: "${blog.name}"\n---\n\n# ${pkg.title}\n\n${htmlToMarkdown(doc?.content_html ?? "")}\n`;
      type = "text/markdown";
      ext = "md";
    } else {
      const [versions, approvals, reviews, events, runs] = await Promise.all([
        q("SELECT * FROM versions WHERE project_id=$1 ORDER BY kind, number", [id]),
        q("SELECT * FROM approvals WHERE project_id=$1 ORDER BY created_at", [id]),
        q("SELECT * FROM reviews WHERE project_id=$1 ORDER BY created_at", [id]),
        q("SELECT * FROM events WHERE project_id=$1 ORDER BY created_at", [id]),
        q("SELECT * FROM ai_runs WHERE project_id=$1 ORDER BY created_at", [id]),
      ]);
      content = JSON.stringify(
        { exportedAt: new Date().toISOString(), blog: { id: blog.id, name: blog.name }, project, document: doc, versions, approvals, reviews, events, aiRuns: runs },
        null,
        2,
      );
      type = "application/json";
      ext = "json";
    }
    return new Response(content, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`,
      },
    });
  });
}
