import "server-only";
import { q, q1, newId, j } from "./db";
import { getBlogForAi, getDocument, getProject } from "./repo";
import { extractJson, runStep } from "./ai/run";
import { importPostWithImages } from "./sample-html";
import { CHANNELS, type ChannelId } from "./repurpose-channels";
export { CHANNELS };

/**
 * 📣 채널 변환: 블로그 글 하나 → 다른 채널용 초안 (원소스 멀티유즈)
 * - 글 가져오기: 이 앱에서 만든 글 · 내 블로그에 이미 올린 글(주소·최근 글 목록) · 직접 붙여넣기
 * - 고른 채널만 한 번에 만듦 (AI 1회, 캐러셀 문구와 같은 저렴한 모델) → repurpose_docs 에 보관
 */
export type RepurposeResult = Partial<Record<ChannelId, string>>;
export type RepurposeDoc = { id: string; blog_id: string | null; project_id: string | null; title: string; source_url: string; source_text: string; result: RepurposeResult; model: string; created_at: string; updated_at: string };

const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function allowedHosts() {
  return (await q<{ url: string }>("SELECT url FROM blogs WHERE COALESCE(url,'') <> ''")).map((r) => {
    try {
      return new URL(r.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  });
}

/** 글 가져오기 (만들기 전 미리보기): 앱 글 아이디 또는 블로그 글 주소 */
export async function loadSource(input: { postId?: string; url?: string }) {
  if (input.postId) {
    const p = await getProject(input.postId);
    const doc = await getDocument(input.postId);
    if (!p || !doc?.content_html) throw new Error("이 글에는 아직 본문이 없어요.");
    return { title: doc.title || p.title, text: text(doc.content_html).slice(0, 12000), blogId: p.blog_id, postId: p.id, url: "" };
  }
  const url = String(input.url ?? "").trim();
  if (!/^https?:\/\//.test(url)) throw new Error("블로그 글 주소를 넣어 주세요.");
  const post = await importPostWithImages(url, await allowedHosts());
  if (post.text.length < 100) throw new Error("글 본문을 읽지 못했어요 (비공개 글이거나 지원하지 않는 형식). 본문을 직접 붙여넣어 주세요.");
  const host = new URL(url).hostname.toLowerCase().replace(/^m\./, "");
  const blog = await q1<{ id: string }>("SELECT id FROM blogs WHERE url ILIKE $1 LIMIT 1", [`%${host}%`]).catch(() => null);
  return { title: post.title, text: post.text.slice(0, 12000), blogId: blog?.id ?? null, postId: null, url };
}

export async function listRepurpose() {
  return q<RepurposeDoc>("SELECT * FROM repurpose_docs ORDER BY updated_at DESC LIMIT 100");
}
export async function getRepurposeDoc(id: string) {
  return q1<RepurposeDoc>("SELECT * FROM repurpose_docs WHERE id=$1", [id]);
}
export async function deleteRepurpose(id: string) {
  await q("DELETE FROM repurpose_docs WHERE id=$1", [id]);
}

/** 만들기: 새로 만들거나(id 없음) 같은 글에 채널을 더함(id 있음) */
export async function repurpose(input: { id?: string; title: string; text: string; blogId?: string | null; postId?: string | null; url?: string; channels: string[] }) {
  const pick = CHANNELS.filter((c) => input.channels.includes(c.id));
  if (!pick.length) throw new Error("만들 채널을 골라 주세요.");
  const source = String(input.text ?? "").trim();
  if (source.length < 50) throw new Error("글 본문이 너무 짧아요. 글을 불러오거나 붙여넣어 주세요.");
  const title = String(input.title ?? "").trim().slice(0, 200) || source.slice(0, 40);
  const blog = input.blogId ? await getBlogForAi(input.blogId).catch(() => null) : null;
  const system = "너는 블로그 글을 여러 채널용 콘텐츠로 바꾸는 한국어 콘텐츠 에디터야. 원문에 없는 사실·숫자·가격은 지어내지 마. 블로그 말투를 살리되 채널에 맞게 짧고 읽기 쉽게. 답은 JSON만.";
  const prompt = `블로그: ${blog?.name ?? ""}
제목: ${title}

[원문]
${source.slice(0, 7000)}

아래 채널별 초안을 만들어 줘. 각 값은 그대로 복사해 붙여넣을 수 있는 완성 글(줄바꿈 포함)로.
${pick.map((c) => `- "${c.id}": ${c.label} — ${c.hint}`).join("\n")}

{${pick.map((c) => `"${c.id}": "..."`).join(", ")}} 형식으로 답해.`;
  const res = await runStep({ step: "carousel", purpose: "repurpose", blog, projectId: input.postId ?? null, system, prompt, json: true, maxTokens: 6000 });
  const raw = extractJson<Record<string, unknown>>(res.text);
  const cur = input.id ? await getRepurposeDoc(input.id) : null;
  const result: RepurposeResult = { ...(cur?.result ?? {}) };
  for (const c of pick) {
    const v = raw[c.id];
    const s = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n\n") : typeof v === "object" && v ? JSON.stringify(v, null, 1) : String(v ?? "");
    if (s.trim()) result[c.id] = s.trim().slice(0, 6000);
  }
  const model = `${res.provider}:${res.model}`;
  if (cur) {
    await q("UPDATE repurpose_docs SET title=$2, source_text=$3, result=$4, model=$5, updated_at=NOW() WHERE id=$1", [cur.id, title, source.slice(0, 12000), j(result), model]);
    return (await getRepurposeDoc(cur.id))!;
  }
  const id = newId("rp_");
  await q("INSERT INTO repurpose_docs (id, blog_id, project_id, title, source_url, source_text, result, model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, input.blogId || null, input.postId || null, title, String(input.url ?? "").slice(0, 500), source.slice(0, 12000), j(result), model]);
  return (await getRepurposeDoc(id))!;
}
