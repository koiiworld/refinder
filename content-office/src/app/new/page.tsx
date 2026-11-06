import { redirect } from "next/navigation";

/** 글 만들기는 '블로그 업로드'(/posts) 위쪽 '새 글 만들기'로 합쳐짐 — 예전 주소·링크(?blog=&hint=)는 그대로 넘김 */
export default async function NewPost({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ new: "1" });
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
  redirect(`/posts?${p.toString()}#new`);
}
