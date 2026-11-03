import "server-only";
import TurndownService from "turndown";
import type { Blog, DocumentRow, Project, PublishPackage } from "./types";

export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  // 표를 단순 마크다운 표로 변환
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim().replace(/\|/g, "\\|")),
      );
      if (!rows.length) return "";
      const head = rows[0];
      const sep = head.map(() => "---");
      return "\n\n" + [head, sep, ...rows.slice(1)].map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n\n";
    },
  });
  return td.turndown(html || "");
}

export function plainText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPackage(blog: Blog, project: Project, doc: DocumentRow | null, versionId: string | null): PublishPackage {
  const html = doc?.content_html ?? "";
  const title = doc?.title || project.plan?.selectedTitle || project.title;
  const plan = project.plan;
  const tags = Array.from(new Set([plan?.mainKeyword, ...(plan?.subKeywords ?? [])].filter(Boolean) as string[])).slice(0, 10);
  const text = plainText(html);
  const imgs = Array.from(html.matchAll(/<img[^>]*src="([^"]+)"/g)).map((m) => m[1]);
  const placeholders = Array.from(text.matchAll(/\[이미지:([^\]]+)\]/g)).map((m) => m[1].trim());
  return {
    generatedAt: new Date().toISOString(),
    title,
    html,
    markdown: `# ${title}\n\n${htmlToMarkdown(html)}`,
    tags,
    metaDescription: text.slice(0, 150),
    imageChecklist: [
      ...imgs.map((s) => `삽입된 이미지: ${s.startsWith("data:") ? "(직접 업로드 이미지)" : s}`),
      ...placeholders.map((p) => `⚠ 아직 이미지가 없는 자리: ${p}`),
    ],
    versionId,
  };
  void blog;
}

export function packageHtmlFile(blog: Blog, pkg: PublishPackage) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pkg.title)}</title>
<meta name="description" content="${escapeHtml(pkg.metaDescription)}">
<style>body{max-width:760px;margin:40px auto;padding:0 16px;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.7}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px}</style>
</head><body>
<!-- ${escapeHtml(blog.name)} 발행 패키지 · 생성 ${pkg.generatedAt} -->
<h1>${escapeHtml(pkg.title)}</h1>
${pkg.html}
<p><small>태그: ${pkg.tags.map((t) => "#" + escapeHtml(t)).join(" ")}</small></p>
</body></html>`;
}

export function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
