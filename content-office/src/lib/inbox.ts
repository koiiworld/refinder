import "server-only";
import crypto from "node:crypto";
import { q, q1, newId, j } from "./db";
import { addEvent, getProject } from "./repo";
import { sanitizeHtml } from "./ai/run";

/**
 * 📥 크롬 확장 프로그램으로 받은 내용 (ChatGPT·제미나이에서 '콘텐츠 오피스로 보내기')
 * - 글: 서식(소제목·목록·표·굵게)만 남기고 정리해서 보관 → 글 화면에서 커서 위치에 넣거나 선택한 부분과 바꿈
 * - 사진: 앱 이미지로 보관 → N번 자리에 쓰거나 본문 커서 위치에 넣음
 * - 받을 때·쓸 때 모두 작업 기록에 남음
 */
export type InboxItem = { id: string; project_id: string; kind: "text" | "image"; html: string; text: string; image_url: string; source: { site?: string; url?: string; title?: string }; used_at: string | null; created_at: string };

const ALLOWED = new Set(["p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "a", "code", "pre", "hr"]);
/** ChatGPT·제미나이 화면 HTML → 편집기에 넣을 깨끗한 HTML (버튼·아이콘·클래스 제거, h1→h2) */
export function cleanChatHtml(html: string) {
  let s = sanitizeHtml(String(html ?? ""))
    .replace(/<(button|svg|img|picture|video|audio|canvas|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(img|input|source)\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi, (_m, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase() === "h1" ? "h2" : tag.toLowerCase() === "b" ? "strong" : tag.toLowerCase() === "i" ? "em" : tag.toLowerCase();
    if (!ALLOWED.has(t)) return "";
    if (close) return `</${t}>`;
    if (t === "a") {
      const href = /\bhref="(https?:[^"]+)"/i.exec(attrs)?.[1];
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    const span = /\b(colspan|rowspan)="(\d+)"/gi;
    const keep = [...attrs.matchAll(span)].map((m) => ` ${m[1].toLowerCase()}="${m[2]}"`).join("");
    return `<${t}${keep}>`;
  });
  return s.replace(/<p>\s*<\/p>/g, "").replace(/\n{2,}/g, "\n").trim();
}

async function saveImage(dataUrl: string, projectId: string) {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("사진 형식이 맞지 않아요.");
  const data = Buffer.from(m[2], "base64");
  if (!data.length || data.length > 15 * 1024 * 1024) throw new Error("15MB 이하 사진만 받을 수 있어요.");
  const id = `img_${crypto.createHash("sha256").update(data).digest("hex").slice(0, 24)}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,$2,'extension','inbox',$3,$4,'확장 프로그램으로 받은 사진') ON CONFLICT (id) DO NOTHING", [id, projectId, m[1].toLowerCase().replace("image/jpg", "image/jpeg"), data]);
  const { publicBase } = await import("./image-refs");
  const base = (await publicBase().catch(() => null)) ?? "";
  return `${base}/api/img/${id}.jpg`;
}

const SITE: Record<string, string> = { chatgpt: "ChatGPT", gemini: "제미나이" };

export async function addInbox(projectId: string, input: { kind?: string; html?: string; text?: string; image?: string; source?: { site?: string; url?: string; title?: string } }) {
  if (!(await getProject(projectId))) throw new Error("보낼 글을 찾을 수 없어요. 확장 프로그램에서 글을 다시 골라 주세요.");
  const source = { site: String(input.source?.site ?? "").slice(0, 20), url: /^https:\/\//.test(String(input.source?.url ?? "")) ? String(input.source!.url).slice(0, 500) : "", title: String(input.source?.title ?? "").slice(0, 200) };
  const id = newId("ibx_");
  if (input.kind === "image") {
    const url = await saveImage(String(input.image ?? ""), projectId);
    await q("INSERT INTO post_inbox (id, project_id, kind, image_url, source) VALUES ($1,$2,'image',$3,$4)", [id, projectId, url, j(source)]);
    await addEvent(projectId, "inbox", `📥 ${SITE[source.site] ?? source.site ?? "확장 프로그램"}에서 사진 받음${source.title ? ` (대화: ${source.title})` : ""}`);
  } else {
    const html = cleanChatHtml(String(input.html ?? "")) || `<p>${String(input.text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n+/g, "</p><p>")}</p>`;
    const text = String(input.text ?? html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text) throw new Error("보낼 글이 비어 있어요.");
    await q("INSERT INTO post_inbox (id, project_id, kind, html, text, source) VALUES ($1,$2,'text',$3,$4,$5)", [id, projectId, html.slice(0, 200000), text.slice(0, 50000), j(source)]);
    await addEvent(projectId, "inbox", `📥 ${SITE[source.site] ?? source.site ?? "확장 프로그램"}에서 글 받음 (${text.length.toLocaleString("ko-KR")}자): "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"${source.title ? ` · 대화: ${source.title}` : ""}`);
  }
  return id;
}

export async function listInbox(projectId: string) {
  return q<InboxItem>("SELECT * FROM post_inbox WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100", [projectId]);
}
export async function getInboxItem(id: string) {
  return q1<InboxItem>("SELECT * FROM post_inbox WHERE id=$1", [id]);
}
export async function markUsed(id: string, how: string) {
  const it = await getInboxItem(id);
  if (!it) throw new Error("받은 내용을 찾을 수 없어요.");
  await q("UPDATE post_inbox SET used_at=NOW() WHERE id=$1", [id]);
  await addEvent(it.project_id, "inbox", `📥 받은 ${it.kind === "image" ? "사진" : "글"}을 ${how}${it.kind === "text" ? `: "${it.text.slice(0, 60)}${it.text.length > 60 ? "…" : ""}"` : ""}`);
  return it;
}
export async function deleteInbox(id: string) {
  await q("DELETE FROM post_inbox WHERE id=$1", [id]);
}

/** 확장 프로그램에서 고를 최근 글 목록 */
export async function recentPostsForExt() {
  return q<{ id: string; title: string; stage: string; blog: string; updated_at: string }>(
    `SELECT p.id, COALESCE(NULLIF(d.title,''), p.title) AS title, p.stage, b.name AS blog, p.updated_at
       FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id
      WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 40`,
  );
}
