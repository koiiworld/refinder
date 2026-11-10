"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type Made = { id: string; title: string; blog_id: string | null; slides: number; updated_at: string; fromPost: boolean };
const comparePosts = (a: {likes:number|null;comments:number|null;views:number|null}, b: {likes:number|null;comments:number|null;views:number|null}) => {
  if(a.views!=null&&b.views==null)return -1;
  if(a.views==null&&b.views!=null)return 1;
  return (b.views??0)-(a.views??0) || ((b.likes??0)+(b.comments??0)*3)-((a.likes??0)+(a.comments??0)*3);
};

type Idea = { topic: string; format: string; hook: string; why: string };

export default function NewCarousel({ posts, published, blogs, made, formats, defaultFrom, defaultBlog, viewPeriods={} }: { viewPeriods?:Record<string,string>; posts: { id: string; title: string; blog_id: string; blog_name: string; madeId?: string | null }[]; published: { title: string; url: string; blogId: string; blog_name: string; likes: number | null; comments: number | null; views: number | null; madeId?: string | null }[]; made: Made[]; blogs: { id: string; name: string; category: string }[]; formats: { id: string; label: string }[]; defaultFrom?: string; defaultBlog?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"post" | "topic">(defaultFrom === "topic" ? "topic" : "post");
  const [pickBlog, setPickBlog] = useState(blogs.some((b) => b.id === defaultBlog) ? defaultBlog! : blogs[0]?.id ?? "");
  const [creating, setCreating] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [found, setFound] = useState<{ title: string; url: string }[] | null>(null);
  const [foundNext, setFoundNext] = useState<number | null>(null);
  const isUrl = /^https?:\/\//.test(postUrl.trim());
  const words = isUrl ? [] : postUrl.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hit = (t: string) => words.every((w) => t.normalize("NFKC").toLowerCase().includes(w));
  async function searchOld(start = 1) {
    setBusy("search"); setErr("");
    try {
      const r = await api<{ items: { title: string; url: string }[]; nextStart: number | null }>(`/api/carousels/sources/search?blogId=${encodeURIComponent(pickBlog)}&query=${encodeURIComponent(postUrl.trim())}&start=${start}`);
      setFound((old) => (start === 1 ? r.items : [...(old ?? []), ...r.items])); setFoundNext(r.nextStart);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  const [niche, setNiche] = useState("생활 꿀팁");
  const [blogId, setBlogId] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("save");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [refreshNote,setRefreshNote]=useState("");
  async function refreshPosts(){setBusy("refresh");setErr("");setRefreshNote("");try{const r=await api<{count:number;at:string}>("/api/carousels/sources/refresh","POST",{blogId:pickBlog});setRefreshNote(`${blogs.find(b=>b.id===pickBlog)?.name??"블로그"} 공개 글 목록 ${r.count}개 확인 · ${fmtDate(r.at)} (한국 시간)`);router.refresh();}catch(e){setErr((e as Error).message);}finally{setBusy("");}}

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

  const shown = made.filter((c) => (mode === "post" ? c.fromPost && c.blog_id === pickBlog : !c.fromPost));
  return (
    <>
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn-sm ${mode === "post" ? "btn-primary" : ""}`} onClick={() => setMode("post")}>📝 블로그 글에서 만들기</button>
        <button className={`btn btn-sm ${mode === "topic" ? "btn-primary" : ""}`} onClick={() => setMode("topic")}>💡 주제로 따로 만들기</button>
        {mode==="post"&&<button className="btn btn-sm" style={{marginLeft:'auto'}} disabled={!!busy||!pickBlog} onClick={refreshPosts}>{busy==="refresh"?'최신 글 확인 중…':'↻ 블로그 글 업데이트'}</button>}
      </div>

      {refreshNote&&<p className="notice small" role="status">{refreshNote}</p>}
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
          <p className="tiny muted" style={{margin:0}} role="status">조회수 기준: {viewPeriods[pickBlog]??"저장된 조회수 기록 없음"}</p>
          <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
            <input className="input" type="search" value={postUrl} onChange={(e) => { setPostUrl(e.target.value); setFound(null); setFoundNext(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && postUrl.trim() && !isUrl) void searchOld(); }} placeholder="🔍 글 제목·키워드 검색 또는 글 주소 붙여넣기" aria-label="블로그 글 검색 또는 주소" />
            {isUrl ? <button className="btn" disabled={!!busy} onClick={() => create({ url: postUrl.trim(), blogId: pickBlog || null })}>주소로 만들기</button>
              : <button className="btn" disabled={!!busy || !postUrl.trim()} onClick={() => void searchOld()}>{busy === "search" ? "검색 중…" : "예전 글도 검색"}</button>}
          </div>
          {words.length > 0 && found && <div className="row" style={{ gap: 8 }}><span className="tiny muted" role="status">예전 글 검색 {found.length}개 (네이버 검색에 노출된 공개 글)</span>{foundNext && <button className="btn btn-sm" disabled={!!busy} onClick={() => void searchOld(foundNext)}>더 보기</button>}
          </div>}
          {(() => {
            const pub = published.filter((p) => p.blogId === pickBlog && hit(p.title)).sort(comparePosts);
            const mine = posts.filter((p) => p.blog_id === pickBlog && hit(p.title) && !published.some((x) => x.blogId === pickBlog && x.title.trim() === p.title.trim()));
            const row = (key: string, title: string, payload: Record<string, unknown>, tag: string, st?: { likes: number | null; comments: number | null; views: number | null }, madeId?: string | null) => (
              <div key={key} className="row" style={{ flexWrap: "nowrap", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
                <span className="tiny muted" style={{ flexShrink: 0, width: 54 }}>{tag}</span>
                <span className="small ellipsis" style={{ flex: 1 }} title={title}>{title}</span>
                <span className="tiny muted" style={{ flexShrink: 0, width: 154, textAlign: "right" }} title={viewPeriods[pickBlog]??"저장된 조회수 기록 기준"}>
                  {st ? <>{st.views != null ? <>👁 {st.views.toLocaleString("ko-KR")}</> : <span>조회수 기록 없음</span>}{st.likes != null&&<> · ❤️ {st.likes.toLocaleString("ko-KR")} · 💬 {(st.comments ?? 0).toLocaleString("ko-KR")}</>}</> : ""}
                </span>
                {madeId ? <Link className="btn btn-sm" href={`/carousels/${madeId}`} title="이미 만든 캐러셀 열기">✅ 열기</Link> : <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => create(payload)}>{busy === "create" && creating === key ? <span className="spinner" /> : "만들기"}</button>}
              </div>
            );
            if (!pub.length && !mine.length && !(words.length && found?.length)) return words.length ? <p className="small muted" style={{ margin: 0 }}>최근 글에서 &apos;{postUrl.trim()}&apos;을(를) 찾지 못했어요. 오른쪽 &apos;예전 글도 검색&apos;을 눌러 보세요.</p> : <p className="small muted" style={{ margin: 0 }}>이 블로그에는 아직 고를 글이 없어요. 아래에 글 주소를 넣거나 &apos;주제로 따로 만들기&apos;를 써 보세요.</p>;
            return (
              <div className="card" style={{ maxHeight: 360, overflowY: "auto" }}>
                {pub.some(p=>p.views!=null)&&<div className="tiny muted" style={{padding:'8px 10px'}}>조회수 높은 순 · 저장된 캡처 기록</div>}
                {pub.filter(p=>p.views!=null).map((p) => row(`u:${p.url}`, p.title, { url: p.url, blogId: p.blogId }, "📷 발행", p, p.madeId))}
                {pub.some(p=>p.views==null)&&<div className="tiny muted" style={{padding:'8px 10px'}}>조회수 기록 없음 · 공감·댓글 순</div>}
                {pub.filter(p=>p.views==null).map((p) => row(`u:${p.url}`, p.title, { url: p.url, blogId: p.blogId }, "📷 발행", p, p.madeId))}
                {mine.map((p) => row(`p:${p.id}`, p.title, { projectId: p.id }, "✍️ 앱 글", undefined, p.madeId))}
                {words.length > 0 && found?.filter((f) => !published.some((x) => x.url === f.url)).map((f) => row(`u:${f.url}`, f.title, { url: f.url, blogId: pickBlog }, "🔎 예전 글"))}
              </div>
            );
          })()}
          <p className="tiny muted" style={{ margin: 0 }}>📷 발행 = 블로그에 올린 글 (올린 사진 그대로 사용) · ✍️ 앱 글 = 앱에서 쓰고 아직 안 올린 글 · 블로그 진단과 같은 최근 7개 일간 캡처 합계로 정렬 · 기록 없는 글은 별도로 공감·댓글 순으로 표시해요 · 이미 만든 글은 순위에 그대로 두고 ‘✅ 열기’로 표시해요</p>
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
    <section className="card">
      <div className="card-head"><h2 style={{ fontSize: 15 }}>만든 캐러셀 · {mode === "post" ? blogs.find((b) => b.id === pickBlog)?.name ?? "" : "주제로 만든 것"} ({shown.length})</h2></div>
      <div className="card-pad stack" style={{ gap: 6 }}>
        {shown.map((c) => (
          <Link key={c.id} href={`/carousels/${c.id}`} className="row between card card-pad" style={{ padding: 10, flexWrap: "nowrap" }}>
            <span className="small ellipsis" style={{ flex: 1 }}><b>{c.title}</b> <span className="tiny muted">· {c.slides}장</span></span>
            <span className="tiny muted">{fmtDate(c.updated_at)}</span>
          </Link>
        ))}
      </div>
    </section>
    </>
  );
}
