"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";

type Post = { title: string; url: string };
type List = { blogId: string; blogs: { id: string; name: string; color: string }[]; posts: Post[] };
export type BlogSource = { title: string; text: string; url: string };

/** 릴스 대본용 블로그 글 고르기: 블로그별 최근 글 · 내 블로그 검색 · 🔄 새로고침 (최신 글 다시 불러오기) */
export default function BlogSourcePicker({ value, onPick }: { value: BlogSource | null; onPick: (s: BlogSource | null) => void }) {
  const [list, setList] = useState<List | null>(null);
  const [blogId, setBlogId] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function loadList(id = blogId) {
    setErr("");
    try { const l = await api<List>(`/api/reels/sources${id ? `?blogId=${encodeURIComponent(id)}` : ""}`); setList(l); setBlogId(l.blogId); }
    catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void loadList(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setBusy("refresh"); setErr("");
    try { await api("/api/carousels/sources/refresh", "POST", { blogId }); await loadList(blogId); setFound(null); }
    catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  async function search() {
    if (!query.trim()) { setFound(null); return; }
    setBusy("search"); setErr("");
    try { setFound((await api<{ items: Post[] }>(`/api/carousels/sources/search?blogId=${encodeURIComponent(blogId)}&query=${encodeURIComponent(query.trim())}`)).items ?? []); }
    catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  async function pick(p: Post) {
    setBusy(p.url); setErr("");
    try {
      const s = await api<{ title: string; text: string; url: string }>("/api/repurpose", "POST", { action: "load", url: p.url });
      onPick({ title: s.title || p.title, text: s.text, url: p.url });
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  if (value) return (
    <div className="row small" style={{ gap: 6, flexWrap: "nowrap" }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 <b>{value.title}</b> <span className="tiny muted">({value.text.length.toLocaleString()}자)</span></span>
      <button className="btn btn-sm btn-ghost" onClick={() => onPick(null)}>다른 글</button>
    </div>
  );

  const posts = found ?? list?.posts ?? [];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {(list?.blogs ?? []).map((b) => <button key={b.id} className={`chip${blogId === b.id ? " on" : ""}`} onClick={() => { setFound(null); setQuery(""); void loadList(b.id); }}><span className="blog-dot" style={{ background: b.color }} /> {b.name}</button>)}
        <button className="btn btn-sm btn-ghost" disabled={!blogId || !!busy} onClick={() => void refresh()} title="블로그에 새로 올린 글까지 다시 불러와요">{busy === "refresh" ? <span className="spinner" /> : "🔄 새로고침"}</button>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} placeholder="내 블로그 글 검색 (예: 닭한마리)" aria-label="블로그 글 검색" />
        <button className="btn btn-sm" disabled={!blogId || !!busy} onClick={() => void search()}>{busy === "search" ? <span className="spinner" /> : "검색"}</button>
        {found && <button className="btn btn-sm btn-ghost" onClick={() => { setFound(null); setQuery(""); }}>최근 글</button>}
      </div>
      <div className="list" style={{ maxHeight: 200, overflowY: "auto" }}>
        {posts.map((p) => (
          <button key={p.url} className="list-item small" style={{ textAlign: "left" }} disabled={!!busy} onClick={() => void pick(p)}>
            {busy === p.url ? <span className="spinner" /> : null} {p.title}
          </button>
        ))}
        {list && !posts.length && <div className="list-item tiny muted">{found ? "검색 결과가 없어요." : "글을 못 불러왔어요. 🔄 새로고침을 눌러 보세요."}</div>}
      </div>
      {err && <p className="notice notice-bad small">{err}</p>}
    </div>
  );
}
