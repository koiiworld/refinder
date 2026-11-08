import "server-only";
import { extractJson, runStep } from "./ai/run";
import { getBlogForAi, getProject, updateProject } from "./repo";
import { q1 } from "./db";
import type { ImageConcept, PostExtras, PostImage } from "./posts-types";

/**
 * 🎨 이미지 기획 (글을 다 쓴 뒤, 이미지 만들기 전에 한 번)
 * 사람이 제미나이에서 하던 순서 그대로:
 *  ① 글 전체를 읽고 이미지 컨셉 하나를 정함 (그릇·소품·배경·조명·구도·색감)
 *  ② 레시피면 재료(분량)·순서를 철저히 뽑음 — 이미지에 재료가 빠지거나 다른 재료가 들어가지 않게
 *  ③ 이미지 자리마다 그 앞뒤 글을 보고, 같은 컨셉 + 그 단계에 맞는 재료로 프롬프트를 만듦
 * 결과 프롬프트에는 같은 컨셉 문단이 매번 그대로 들어감 → 이미지끼리 이어짐
 */
const strip = (html: string) =>
  html
    .replace(/<\/(p|h2|h3|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();

type Planned = { n?: number; context?: string; shows?: string[]; avoid?: string[]; scene?: string; alt?: string; aspect?: string };

export async function planImages(projectId: string, opts: { html?: string; images?: PostImage[] } = {}) {
  const p = await getProject(projectId);
  if (!p) throw new Error("글을 찾을 수 없습니다.");
  const blog = await getBlogForAi(p.blog_id);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const extras = (p.package as unknown as PostExtras | null) ?? { hashtags: [], images: [] };
  const images = opts.images ?? extras.images ?? [];
  if (!images.length || images.every((i) => i.kind === "official")) return null;
  const html = opts.html ?? (await q1<{ content_html: string }>("SELECT content_html FROM documents WHERE project_id=$1", [projectId]))?.content_html ?? "";
  const text = strip(html).slice(0, 14000);
  const title = String((p.plan as { selectedTitle?: string } | null)?.selectedTitle ?? p.title ?? "");
  const system = `당신은 블로그 사진 아트디렉터이자 푸드 스타일리스트입니다. 이미지를 만들기 전에 글 전체를 꼼꼼히 읽고, 모든 이미지가 한 사람이 한 자리에서 찍은 것처럼 이어지게 계획합니다. 글에 없는 재료·제품을 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `[블로그] ${blog.name} · 분야: ${blog.category}
[블로그 이미지 스타일] ${blog.image_style || "(없음)"}
[글 제목] ${title}
[본문 - [이미지 N] 은 이미지가 들어갈 자리]
${text}

이미지 ${images.length}장을 계획하세요. 순서를 꼭 지키세요.
1) concept: 글 전체를 보고 모든 이미지에 공통으로 쓸 컨셉 하나.
   - summary: 한국어 2~3문장 (어떤 그릇·소품·배경·조명·구도·색감인지)
   - prompt: 영어 문단. 그릇(색·재질·모양), 테이블·배경, 소품, 조명(방향·시간대), 카메라(높이·렌즈 느낌), 색감, 분위기를 구체적으로. 모든 이미지에 똑같이 붙여요.
2) ingredients / steps: 레시피 글이면 본문에 나온 재료를 분량까지 하나도 빠짐없이(예: "돼지 앞다리살 600g"), 순서는 본문 순서 그대로. 레시피가 아니면 글에 나오는 제품·소품·장면을 ingredients 에, steps 는 빈 배열.
3) images: [이미지 1]부터 순서대로 ${images.length}개.
   - n: 번호
   - context: 그 자리 앞뒤 본문이 무엇을 설명하는지 (한국어 한 줄)
   - shows: 그 사진에 반드시 보여야 할 것 (재료는 위 ingredients 의 이름 그대로, 그 단계에서 들어간 재료만. 완성 사진이면 완성 요리에 실제로 들어간 재료)
   - avoid: 넣으면 안 되는 것 (레시피에 없는 재료·다른 요리·글자·손 등)
   - scene: 영어. 이 사진만의 장면(무엇을, 어떤 상태로, 어떤 구도로). 컨셉 문단은 다시 쓰지 말 것
   - alt: 한국어 대체 텍스트
   - aspect: "1:1","4:3","3:4","2:3","3:2","16:9","9:16" 중 (블로그 이미지 스타일에 비율 규칙이 있으면 따름, 1번은 대표 이미지)
형식: {"concept": {"summary": "", "prompt": ""}, "ingredients": [""], "steps": [""], "images": [{"n": 1, "context": "", "shows": [""], "avoid": [""], "scene": "", "alt": "", "aspect": "4:3"}]}`;
  const res = await runStep({ step: "writing", purpose: "image-plan", blog, projectId, system, prompt, json: true, maxTokens: 6000, retries: 1 });
  const raw = extractJson<{ concept?: { summary?: string; prompt?: string }; ingredients?: string[]; steps?: string[]; images?: Planned[] }>(res.text);
  const conceptPrompt = String(raw.concept?.prompt ?? "").trim();
  if (!conceptPrompt) throw new Error("이미지 컨셉을 만들지 못했어요.");
  const list = (a: unknown) => (Array.isArray(a) ? a.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  const concept: ImageConcept = {
    summary: String(raw.concept?.summary ?? "").trim().slice(0, 600),
    prompt: conceptPrompt.slice(0, 1500),
    ingredients: list(raw.ingredients).slice(0, 40),
    steps: list(raw.steps).slice(0, 30),
    provider: res.provider,
    model: res.model,
    at: new Date().toISOString(),
  };
  const ASPECTS = ["1:1", "4:3", "3:4", "2:3", "3:2", "16:9", "9:16"];
  const planned = Array.isArray(raw.images) ? raw.images : [];
  const next = images.map((im, i) => {
    if (im.kind === "official") return im;
    const pl = planned.find((x) => Number(x.n) === i + 1) ?? planned[i];
    if (!pl?.scene) return im;
    const shows = list(pl.shows).slice(0, 20);
    const avoid = list(pl.avoid).slice(0, 12);
    const composed = [
      String(pl.scene).trim(),
      `Shared concept for every photo in this post (keep identical): ${concept.prompt}`,
      shows.length ? `Must clearly show exactly: ${shows.join(", ")}.` : "",
      avoid.length ? `Do not include: ${avoid.join(", ")}.` : "",
    ].filter(Boolean).join("\n\n");
    return {
      ...im,
      prompt: composed,
      shows,
      alt: String(pl.alt ?? "").trim() || im.alt,
      aspect: ASPECTS.includes(String(pl.aspect)) ? String(pl.aspect) : im.aspect,
      matchFirst: im.matchFirst ?? true,
    };
  });
  return { concept, images: next };
}

/** 🎨 컨셉 다시 잡기 (버튼): 저장된 글로 다시 기획해 프롬프트를 바꿈 (이미 만든 이미지는 그대로) */
export async function replanImages(projectId: string) {
  const r = await planImages(projectId);
  if (!r) throw new Error("AI로 만들 이미지 자리가 없어요.");
  const p = (await getProject(projectId))!;
  const extras = (p.package as unknown as PostExtras) ?? { hashtags: [], images: [] };
  await updateProject(projectId, { package: { ...extras, imageConcept: r.concept, images: r.images.map((im, i) => ({ ...im, url: extras.images[i]?.url ?? im.url ?? null })) } });
  return r.concept;
}
