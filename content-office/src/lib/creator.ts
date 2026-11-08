import "server-only";
import { q,q1, newId, j } from "./db";
import { WorkflowError } from "./workflow";

/**
 * 네이버 크리에이터 어드바이저 '유입 트렌드' — 공식 API가 없어 사용자가 화면에서 복사해 붙여 넣은 목록을 저장
 * research_snapshots.source = 'creator_advisor'
 */

export interface CreatorTrend {
  id: string;
  blog_id: string | null;
  category: string;
  date: string; // 데이터 기준일 (사용자 입력)
  items: { rank: number; keyword: string }[];
  collected_at: string; // 앱에 붙여 넣은 시각
}

/** 오른쪽 변동 열만 정리. 검색어 안의 NEW·연도·모델명·분량 숫자는 유지. */
export function cleanCreatorKeyword(raw:string){
  let keyword=raw.trim();
  if(/^(?:new|신규|순위\s*(?:변경|변동)|[-−–—]|[▲▼△▽▴▾↑↓]\ufe0f?\s*\d*|\d+)$/iu.test(keyword))return '';
  let previous='';
  while(previous!==keyword){previous=keyword;keyword=keyword
    .replace(/\s*[▲▼△▽▴▾↑↓]\ufe0f?\s*\d*\s*$/u,'')
    .replace(/(?:\s+(?:new|신규)|(?<=[가-힣])NEW|\s+[-−–—])\s*$/iu,'').trim();}
  return keyword.replace(/^[-•·*\s]+/,'').replace(/\s{2,}/g,' ').trim();
}

/** 붙여 넣은 텍스트 → 순위·키워드 목록 */
export function parseTrendText(text: string): { rank: number; keyword: string }[] {
  const lines = text
    .replace(/\r/g, "")
    .split(/\n|,(?=\s*\S)/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { rank: number; keyword: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    // 줄 앞에 별도로 적힌 순위만 제거. '3분', '1인분', '2026년'은 검색어.
    if(/^\d+$/.test(line))continue;
    const m=line.match(/^(\d{1,3})(?:\s*(?:위|\.|\)|:)\s*|\s+)(.+)$/);
    const kw=cleanCreatorKeyword(m?m[2]:line);
    if(!kw||kw.length>60)continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    out.push({ rank: m ? Number(m[1]) : out.length + 1, keyword: kw });
  }
  return out.slice(0, 200);
}

export async function saveCreatorTrend(input: { blogId?: string | null; category?: string; date?: string; text: string }) {
  if(!input.blogId||!await q1("SELECT id FROM blogs WHERE id=$1",[input.blogId]))throw new WorkflowError("자료를 저장할 블로그를 먼저 선택해 주세요.");
  const items = parseTrendText(input.text ?? "");
  if (!items.length) throw new WorkflowError("붙여 넣은 내용에서 키워드를 찾지 못했습니다. 한 줄에 키워드 하나씩 붙여 넣어 주세요.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? input.date! : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const id = newId("snap_");
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,$2,'creator_advisor',$3,$4)", [
    id,
    input.blogId || null,
    j({ category: input.category?.trim() ?? "", date }),
    j({ items }),
  ]);
  return { id, count: items.length };
}

type Row = { id: string; blog_id: string | null; query: { category: string; date: string }; data: { items: { rank: number; keyword: string }[] }; collected_at: string };

export async function listCreatorTrends(blogId: string, limit = 20): Promise<CreatorTrend[]> {
  if(!blogId)throw new WorkflowError("자료를 확인할 블로그를 먼저 선택해 주세요.");
  const rows = await q<Row>(
    `SELECT * FROM research_snapshots WHERE source='creator_advisor' AND blog_id=$1 ORDER BY collected_at DESC LIMIT $2`,[blogId,limit],
  );
  return rows.map((r) => ({ id: r.id, blog_id: r.blog_id, category: r.query.category, date: r.query.date, items: r.data.items.map(item=>({...item,keyword:cleanCreatorKeyword(item.keyword)})).filter(item=>item.keyword), collected_at: r.collected_at }));
}

/** AI 프롬프트용: 이 블로그의 최근 14일 유입 트렌드 (최대 30개) */
export async function creatorTrendContext(blogId: string): Promise<string> {
  const rows = (await listCreatorTrends(blogId, 5)).filter((r) => Date.now() - new Date(r.date + "T00:00:00+09:00").getTime() < 14 * 86400e3);
  if (!rows.length) return "";
  const kws = Array.from(new Set(rows.flatMap((r) => r.items.map((i) => i.keyword)))).slice(0, 30);
  const dates = rows.map((r) => r.date).sort();
  return `\n[최근 네이버 유입 트렌드 - 크리에이터 어드바이저, 사용자가 붙여 넣은 실제 데이터, 기준일 ${dates[0]}${dates.length > 1 ? ` ~ ${dates[dates.length - 1]}` : ""}]\n${kws.join(", ")}\n이 트렌드와 블로그 주제가 겹치는 부분을 우선 반영하세요.\n`;
}
