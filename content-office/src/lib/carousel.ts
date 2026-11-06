import "server-only";
import crypto from "node:crypto";
import { q, q1, newId, j } from "./db";
import { getBlogForAi, getDocument, getProject } from "./repo";
import { extractJson, runStep } from "./ai/run";
import type { PostExtras } from "./posts-types";
import { seasonEvents } from "./seasons";
import { importPostWithImages } from "./sample-html";

/**
 * 📱 인스타 캐러셀(카드뉴스)
 * - 블로그 글에서 만들기: 글 본문·사진을 재료로 장면 나누기
 * - 주제로 따로 만들기: 저장·공유가 잘 되는 형식으로
 * - 이미지는 브라우저에서 그림(서버 부담 없음) → 사진 앱에 저장/공유
 */

export type Slide = { kind: "cover" | "content" | "cta"; headline: string; body: string; image: number | null };
export type CarouselImage = { url: string; alt: string };
export type CarouselStyle = { template: "photo" | "clean" | "bold"; accent: string; handle: string };
export type Carousel = {
  id: string;
  blog_id: string | null;
  project_id: string | null;
  title: string;
  topic: string;
  slides: Slide[];
  caption: string;
  hashtags: string[];
  images: CarouselImage[];
  style: CarouselStyle & { hooks?: string[]; format?: string; niche?: string; sourceText?: string; sourceUrl?: string; contentType?: ContentTypeId };
  ai: { provider?: string; model?: string; at?: string };
  created_at: string;
  updated_at: string;
};

/** 콘텐츠 유형별 장수·구성 (정보형 캐러셀은 기본 8장) */
export const CONTENT_TYPES = [
  { id: "tip", label: "짧은 생활 꿀팁·정보", range: "5~6장", count: 6, plan: "표지(시선 집중) → 문제 제기(공감) → 핵심 팁 ①~③ → 마무리(저장·공유)" },
  { id: "general", label: "일반 정보형", range: "7~9장", count: 8, plan: "01 표지(시선 집중) → 02 문제 제기(공감 유도) → 03 핵심 정보①(첫 번째 팁) → 04 핵심 정보②(두 번째 팁) → 05 핵심 정보③(세 번째 팁) → 06 실전 예시(활용 방법) → 07 핵심 요약(저장할 정보) → 08 마무리(저장·공유)" },
  { id: "compare", label: "비교·분석·체크리스트", range: "8~12장", count: 10, plan: "표지 → 문제 제기 → 비교 기준 → 항목별 비교(장마다 하나) → 한눈에 보는 표/체크리스트 → 추천 정리 → 핵심 요약(저장할 정보) → 마무리(저장·공유)" },
  { id: "guide", label: "심층 가이드·단계별", range: "10~15장", count: 12, plan: "표지 → 문제 제기 → 준비물/전체 흐름 → 1단계~N단계(장마다 한 단계) → 자주 하는 실수 → 실전 예시 → 핵심 요약(저장할 정보) → 마무리(저장·공유)" },
] as const;
export type ContentTypeId = (typeof CONTENT_TYPES)[number]["id"];

export const FORMATS = [
  { id: "save", label: "📌 저장형 정리·체크리스트" },
  { id: "mistake", label: "❌⭕ 실수 교정 (이렇게 하면 망해요)" },
  { id: "top", label: "🏆 TOP N · 랭킹" },
  { id: "vs", label: "🆚 비교 (A vs B)" },
  { id: "steps", label: "🪜 따라 하기 단계별" },
  { id: "money", label: "💸 돈·시간 아끼는 꿀팁" },
  { id: "relate", label: "🙋 공감 (이런 사람 특징)" },
  { id: "quiz", label: "❓ 퀴즈·테스트" },
] as const;

const DEFAULT_STYLE: CarouselStyle = { template: "photo", accent: "#ff6b35", handle: "" };

const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export async function listCarousels() {
  return q<Carousel & { blog_name: string | null }>(
    "SELECT c.*, b.name AS blog_name FROM carousels c LEFT JOIN blogs b ON b.id=c.blog_id ORDER BY c.updated_at DESC LIMIT 100",
  );
}
export async function getCarousel(id: string) {
  return q1<Carousel>("SELECT * FROM carousels WHERE id=$1", [id]);
}

