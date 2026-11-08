import type {PostPlan} from "./posts-types";
import {cleanTitleCandidate} from "./title-rules";
import "server-only";
import { q,q1, newId, j } from "./db";
import { getBlogForAi,addEvent } from "./repo";
import { extractJson, runStep } from "./ai/run";
import { blogContext } from "./ai/prompts";
import { importPostFromUrl } from "./sample-html";
import { keywordStats, naverAdConnected } from "./searchad";
import { writtenTitles } from "./blog-posts";

/**
 * 인기 글 분석 → 내 블로그에 적용
 * - 공개 글(네이버 블로그·티스토리)을 읽어 구조 수치를 직접 계산하고, AI가 제목 패턴·도입·구성·인기 이유를 분석
 * - 내 블로그 분야에 맞춘 제목·키워드·작성 팁 제안 (내용은 베끼지 않고 방식만)
 * - 제안 키워드에는 네이버 검색광고 실제 월간 검색수를 붙임
 */

export type PostStats = { chars: number; headings: number; images: number; lists: number; tables: number; questions: number };

export function statsOf(md: string): PostStats {
  const lines = md.split("\n");
  return {
    chars: md.replace(/\s+/g, "").length,
    // 네이버 에디터는 소제목을 '굵은 글씨 한 줄'로 쓰는 경우가 많아 함께 셈
    headings: lines.filter((l) => /^#{1,6}\s/.test(l) || /^\s*(\*\*|__)[^*_]{2,40}(\*\*|__)\s*$/.test(l)).length,
    images: (md.match(/\[이미지[^\]]*\]/g) ?? []).length,
    lists: lines.filter((l) => /^\s*([-*•]|\d+\.)\s/.test(l)).length,
    tables: (md.match(/^\|\s*-{3,}/gm) ?? []).length,
    questions: (md.match(/[?？]/g) ?? []).length,
  };
}

type Analysis = {
  posts: { title: string; titlePattern: string; hook: string; structure: string; whyPopular: string; keywords: string[] }[];
  common: string[];
  apply: { titleIdeas: { title: string; keyword: string; reason: string }[]; keywords: { keyword: string; reason: string }[]; tips: string[] };
};

export async function analyzePopular(blogId: string, urls: string[]) {
  const blog = await getBlogForAi(blogId);
  if (!blog) throw new Error("블로그를 찾을 수 없습니다.");
  const list = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 5);
  if (!list.length) throw new Error("분석할 글 주소를 넣어 주세요.");
  const hosts = (await q<{ url: string }>("SELECT url FROM blogs WHERE COALESCE(url,'') <> ''")).map((r) => {
    try {
      return new URL(r.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  });

  const fetched: { url: string; title: string; text: string; stats: PostStats; error?: string }[] = [];
  for (const url of list) {
    try {
      const got = await importPostFromUrl(url, hosts);
      if (got.text.length < 100) throw new Error("본문을 찾지 못했습니다 (비공개 글이거나 지원하지 않는 형식)");
      fetched.push({ url, title: got.title, text: got.text, stats: statsOf(got.text) });
    } catch (e) {
      fetched.push({ url, title: "", text: "", stats: statsOf(""), error: (e as Error).message });
    }
  }
  const ok = fetched.filter((f) => !f.error);
  if (!ok.length) throw new Error(fetched.map((f) => `${f.url}: ${f.error}`).join("\n"));

  const written = await writtenTitles(blog);
  const system = `당신은 네이버·티스토리 블로그 콘텐츠 전략가입니다. 인기 글이 왜 잘 되는지 분석하고, 다른 블로그에 '방식'만 적용하는 방법을 제안합니다. 원문 문장을 베끼거나 그대로 옮기지 않습니다. 반드시 JSON 객체 하나만 출력합니다. 한국어로 작성합니다.`;
  const prompt = `${blogContext(blog,["keywords","title","body","image"])}

[이 블로그에 이미 쓴 글 제목 - 겹치지 않게]
${written.slice(0, 40).map((t) => `- ${t}`).join("\n") || "(없음)"}

[분석할 인기 글 ${ok.length}개 — 구조 수치는 앱이 직접 센 값]
${ok
  .map(
    (f, i) => `### 글 ${i + 1}
제목: ${f.title}
수치: 본문 ${f.stats.chars.toLocaleString()}자(공백 제외), 소제목 ${f.stats.headings}개, 이미지 ${f.stats.images}장, 목록 줄 ${f.stats.lists}개, 표 ${f.stats.tables}개
본문(앞부분):
${f.text.slice(0, 3500)}`,
  )
  .join("\n\n")}

다음을 분석하세요.
- posts: 글마다 titlePattern(제목 공식, 예: "브랜드 + 따옴표 속 구매 후기 문장 + 숫자 리스트"), hook(도입 첫 2~3문장이 끄는 방식), structure(소제목·사진·목록 구성 흐름), whyPopular(검색·클릭·체류를 부르는 이유), keywords(이 글이 노리는 검색 키워드 2~4개)
- common: 인기 글들의 공통 패턴 3~6개
- apply: 위 블로그(분야·문체)에 맞춰 적용하는 방법
  - titleIdeas: 이 블로그에 쓸 새 제목 5개 (인기 글의 '공식'만 빌리고 주제는 이 블로그 분야로, 이미 쓴 글과 겹치지 않게). keyword 는 그 제목의 메인 검색 키워드(짧게, 1~3어절)
  - keywords: 이 블로그가 노려 볼 검색 키워드 5~8개 (짧게)
  - tips: 글 쓸 때 바로 따라 할 작성 팁 4~6개 (분량·소제목 수·사진 수·도입 방식 등 구체적으로)
형식: {"posts":[{"title":"","titlePattern":"","hook":"","structure":"","whyPopular":"","keywords":[""]}],"common":[""],"apply":{"titleIdeas":[{"title":"","keyword":"","reason":""}],"keywords":[{"keyword":"","reason":""}],"tips":[""]}}`;

  const res = await runStep({ step: "keywords", purpose: "benchmark", blog, system, prompt, json: true, maxTokens: 6000, template: () => JSON.stringify({ posts: [], common: [], apply: { titleIdeas: [], keywords: [], tips: [] } }) });
  const raw = extractJson<Partial<Analysis>>(res.text);
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const analysis: Analysis = {
    posts: arr<Analysis["posts"][number]>(raw.posts).slice(0, ok.length),
    common: arr<string>(raw.common).map(String).slice(0, 8),
    apply: {
      titleIdeas: arr<Analysis["apply"]["titleIdeas"][number]>(raw.apply?.titleIdeas).filter(t=>t?.title).map(t=>({...t,title:cleanTitleCandidate(String(t.title),blog)})).filter(t=>t.title).slice(0,6),
      keywords: arr<Analysis["apply"]["keywords"][number]>(raw.apply?.keywords).filter((k) => k?.keyword).slice(0, 10),
      tips: arr<string>(raw.apply?.tips).map(String).slice(0, 8),
    },
  };

  // 제안 키워드 실제 검색량
  const kws = Array.from(new Set([...analysis.apply.keywords.map((k) => k.keyword), ...analysis.apply.titleIdeas.map((t) => t.keyword)].map((k) => String(k ?? "").trim()).filter(Boolean)));
  let volumes: Record<string, number | null> = {};
  if (naverAdConnected() && kws.length) {
    try {
      const st = await keywordStats(kws);
      volumes = Object.fromEntries(kws.map((k) => [k, st.stats[k]?.total ?? null]));
    } catch {
      /* 검색량은 선택 */
    }
  }

  const snapshotId=newId("snap_");
  const result = {
    snapshotId,blogId,
    fetched: fetched.map(({ text: _t, ...f }) => f),
    analysis,
    volumes,
    ai: { provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null },
    at: new Date().toISOString(),
  };
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,$2,'benchmark',$3,$4)", [snapshotId, blogId, j({ urls: list }), j(result)]);
  return result;
}

