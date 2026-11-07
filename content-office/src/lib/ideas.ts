import "server-only";
import { q, q1, newId } from "./db";

/**
 * 💡 아이디어 노트: 한 줄 메모 + 블로그 + 참고 링크
 * - 저장·수정·이동만 하고 AI는 부르지 않음 (비용 없음)
 * - 구체화: '할 일 만들기' → /todos 로 내용 채워 넘김, '글 기획으로 보내기' → /new 로 블로그·방향 채워 넘김
 */

export type Idea = { id: string; memo: string; category: string; detail: string; blog_id: string | null; link: string; source: string; created_at: string; updated_at: string; blog_name?: string | null };

const cleanLink = (s: unknown) => {
  const v = String(s ?? "").trim().slice(0, 500);
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(u.protocol) ? u.href : "";
  } catch {
    throw new Error("참고 링크 주소를 확인해 주세요.");
  }
};

const CATS = ["blog", "insta", "youtube", "etc"];
/** 큰 분류·세부 정리: 블로그를 고르면 세부 = 블로그 이름 (blog_id 함께 저장), 블로그가 아니면 blog_id 없음 */
function cleanCat(input: { category?: string; detail?: string; blog_id?: string | null }, cur?: Idea) {
  let category = input.category === undefined ? cur?.category ?? "" : String(input.category);
  if (!CATS.includes(category)) category = "";
  let blog_id = input.blog_id === undefined ? cur?.blog_id ?? null : input.blog_id || null;
  if (!category && blog_id) category = "blog";
  if (category !== "blog") blog_id = null;
  const detail = blog_id ? "" : String(input.detail === undefined ? cur?.detail ?? "" : input.detail).trim().slice(0, 60);
  return { category, detail, blog_id };
}

export async function listIdeasNotes(search = "") {
  const s = search.trim();
  return q<Idea>(
    `SELECT i.*, b.name AS blog_name FROM ideas_notes i LEFT JOIN blogs b ON b.id=i.blog_id
     ${s ? "WHERE i.memo ILIKE $1 OR i.link ILIKE $1" : ""} ORDER BY i.updated_at DESC LIMIT 300`,
    s ? [`%${s}%`] : [],
  );
}

export async function getIdea(id: string) {
  return q1<Idea>("SELECT i.*, b.name AS blog_name FROM ideas_notes i LEFT JOIN blogs b ON b.id=i.blog_id WHERE i.id=$1", [id]);
}

export async function createIdea(input: { memo?: string; category?: string; detail?: string; blog_id?: string | null; link?: string; source?: string }) {
  const memo = String(input.memo ?? "").trim().slice(0, 500);
  if (!memo) throw new Error("메모를 한 줄 적어 주세요.");
  const id = newId("idea_");
  const c = cleanCat(input);
  await q("INSERT INTO ideas_notes (id, memo, category, detail, blog_id, link, source) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, memo, c.category, c.detail, c.blog_id, cleanLink(input.link), String(input.source ?? "").slice(0, 120)]);
  return getIdea(id);
}

export async function updateIdea(id: string, input: { memo?: string; category?: string; detail?: string; blog_id?: string | null; link?: string }) {
  const cur = await getIdea(id);
  if (!cur) throw new Error("아이디어를 찾을 수 없습니다.");
  const memo = String(input.memo ?? cur.memo).trim().slice(0, 500);
  if (!memo) throw new Error("메모를 한 줄 적어 주세요.");
  const c = cleanCat(input, cur);
  await q("UPDATE ideas_notes SET memo=$2, category=$3, detail=$4, blog_id=$5, link=$6, updated_at=NOW() WHERE id=$1", [id, memo, c.category, c.detail, c.blog_id, input.link === undefined ? cur.link : cleanLink(input.link)]);
  return getIdea(id);
}

export async function deleteIdea(id: string) {
  // 바로 지우지 않고 휴지통으로 (30일 뒤 자동 완전 삭제)
  await (await import("./trash-snap")).snapToTrash("idea", id);
}
