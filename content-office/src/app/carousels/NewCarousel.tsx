"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

type Idea = { topic: string; format: string; hook: string; why: string };

export default function NewCarousel({ posts, published, blogs, formats, defaultFrom }: { posts: { id: string; title: string; blog_id: string; blog_name: string }[]; published: { title: string; url: string; blogId: string; blog_name: string }[]; blogs: { id: string; name: string; category: string }[]; formats: { id: string; label: string }[]; defaultFrom?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"post" | "topic">(defaultFrom === "topic" ? "topic" : "post");
  const [pickBlog, setPickBlog] = useState(blogs[0]?.id ?? "");
  const [creating, setCreating] = useState("");
  const [postUrl, setPostUrl] = useState("");

  const [niche, setNiche] = useState("생활 꿀팁");
  const [blogId, setBlogId] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("save");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function create(payload: Record<string, unknown>) {
    setCreating(String(payload.url ? `u:${payload.url}` : payload.projectId ? `p:${payload.projectId}` : ""));
    setBusy("create");
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/carousels", "POST", payload);
      router.push(`/carousels/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  async function recommend() {
    setBusy("ideas");
    setErr("");
    try {
      const r = await api<{ ideas: Idea[] }>("/api/carousels/ideas", "POST", { niche, blogId: blogId || null });
      setIdeas(r.ideas);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }

  const fmtLabel = (id: string) => formats.find((f) => f.id === id)?.label ?? id;

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn-sm ${mode === "post" ? "btn-primary" : ""}`} onClick={() => setMode("post")}>📝 블로그 글에서 만들기</button>
        <button className={`btn btn-sm ${mode === "topic" ? "btn-primary" : ""}`} onClick={() => setMode("topic")}>💡 주제로 따로 만들기</button>
      </div>

      {mode === "post" ? (
        <div className="stack" style={{ gap: 10 }}>
          <nav className="trend-tabs" aria-label="블로그" style={{ marginBottom: 0 }}>
            {blogs.map((bl) => {
              const n = published.filter((p) => p.blogId === bl.id).length + posts.filter((p) => p.blog_id === bl.id).length;
              return (
                <button key={bl.id} type="button" className={`trend-tab ${pickBlog === bl.id ? "on" : ""}`} onClick={() => setPickBlog(bl.id)}>
                  {bl.name} <span className="badge" style={{ padding: "0 6px" }}>{n}</span>
                </button>
              );
            })}
          </nav>
          {(() => {
            const pub = published.filter((p) => p.blogId === pickBlog);
            const mine = posts.filter((p) => p.blog_id === pickBlog && !pub.some((x) => x.title.trim() === p.title.trim()));
            const row = (key: string, title: string, payload: Record<string, unknown>, tag: string) => (
              <div key={key} className="row" style={{ flexWrap: "nowrap", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
                <span className="tiny muted" style={{ flexShrink: 0, width: 54 }}>{tag}</span>
                <span className="small ellipsis" style={{ flex: 1 }} title={title}>{title}</span>
                <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => create(payload)}>{busy === "create" && creating === key ? <span className="spinner" /> : "만들기"}</button>
              </div>
            );
            if (!pub.length && !mine.length) return <p className="small muted" style={{ margin: 0 }}>이 블로그에는 아직 고를 글이 없어요. 아래에 글 주소를 넣거나 &apos;주제로 따로 만들기&apos;를 써 보세요.</p>;
            return (
              <div className="card" style={{ maxHeight: 360, overflowY: "auto" }}>
                {pub.map((p) => row(`u:${p.url}`, p.title, { url: p.url, blogId: p.blogId }, "📷 발행"))}
                {mine.map((p) => row(`p:${p.id}`, p.title, { projectId: p.id }, "✍️ 앱 글"))}
              </div>
            );
          })()}
          <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
            <input className="input" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="또는 블로그 글 주소 붙여넣기 (네이버·티스토리)" aria-label="블로그 글 주소" />
            <button className="btn" disabled={!!busy || !/^https?:\/\//.test(postUrl.trim())} onClick={() => create({ url: postUrl.trim(), blogId: pickBlog || null })}>주소로 만들기</button>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>📷 발행 = 블로그에 올린 글 (올린 사진 그대로 사용) · ✍️ 앱 글 = 앱에서 쓰고 아직 안 올린 글</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 180 }} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="인스타 계정 분야 (예: 생활 꿀팁, 육아, 자취, 재테크, IT 꿀팁)" aria-label="계정 분야" />
            <select className="input" style={{ maxWidth: 200 }} value={blogId} onChange={(e) => { setBlogId(e.target.value); const b = blogs.find((x) => x.id === e.target.value); if (b) setNiche(b.category || b.name); }} aria-label="연결 블로그">
              <option value="">블로그 연결 안 함</option>
              {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="btn" disabled={!!busy} onClick={recommend}>{busy === "ideas" ? <><span className="spinner" /> 추천 중…</> : "✨ 저장 잘 되는 주제 추천"}</button>
          </div>
          {!!ideas.length && (
            <div className="carousel-ideas">
              {ideas.map((i, k) => (
                <div key={k} className="card card-pad stack" style={{ gap: 4, padding: 10 }}>
                  <span className="tiny muted">{fmtLabel(i.format)}</span>
                  <b className="small">{i.topic}</b>
                  {i.hook && <div className="small" style={{ color: "var(--accent)" }}>“{i.hook}”</div>}
                  <div className="tiny muted">{i.why}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => create({ topic: i.topic, format: i.format, niche, blogId: blogId || null })}>이걸로 만들기</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => { setTopic(i.topic); setFormat(i.format); }}>고쳐서 쓰기</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="직접 주제 적기 (예: 자취생 냉장고 정리 꿀팁 7가지)" aria-label="주제" />
            <select className="input" style={{ maxWidth: 240 }} value={format} onChange={(e) => setFormat(e.target.value)} aria-label="형식">
              {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!!busy || !topic.trim()} onClick={() => create({ topic, format, niche, blogId: blogId || null })}>{busy === "create" ? <><span className="spinner" /> 만드는 중…</> : "만들기"}</button>
          </div>
        </div>
      )}
      {err && <div className="notice notice-bad small">{err}</div>}
    </section>
  );
}