export async function lastBenchmark(blogId: string) {
  const r = await q<{id:string;data:Awaited<ReturnType<typeof analyzePopular>>}>("SELECT id,data FROM research_snapshots WHERE source='benchmark' AND blog_id=$1 ORDER BY collected_at DESC LIMIT 1",[blogId]);
  return r[0]?{...r[0].data,snapshotId:r[0].id}:null;
}

/** 저장된 제목 아이디어로 글 초안 생성. 제목 재생성·본문 작성 AI 호출 없음. */
export async function startBenchmarkPost(blogId:string,snapshotId:string,index:number,expectedTitle:string){
  if(!Number.isInteger(index)||index<0||!snapshotId)throw new Error('적용할 제목을 선택해 주세요.');
  const saved=await q1<{data:Awaited<ReturnType<typeof analyzePopular>>}>("SELECT data FROM research_snapshots WHERE id=$1 AND blog_id=$2 AND source='benchmark'",[snapshotId,blogId]);
  const idea=saved?.data.analysis.apply.titleIdeas[index];
  if(!saved||!idea||idea.title!==expectedTitle)throw new Error('이 블로그의 제목 아이디어를 다시 확인해 주세요.');
  const title=String(idea.title).trim(),keyword=String(idea.keyword??'').trim()||title;
  if(!title)throw new Error('제목이 비어 있어요.');
  const id=`prj_benchmark_${snapshotId}_${index}`;
  const plan:PostPlan={keyword,candidates:[{title,reason:idea.reason??''}],best:0,selectedTitle:title,bestReason:idea.reason??'',subKeywords:[],related:[],ai:{...saved.data.ai,substitutedFor:null},userPicked:true,
    brief:{issue:title,title,why:idea.reason??'',direction:'인기 글의 구성 방식만 참고하고 원문의 주장·경험·수치를 베끼지 마세요. '+saved.data.analysis.apply.tips.join(' / '),sources:saved.data.fetched.filter(f=>!f.error).map(f=>({title:f.title,url:f.url}))}};
  const inserted=await q("INSERT INTO projects(id,blog_id,title,topic,stage,status,plan) VALUES($1,$2,$3,$4,'titles','waiting',$5) ON CONFLICT(id) DO NOTHING RETURNING id",[id,blogId,title,keyword,j(plan)]);
  if(inserted.length)await addEvent(id,'create','인기 글 분석의 제목 아이디어를 선택했어요. 본문 작성 대기 · 추가 AI 호출 없음');
  else if((await q1<{deleted_at:string|null}>('SELECT deleted_at FROM projects WHERE id=$1',[id]))?.deleted_at)throw new Error('휴지통에 있는 글이에요. 복원한 뒤 이어서 작성해 주세요.');
  return {id};
}