/** 블로그 글에서 캐러셀 만들기 (사진은 글에 들어간 사진·만든 이미지 재사용) */
export async function createFromProject(projectId: string) {
  const p = await getProject(projectId);
  if (!p) throw new Error("글을 찾을 수 없습니다.");
  const doc = await getDocument(projectId);
  if (!doc?.content_html) throw new Error("먼저 글이 있어야 합니다.");
  const extras = (p.package as unknown as PostExtras | null) ?? { hashtags: [], images: [] };
  const imgs: CarouselImage[] = [];
  for (const im of extras.images ?? []) if (im.url) imgs.push({ url: im.url, alt: im.alt || im.product || "" });
  for (const m of doc.content_html.matchAll(/<img[^>]+src="([^"]+)"[^>]*?(?:alt="([^"]*)")?/gi)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (!imgs.some((x) => x.url === url)) imgs.push({ url, alt: m[2] ?? "" });
  }
  const id = newId("car_");
  await q("INSERT INTO carousels (id, blog_id, project_id, title, topic, images, style) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    id, p.blog_id, projectId, doc.title || p.title, p.topic || "", j(imgs.slice(0, 12)), j(DEFAULT_STYLE),
  ]);
  await generate(id);
  return id;
}

async function allowedHosts() {
  return (await q<{ url: string }>("SELECT url FROM blogs WHERE COALESCE(url,'') <> ''")).map((r) => {
    try {
      return new URL(r.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  });
}

/** 이미 발행한 블로그 글 주소에서 만들기 (본문 + 글에 올린 사진) */
export async function createFromBlogUrl(url: string, blogId?: string | null) {
  const post = await importPostWithImages(url, await allowedHosts());
  if (post.text.length < 100) throw new Error("글 본문을 읽지 못했어요 (비공개 글이거나 지원하지 않는 형식).");
  const id = newId("car_");
  await q("INSERT INTO carousels (id, blog_id, title, topic, images, style) VALUES ($1,$2,$3,$4,$5,$6)", [
    id, blogId || null, post.title, post.title, j(post.images.slice(0, 20).map((u, i) => ({ url: u, alt: `블로그 사진 ${i + 1}` }))),
    j({ ...DEFAULT_STYLE, sourceText: post.text.slice(0, 8000), sourceUrl: url }),
  ]);
  await generate(id);
  return id;
}

/** 블로그 글 주소의 사진을 이 캐러셀 사진 목록에 추가 */
export async function importBlogImages(id: string, url: string) {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없습니다.");
  const post = await importPostWithImages(url, await allowedHosts());
  const add = post.images.filter((u) => !c.images.some((x) => x.url === u)).map((u, i) => ({ url: u, alt: `${post.title.slice(0, 20)} ${i + 1}` }));
  if (!add.length) throw new Error("이 글에서 새로 가져올 사진을 찾지 못했어요.");
  const images = [...c.images, ...add].slice(0, 40);
  await q("UPDATE carousels SET images=$2, updated_at=NOW() WHERE id=$1", [id, j(images)]);
  return images.length - c.images.length;
}

/** 블로그와 별개로 주제만으로 만들기 */
export async function createFromTopic(input: { topic: string; niche?: string; format?: string; blogId?: string | null }) {
  const topic = input.topic.trim().slice(0, 200);
  if (!topic) throw new Error("주제를 적어 주세요.");
  const id = newId("car_");
  await q("INSERT INTO carousels (id, blog_id, title, topic, style) VALUES ($1,$2,$3,$4,$5)", [
    id, input.blogId || null, topic, topic, j({ ...DEFAULT_STYLE, template: "bold", format: input.format ?? "", niche: input.niche ?? "" }),
  ]);
  await generate(id);
  return id;
}

/** AI: 장면 나누기 + 후킹 문구 + 캡션·해시태그 */
export async function generate(id: string, feedback = "") {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없습니다.");
  const blog = c.blog_id ? await getBlogForAi(c.blog_id) : null;
  const doc = c.project_id ? await getDocument(c.project_id) : null;
  const fmt = FORMATS.find((f) => f.id === c.style?.format)?.label ?? "";
  const ctype = CONTENT_TYPES.find((t) => t.id === c.style?.contentType) ?? CONTENT_TYPES[1];
  const source = doc?.content_html ? text(doc.content_html).slice(0, 6000) : (c.style?.sourceText ?? "").slice(0, 6000);
  const system = `당신은 저장·공유·친구 태그가 많이 나오는 인스타그램 캐러셀(카드뉴스) 카피라이터입니다. 짧고 리듬감 있게, 해요체로 씁니다. 확인할 수 없는 수치·효과를 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `${blog ? `[계정 분야] ${blog.name} · ${blog.category}\n` : ""}${c.style?.niche ? `[계정 분야] ${c.style.niche}\n` : ""}[주제] ${c.title}
${fmt ? `[형식] ${fmt}\n` : ""}${source ? `\n[원본 블로그 글 - 이 내용만 근거로]\n${source}\n` : ""}${c.images.length ? `\n[쓸 수 있는 사진 (번호: 설명)]\n${c.images.map((im, i) => `${i}: ${im.alt || "(설명 없음)"}`).join("\n")}\n` : ""}${feedback ? `\n[수정 요청 - 반드시 반영]\n${feedback}\n` : ""}
[콘텐츠 유형] ${ctype.label} — ${ctype.range} (기본 ${ctype.count}장)
[추천 구성] ${ctype.plan}

위 유형에 맞춰 인스타 캐러셀을 ${ctype.range} (가능하면 ${ctype.count}장) 만드세요. 추천 구성 순서를 따르되 내용에 맞게 조절하세요.
- 사진이 있으면 되도록 많은 장에 서로 다른 사진을 배치하세요 (같은 사진 반복은 최소로).
- 1장(cover): 스크롤을 멈추게 하는 후킹. headline 18자 이내(줄바꿈 \\n 1번 가능), body 는 한 줄 보조 문구(20자 이내).
  잘 먹히는 틀: 숫자+결과("10분이면 김밥집 맛"), 실수 경고("이렇게 하면 다 터져요"), 저장 유도("저장 안 하면 후회해요"), 반전·호기심("○○ 넣으면 달라져요").
- 2장: 끝까지 넘기게 만드는 이유(결과 미리보기·공감).
- 중간 장(content): 한 장에 한 가지만. headline 14자 이내, body 60자 이내. 재료·순서·체크리스트처럼 '나중에 다시 볼' 정보는 저장하고 싶게 정리.
- 마지막 장(cta): 저장 + 친구 태그 + 팔로우 유도. 주제에 맞는 태그 문구 (예: "김밥 좋아하는 친구 태그 🍙", "같이 갈 친구 소환").
- image: 그 장에 어울리는 사진 번호, 없으면 null. 표지는 가장 먹음직스럽거나 결과가 보이는 사진.
- hooks: 표지 headline 대안 3개 (서로 다른 틀)
- caption: 첫 줄은 후킹 한 줄(40자 이내) → 빈 줄 → 핵심 요약 3~5줄(이모지 조금) → 저장·태그 유도 한 줄${doc || c.style?.sourceUrl ? ' → "전체 내용은 프로필 링크에서"' : ""}
- hashtags: 3~5개 (# 없이, 띄어쓰기 없이, 주제와 직접 관련된 것만)
형식: {"slides": [{"kind": "cover", "headline": "", "body": "", "image": 0}], "hooks": ["", "", ""], "caption": "", "hashtags": [""]}`;
  const res = await runStep({ step: "carousel", purpose: "carousel", blog, projectId: c.project_id, system, prompt, json: true, maxTokens: 4000 });
  const raw = extractJson<{ slides?: Partial<Slide>[]; hooks?: string[]; caption?: string; hashtags?: string[] }>(res.text);
  const slides: Slide[] = (raw.slides ?? [])
    .map((s, i, a) => ({
      kind: (["cover", "content", "cta"].includes(String(s.kind)) ? s.kind : i === 0 ? "cover" : i === a.length - 1 ? "cta" : "content") as Slide["kind"],
      headline: String(s.headline ?? "").replace(/\\n/g, "\n").slice(0, 60),
      body: String(s.body ?? "").replace(/\\n/g, "\n").slice(0, 200),
      image: Number.isInteger(s.image) && Number(s.image) >= 0 && Number(s.image) < c.images.length ? Number(s.image) : null,
    }))
    .filter((s) => s.headline || s.body)
    .slice(0, 15);
  if (!slides.length) throw new Error("AI가 장면을 만들지 못했습니다. 다시 시도해 주세요.");
  const hashtags = Array.from(new Set((raw.hashtags ?? []).map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))).slice(0, 5);
  await q("UPDATE carousels SET slides=$2, caption=$3, hashtags=$4, style=$5, ai=$6, updated_at=NOW() WHERE id=$1", [
    id, j(slides), String(raw.caption ?? "").slice(0, 2200), j(hashtags), j({ ...DEFAULT_STYLE, ...c.style, hooks: (raw.hooks ?? []).map(String).slice(0, 3) }), j({ provider: res.provider, model: res.model, at: new Date().toISOString() }),
  ]);
}

/** 표지 문구 후보만 다시 받기 (가벼운 호출) */
export async function regenerateHooks(id: string) {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없습니다.");
  const blog = c.blog_id ? await getBlogForAi(c.blog_id) : null;
  const system = `당신은 저장·공유·친구 태그가 많이 나오는 인스타그램 캐러셀(카드뉴스) 표지 카피라이터입니다. 확인할 수 없는 수치를 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
  const prompt = `[주제] ${c.title}
[지금 표지] ${c.slides[0]?.headline ?? ""}
[이미 나온 후보 - 겹치지 않게] ${(c.style?.hooks ?? []).join(" / ") || "(없음)"}
[내용 요약] ${c.slides.slice(1, 6).map((s) => s.headline).join(" / ")}

스크롤을 멈추게 하는 새 표지 문구 3개를 만드세요. 18자 이내, 서로 다른 틀(숫자+결과, 실수 경고, 저장 유도, 반전·호기심 중)로.
형식: {"hooks": ["", "", ""]}`;
  const res = await runStep({ step: "carousel", purpose: "carousel", blog, projectId: c.project_id, system, prompt, json: true, maxTokens: 400 });
  const hooks = (extractJson<{ hooks?: string[] }>(res.text).hooks ?? []).map((h) => String(h).replace(/\\n/g, "\n").slice(0, 60)).filter(Boolean).slice(0, 3);
  if (!hooks.length) throw new Error("새 표지 문구를 받지 못했어요. 다시 눌러 주세요.");
  await q("UPDATE carousels SET style=$2, updated_at=NOW() WHERE id=$1", [id, j({ ...c.style, hooks })]);
  return hooks;
}

export async function saveCarousel(id: string, patch: { title?: string; slides?: Slide[]; caption?: string; hashtags?: string[]; style?: Partial<CarouselStyle> & { contentType?: ContentTypeId } }) {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없습니다.");
  const slides = (patch.slides ?? c.slides).slice(0, 15).map((s) => ({
    kind: (["cover", "content", "cta"].includes(s.kind) ? s.kind : "content") as Slide["kind"],
    headline: String(s.headline ?? "").slice(0, 80),
    body: String(s.body ?? "").slice(0, 300),
    image: s.image != null && Number.isInteger(Number(s.image)) && Number(s.image) >= 0 && Number(s.image) < c.images.length ? Number(s.image) : null,
  }));
  const style = { ...c.style, ...(patch.style ?? {}) };
  if (style.accent && !/^#[0-9a-f]{6}$/i.test(style.accent)) style.accent = DEFAULT_STYLE.accent;
  if (!["photo", "clean", "bold"].includes(style.template)) style.template = "photo";
  if (style.contentType && !CONTENT_TYPES.some((t) => t.id === style.contentType)) style.contentType = "general";
  style.handle = String(style.handle ?? "").slice(0, 40);
  await q("UPDATE carousels SET title=$2, slides=$3, caption=$4, hashtags=$5, style=$6, updated_at=NOW() WHERE id=$1", [
    id, String(patch.title ?? c.title).slice(0, 200), j(slides), String(patch.caption ?? c.caption).slice(0, 2200),
    j((patch.hashtags ?? c.hashtags).map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 30)), j(style),
  ]);
}

/** 내 사진 올리기 → 이 사이트 주소로 저장해 캐러셀 사진 목록에 추가 */
export async function addUpload(id: string, dataUrl: string) {
  const c = await getCarousel(id);
  if (!c) throw new Error("캐러셀을 찾을 수 없습니다.");
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("PNG·JPG·WEBP 사진만 올릴 수 있어요.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > 8 * 1024 * 1024) throw new Error("사진이 너무 큽니다 (8MB 이하).");
  const imgId = `img_${crypto.randomBytes(12).toString("hex")}`;
  await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,$2,'upload','user',$3,$4,'')", [imgId, c.project_id, m[1], data]);
  const images = [...c.images, { url: `/api/img/${imgId}.jpg`, alt: "내 사진" }].slice(0, 20);
  await q("UPDATE carousels SET images=$2, updated_at=NOW() WHERE id=$1", [id, j(images)]);
  return images.length - 1;
}

export async function deleteCarousel(id: string) {
  await q("DELETE FROM carousels WHERE id=$1", [id]);
}

/** 알고리즘 타기 쉬운 카드뉴스 주제 추천 (분야 자유 입력) */
export async function carouselIdeas(niche: string, blogId?: string | null) {
  const n = niche.trim().slice(0, 100) || "생활 꿀팁";
  const blog = blogId ? await getBlogForAi(blogId) : null;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const soon = seasonEvents(Number(today.slice(0, 4)))
    .filter((e) => e.end >= today && e.start <= new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10))
    .map((e) => `${e.name} (${e.start}~${e.end})`);
  const system = `당신은 인스타그램 성장 전략가입니다. 저장·공유(DM 보내기)·친구 태그가 잘 나오는 캐러셀 주제를 기획합니다. 반드시 JSON 객체 하나만 출력합니다. 한국어로 씁니다.`;
  const prompt = `[계정 분야] ${n}${blog ? ` (연결 블로그: ${blog.name})` : ""}
[오늘] ${today}
[곧 다가오는 시즌] ${soon.join(", ") || "(없음)"}
[쓸 수 있는 형식] ${FORMATS.map((f) => f.label).join(" / ")}

이 분야에서 지금 올리면 저장·공유가 많이 나올 캐러셀 주제 8개를 추천하세요.
- 넓은 사람이 "나도 해당돼" 하고 저장하거나 친구에게 보낼 만한 주제 우선 (돈·시간 절약, 실수 방지, 비교, 시즌 준비물, 공감)
- 사진이 꼭 필요하지 않아도 글자·표만으로 만들 수 있는 주제 포함
- 같은 형식만 반복하지 말 것
- format 은 save, mistake, top, vs, steps, money, relate, quiz 중 하나
형식: {"ideas": [{"topic": "캐러셀 주제", "format": "save", "hook": "표지 문구 예시", "why": "저장·공유가 나올 이유 한 줄"}]}`;
  const res = await runStep({ step: "carousel", purpose: "carousel-ideas", blog, system, prompt, json: true, maxTokens: 2500 });
  const raw = extractJson<{ ideas?: { topic?: string; format?: string; hook?: string; why?: string }[] }>(res.text);
  return {
    ideas: (raw.ideas ?? []).map((i) => ({ topic: String(i.topic ?? ""), format: FORMATS.some((f) => f.id === i.format) ? String(i.format) : "save", hook: String(i.hook ?? ""), why: String(i.why ?? "") })).filter((i) => i.topic).slice(0, 10),
    provider: res.provider,
    model: res.model,
  };
}
