import "server-only";
import { q1, j, q } from "./db";
import { getBlogForAi, getDocument, getProject } from "./repo";
import { extractJson, runStep } from "./ai/run";

/**
 * 📣 블로그 글 하나 → 다른 채널용 초안 (원소스 멀티유즈)
 * - 버튼을 눌러 고른 채널만 한 번에 만듦 (AI 1회, 캐러셀 문구와 같은 저렴한 모델)
 * - 결과는 projects.package.repurpose 에 저장 → 복사해서 쓰거나 캐러셀·영상 스튜디오로 넘김
 */
import { CHANNELS, type ChannelId } from "./repurpose-channels";
export { CHANNELS };
export type RepurposeResult = Partial<Record<ChannelId, string>> & { at?: string; model?: string };

const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export async function getRepurpose(projectId: string): Promise<RepurposeResult> {
  const r = await q1<{ r: RepurposeResult | null }>("SELECT package->'repurpose' AS r FROM projects WHERE id=$1", [projectId]);
  return r?.r ?? {};
}

export async function repurpose(projectId: string, channels: string[]) {
  const pick = CHANNELS.filter((c) => channels.includes(c.id));
  if (!pick.length) throw new Error("만들 채널을 골라 주세요.");
  const p = await getProject(projectId);
  const doc = await getDocument(projectId);
  if (!p || !doc?.content_html) throw new Error("먼저 글이 있어야 해요.");
  const blog = await getBlogForAi(p.blog_id);
  const source = text(doc.content_html).slice(0, 7000);
  const system = "너는 블로그 글을 여러 채널용 콘텐츠로 바꾸는 한국어 콘텐츠 에디터야. 원문에 없는 사실·숫자·가격은 지어내지 마. 블로그 말투를 살리되 채널에 맞게 짧고 읽기 쉽게. 답은 JSON만.";
  const prompt = `블로그: ${blog?.name ?? ""}
제목: ${doc.title || p.title}

[원문]
${source}

아래 채널별 초안을 만들어 줘. 각 값은 그대로 복사해 붙여넣을 수 있는 완성 글(줄바꿈 포함)로.
${pick.map((c) => `- "${c.id}": ${c.label} — ${c.hint}`).join("\n")}

{${pick.map((c) => `"${c.id}": "..."`).join(", ")}} 형식으로 답해.`;
  const res = await runStep({ step: "carousel", purpose: "repurpose", blog, projectId, system, prompt, json: true, maxTokens: 6000 });
  const raw = extractJson<Record<string, unknown>>(res.text);
  const cur = await getRepurpose(projectId);
  const out: RepurposeResult = { ...cur, at: new Date().toISOString(), model: `${res.provider}:${res.model}` };
  for (const c of pick) {
    const v = raw[c.id];
    const s = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n\n") : typeof v === "object" && v ? JSON.stringify(v, null, 1) : String(v ?? "");
    if (s.trim()) out[c.id] = s.trim().slice(0, 6000);
  }
  await q("UPDATE projects SET package = jsonb_set(COALESCE(package,'{}'::jsonb), '{repurpose}', $2::jsonb), updated_at=NOW() WHERE id=$1", [projectId, j(out)]);
  return out;
}
