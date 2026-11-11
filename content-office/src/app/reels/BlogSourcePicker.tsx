"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type Pub = { title: string; url: string; blogId: string; likes: number | null; comments: number | null; views: number | null };
type AppPost = { id: string; title: string; blog_id: string };
type Data = { blogs: { id: string; name: string }[]; published: Pub[]; posts: AppPost[]; viewPeriods: Record<string, string> };
export type BlogSource = { title: string; text: string; url: string };

// 캐러셀과 같은 정렬: 조회수 기록 있는 글 먼저(많은 순), 없으면 공감+댓글 순
const comparePosts = (a: Pub, b: Pub) => {
  if (a.views != null && b.views == null) return -1;
  if (a.views == null && b.views != null) return 1;
  return (b.views ?? 0) - (a.views ?? 0) || ((b.likes ?? 0) + (b.comments ?? 0) * 3) - ((a.likes ?? 0) + (a.comments ?? 0) * 3);
};

/** 릴스 대본용 블로그 글 고르기 — 캐러셀 '블로그 글에서 만들기'와 같은 모양·검색 방식 */
export default function BlogSourcePicker({ value, onPick }: { value: BlogSource | null; onPick: (s: BlogSource | null) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [pickBlog, setPickBlog] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ title: string; url: string }[] | null>(null);
  const [foundNext, setFoundNext] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    try { const d = await api<Data>("/api/reels/sources"); setData(d); setPickBlog((cur) => cur || d.blogs[0]?.id || ""); }
    catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  // 검색: 띄어쓰기로 나눈 단어가 제목에 모두 들어 있으면 (순서·붙여쓰기 상관없이 단어별로)
  const isUrl = /^https?:\/\//.test(query.trim());
  const words = isUrl ? [] : query.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hit = (t: string) => words.every((w) => t.normalize("NFKC").toLowerCase().includes(w));

  async function searchOld(start = 1) {
    setBusy("search"); setErr("");
    try {
      const r = await api<{ items: { title: string; url: string }[]; nextStart: number | null }>(`/api/carousels/sources/search?blogId=${encodeURIComponent(pickBlog)}&query=${encodeURIComponent(query.trim())}&start=${start}`);
      setFound((old) => (start === 1 ? r.items : [...(old ?? []), ...r.items])); setFoundNext(r.nextStart);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  async function refresh() {
    setBusy("refresh"); setErr(""); setNote("");
    try {
      const r = await api<{ count: number; at: string }>("/api/carousels/sources/refresh", "POST", { blogId: pickBlog });
      setNote(`${data?.blogs.find((b) => b.id === pickBlog)?.name ?? "블로그"} 공개 글 목록 ${r.count}개 확인 · ${fmtDate(r.at)}`);
      await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  async function pick(key: string, body: { url?: string; postId?: string }, title: string) {
    setBusy(key); setErr("");
    try {
      const s = await api<{ title: string; text: string; url: string }>("/api/repurpose", "POST", { action: "load", ...body });
      onPick({ title: s.title || title, text: s.text, url: s.url || body.url || "" });
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  if (value) return (
    <div className="row small" style={{ gap: 6, flexWrap: "nowrap" }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 <b>{value.title}</b> <span className="tiny muted">({value.text.length.toLocaleString()}자)</span></span>
      <button className="btn btn-sm btn-ghost" onClick={() => onPick(null)}>다른 글</button>
    </div>
  );
  if (!data) return <span className="tiny muted">{err || <><span className="spinner" /> 블로그 글 불러오는 중…</>}</span>;

  const pub = data.published.filter((p) => p.blogId === pickBlog && hit(p.title)).sort(comparePosts);
  const mine = data.posts.filter((p) => p.blog_id === pickBlog && hit(p.title) && !data.published.some((x) => x.blogId === pickBlog && x.title.trim() === p.title.trim()));
  const old = words.length && found ? found.filter((f) => !data.published.some((x) => x.url === f.url)) : [];
  const row = (key: string, title: string, body: { url?: string; postId?: string }, tag: string, st?: Pub) => (
    <div key={key} className="row" style={{ flexWrap: "nowrap", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
      <span className="tiny muted" style={{ flexShrink: 0, width: 54 }}>{tag}</span>
      <span className="small ellipsis" style={{ flex: 1, minWidth: 0 }} title={title}>{title}</span>
      <span className="tiny muted" style={{ flexShrink: 0, textAlign: "right" }}>
        {st ? <>{st.views != null ? <>👁 {st.views.toLocaleString("ko-KR")}</> : "조회수 기록 없음"}{st.likes != null && <> · ❤️ {st.likes.toLocaleString("ko-KR")} · 💬 {(st.comments ?? 0).toLocaleString("ko-KR")}</>}</> : ""}
      </span>
      <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void pick(key, body, title)}>{busy === key ? <span className="spinner" /> : "고르기"}</button>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <nav className="trend-tabs" aria-label="블로그" style={{ marginBottom: 0, flex: 1 }}>
          {data.blogs.map((bl) => {
            const n = data.published.filter((p) => p.blogId === bl.id).length + data.posts.filter((p) => p.blog_id === bl.id).length;
            return <button key={bl.id} type="button" className={`trend-tab ${pickBlog === bl.id ? "on" : ""}`} onClick={() => { setPickBlog(bl.id); setFound(null); setFoundNext(null); }}>{bl.name} <span className="badge" style={{ padding: "0 6px" }}>{n}</span></button>;
          })}
        </nav>
        <button className="btn btn-sm" disabled={!!busy || !pickBlog} onClick={() => void refresh()}>{busy === "refresh" ? "최신 글 확인 중…" : "↻ 블로그 글 업데이트"}</button>
      </div>
      {note && <p className="notice small" role="status" style={{ margin: 0 }}>{note}</p>}
      <p className="tiny muted" style={{ margin: 0 }}>조회수 기준: {data.viewPeriods[pickBlog] ?? "저장된 조회수 기록 없음"}</p>
      <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
        <input className="input" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setFound(null); setFoundNext(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && query.trim() && !isUrl) void searchOld(); }} placeholder="🔍 글 제목·키워드 검색 또는 글 주소 붙여넣기" aria-label="블로그 글 검색 또는 주소" />
        {isUrl ? <button className="btn" disabled={!!busy} onClick={() => void pick("url", { url: query.trim() }, "")}>{busy === "url" ? <span className="spinner" /> : "주소로 불러오기"}</button>
          : <button className="btn" disabled={!!busy || !query.trim()} onClick={() => void searchOld()}>{busy === "search" ? "검색 중…" : "예전 글도 검색"}</button>}
      </div>
      {words.length > 0 && found && <div className="row" style={{ gap: 8 }}><span className="tiny muted" role="status">예전 글 검색 {found.length}개 (네이버 검색에 노출된 공개 글)</span>{foundNext && <button className="btn btn-sm" disabled={!!busy} onClick={() => void searchOld(foundNext)}>더 보기</button>}</div>}
      {!pub.length && !mine.length && !old.length ? (
        <p className="small muted" style={{ margin: 0 }}>{words.length ? <>최근 글에서 &apos;{query.trim()}&apos;을(를) 찾지 못했어요. 오른쪽 &apos;예전 글도 검색&apos;을 눌러 보세요.</> : "이 블로그에는 아직 고를 글이 없어요. 글 주소를 붙여넣거나 ↻ 블로그 글 업데이트를 눌러 보세요."}</p>
      ) : (
        <div className="card" style={{ maxHeight: 360, overflowY: "auto" }}>
          {pub.some((p) => p.views != null) && <div className="tiny muted" style={{ padding: "8px 10px" }}>조회수 높은 순 · 저장된 캡처 기록</div>}
          {pub.filter((p) => p.views != null).map((p) => row(`u:${p.url}`, p.title, { url: p.url }, "📷 발행", p))}
          {pub.some((p) => p.views == null) && <div className="tiny muted" style={{ padding: "8px 10px" }}>조회수 기록 없음 · 공감·댓글 순</div>}
          {pub.filter((p) => p.views == null).map((p) => row(`u:${p.url}`, p.title, { url: p.url }, "📷 발행", p))}
          {mine.map((p) => row(`p:${p.id}`, p.title, { postId: p.id }, "✍️ 앱 글"))}
          {old.map((f) => row(`o:${f.url}`, f.title, { url: f.url }, "🔎 예전 글"))}
        </div>
      )}
      {err && <p className="notice notice-bad small" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}
