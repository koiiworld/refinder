"use client";

import { useEffect, useState } from "react";
import { api, useToast } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type Ch = { id: string; label: string; hint: string };
type Doc = { id: string; blog_id: string | null; project_id: string | null; title: string; source_url: string; source_text: string; result: Record<string, string>; updated_at: string };
type Src = { title: string; text: string; blogId: string | null; postId: string | null; url: string };
type Tab = "published" | "app" | "url" | "paste";

export default function RepurposeBoard({ blogs, published, appPosts, channels, history: initialHistory, initialPost, initialUrl }: {
  blogs: { id: string; name: string; color: string }[];
  published: { title: string; url: string; blogId: string }[];
  appPosts: { id: string; title: string; blogId: string }[];
  channels: Ch[];
  history: Doc[];
  initialPost: string;
  initialUrl: string;
}) {
  const [tab, setTab] = useState<Tab>(initialPost ? "app" : initialUrl ? "url" : "published");
  const [blog, setBlog] = useState(blogs[0]?.id ?? "");
  const [url, setUrl] = useState(initialUrl);
  const [src, setSrc] = useState<Src | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string[]>(["reel", "cards", "threads", "insta"]);
  const [history, setHistory] = useState(initialHistory);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useToast();
  const blogName = (id: string | null) => blogs.find((b) => b.id === id)?.name ?? "";

  async function load(body: { postId?: string; url?: string }) {
    setBusy("load");
    setErr("");
    try {
      setSrc(await api<Src>("/api/repurpose", "POST", { action: "load", ...body }));
      setDocId(null);
      setResult({});
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }
  useEffect(() => {
    if (initialPost) void load({ postId: initialPost });
    else if (initialUrl) void load({ url: initialUrl });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function make() {
    if (!src) return;
    setBusy("make");
    setErr("");
    try {
      const d = await api<Doc>("/api/repurpose", "POST", { action: "make", id: docId ?? undefined, title: src.title, text: src.text, blogId: src.blogId, postId: src.postId, url: src.url, channels: pick });
      setDocId(d.id);
      setResult(d.result);
      setHistory([d, ...history.filter((h) => h.id !== d.id)]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }
  const copy = async (t: string, w: string) => {
    await navigator.clipboard.writeText(t);
    setToast(`${w} 복사됨`);
  };
  const done = channels.filter((c) => result[c.id]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {toast}
      <section className="card">
        <div className="reel-tabs" role="tablist" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {([["published", "내 블로그에 올린 글"], ["app", "앱에서 만든 글"], ["url", "글 주소로"], ["paste", "직접 붙여넣기"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="card-pad stack" style={{ gap: 8 }}>
          {tab === "published" && (
            <>
              <div className="row" style={{ gap: 6 }}>
                {blogs.map((b) => <button key={b.id} className={`chip${blog === b.id ? " on" : ""}`} onClick={() => setBlog(b.id)}><span className="blog-dot" style={{ background: b.color }} /> {b.name}</button>)}
              </div>
              <div className="list rp-list">
                {published.filter((p) => p.blogId === blog).map((p) => (
                  <button key={p.url} className={`list-item rp-item${src?.url === p.url ? " on" : ""}`} disabled={busy === "load"} onClick={() => load({ url: p.url })}>{p.title}</button>
                ))}
                {!published.some((p) => p.blogId === blog) && <div className="list-item small muted">최근 글을 못 불러왔어요. &apos;글 주소로&apos;에 주소를 넣거나 &apos;직접 붙여넣기&apos;를 쓰세요.</div>}
              </div>
            </>
          )}
          {tab === "app" && (
            <div className="list rp-list">
              {appPosts.map((p) => (
                <button key={p.id} className={`list-item rp-item${src?.postId === p.id ? " on" : ""}`} disabled={busy === "load"} onClick={() => load({ postId: p.id })}>
                  {p.title} <span className="tiny muted">· {blogName(p.blogId)}</span>
                </button>
              ))}
              {!appPosts.length && <div className="list-item small muted">아직 앱에서 쓴 글이 없어요.</div>}
            </div>
          )}
          {tab === "url" && (
            <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
              <input className="input" inputMode="url" value={url} placeholder="https://blog.naver.com/아이디/글번호" onChange={(e) => setUrl(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={busy === "load" || !url.trim()} onClick={() => load({ url })}>{busy === "load" ? <span className="spinner" /> : "불러오기"}</button>
            </div>
          )}
          {tab === "paste" && (
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setSrc({ title: "", text: "", blogId: blogs[0]?.id ?? null, postId: null, url: "" }); setDocId(null); setResult({}); }}>✏️ 빈 칸에 붙여넣기</button>
          )}
          {busy === "load" && <span className="tiny muted"><span className="spinner" /> 글 불러오는 중…</span>}
          {err && <div className="notice notice-bad small">{err}</div>}
        </div>
      </section>

      {src && (
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <input className="input" style={{ fontWeight: 700 }} value={src.title} placeholder="제목" onChange={(e) => setSrc({ ...src, title: e.target.value })} aria-label="제목" />
          <textarea className="textarea" rows={8} value={src.text} placeholder="블로그 글 본문을 붙여넣으세요" onChange={(e) => setSrc({ ...src, text: e.target.value })} aria-label="본문" />
          <div className="row" style={{ gap: 6 }}>
            <span className="tiny muted">말투 기준 블로그</span>
            <select className="select" style={{ width: 200 }} value={src.blogId ?? ""} onChange={(e) => setSrc({ ...src, blogId: e.target.value || null })}>
              <option value="">정하지 않음</option>
              {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span className="tiny muted">본문 {src.text.length.toLocaleString()}자</span>
          </div>
          <div className="repurpose-pick">
            {channels.map((c) => (
              <label key={c.id} className={`chip${pick.includes(c.id) ? " on" : ""}`} title={c.hint}>
                <input type="checkbox" hidden checked={pick.includes(c.id)} onChange={() => setPick(pick.includes(c.id) ? pick.filter((x) => x !== c.id) : [...pick, c.id])} />
                {c.label}{result[c.id] ? " ✓" : ""}
              </label>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!!busy || !pick.length || src.text.trim().length < 50} onClick={make}>{busy === "make" ? <><span className="spinner" /> 만드는 중… (20~60초)</> : `📣 ${pick.length}개 채널 초안 만들기`}</button>
          <span className="tiny muted">고른 채널만 AI 1번으로 만들어요 (저렴한 모델). 원문에 없는 사실은 넣지 않아요. 같은 글에 채널을 더 고르면 결과에 추가돼요.</span>
          {done.map((c) => (
            <details key={c.id} className="card card-pad" open={done.length <= 2}>
              <summary className="small strong" style={{ cursor: "pointer" }}>{c.label}</summary>
              <pre className="repurpose-text">{result[c.id]}</pre>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => copy(result[c.id], c.label)}>복사</button>
                {c.id === "reel" && <a className="btn btn-sm" href={`/studio?prompt=${encodeURIComponent(result[c.id].slice(0, 1500))}`}>🎬 영상 스튜디오로</a>}
                {c.id === "cards" && (src.postId ? <a className="btn btn-sm" href={`/carousels?from=${src.postId}`}>📱 캐러셀로 만들기</a> : <a className="btn btn-sm" href="/carousels">📱 캐러셀로 만들기</a>)}
              </div>
            </details>
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>만든 기록 ({history.length})</h2></div>
          <div className="list">
            {history.map((h) => (
              <div key={h.id} className="list-item" style={{ gap: 8, flexWrap: "nowrap" }}>
                <button className="rp-item" style={{ flex: 1, textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer", minWidth: 0 }} onClick={() => { setSrc({ title: h.title, text: h.source_text, blogId: h.blog_id, postId: h.project_id, url: h.source_url }); setDocId(h.id); setResult(h.result); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span className="small strong ellipsis" style={{ display: "block" }}>{h.title}</span>
                  <span className="tiny muted">{channels.filter((c) => h.result[c.id]).map((c) => c.label.replace(/^\S+\s/, "")).join(" · ")} · {fmtDate(h.updated_at)}</span>
                </button>
                <button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm("지울까요?")) { await api(`/api/repurpose/${h.id}`, "DELETE"); setHistory(history.filter((x) => x.id !== h.id)); if (docId === h.id) { setDocId(null); setResult({}); } } }}>🗑</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
