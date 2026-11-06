import Link from "next/link";
import { HOT_TABS, hotTab } from "@/lib/blog-hot";
import { fmtDate } from "@/components/ui";
import { listBlogs } from "@/lib/repo";
import { googleTrends } from "@/lib/hot-report";
import HotReportView from "./HotReport";

const g = globalThis as unknown as { __gtrends?: { at: number; list: Awaited<ReturnType<typeof googleTrends>> } };
async function cachedTrends() {
  if (g.__gtrends && Date.now() - g.__gtrends.at < 30 * 60 * 1000) return g.__gtrends.list;
  try {
    const list = await googleTrends();
    g.__gtrends = { at: Date.now(), list };
    return list;
  } catch {
    return g.__gtrends?.list ?? [];
  }
}

export const dynamic = "force-dynamic";

const hintOf = (t: string) => t.replace(/#\S+/g, "").replace(/[\[\(【].*?[\]\)】]/g, " ").replace(/[|｜·•!?~"'“”‘’,]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const ago = (ms: number) => {
  const h = Math.floor((Date.now() - ms) / 3600000);
  return h < 1 ? "방금" : h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
};

export default async function Hot({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const tab = HOT_TABS.find((t) => t.id === sp.c) ?? HOT_TABS[0];
  const data = await hotTab(tab.id);
  const blogs = (await listBlogs()).map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const gt = await cachedTrends();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📰 블로그 핫이슈</h1>
          <p className="sub">네이버 블로그 홈 &apos;주제별 보기&apos;에 지금 올라오는 글 중 공감·댓글이 많은 순서예요. 자주 나오는 단어는 지금 블로거들이 몰리는 주제예요. (1시간마다 새로 불러옴 · {fmtDate(new Date(data.at).toISOString())})</p>
        </div>
        <Link href="/trends" className="btn btn-sm">🎬 유튜브 트렌드</Link>
      </div>

      <HotReportView blogs={blogs} />

      {!!gt.length && (
        <section className="card card-pad stack" style={{ gap: 8, marginBottom: 16 }}>
          <b className="small">🌐 구글 트렌드 · 지금 한국에서 뜨는 검색어</b>
          <div className="row" style={{ gap: 6 }}>
            {gt.map((t) => (
              <a key={t.title} href={t.news[0]?.url ?? `https://trends.google.com/trends/explore?geo=KR&q=${encodeURIComponent(t.title)}`} target="_blank" rel="noreferrer" className="badge" style={{ padding: "4px 10px", fontSize: 13 }} title={t.news.map((n) => n.title).join("\n")}>
                {t.title} <span className="muted">{t.traffic}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <h2 style={{ fontSize: 15, margin: "4px 0 10px" }}>📰 네이버 블로그 홈 · 주제별 반응 많은 글</h2>
      <nav className="trend-tabs" aria-label="주제">
        {HOT_TABS.map((t) => (
          <Link key={t.id} href={t.id === "all" ? "/hot" : `/hot?c=${t.id}`} scroll={false} className={`trend-tab ${t.id === tab.id ? "on" : ""}`}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </Link>
        ))}
      </nav>

      {data.error && <div className="notice notice-warn small" style={{ marginBottom: 12 }}>{data.error}</div>}

      {!!data.words.length && (
        <section className="card card-pad stack" style={{ gap: 8, marginBottom: 16 }}>
          <b className="small">지금 많이 나오는 단어 · 누르면 그 단어로 키워드 추천 시작</b>
          <div className="row" style={{ gap: 6 }}>
            {data.words.map((w) => (
              <Link key={w.word} href={`/new?hint=${encodeURIComponent(w.word)}`} className="badge badge-accent" style={{ padding: "4px 10px", fontSize: 13 }}>
                {w.word} <span style={{ opacity: 0.7 }}>{w.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.posts.length ? (
        <div className="trend-grid">
          {data.posts.slice(0, 40).map((p, i) => (
            <article key={p.id} className="card trend-card">
              <a href={p.url} target="_blank" rel="noreferrer" className="trend-thumb" style={{ aspectRatio: "4 / 3", background: "var(--panel-2)", display: "block", position: "relative", overflow: "hidden" }}>
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="muted small" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>사진 없음</span>
                )}
                <span className="badge" style={{ position: "absolute", left: 8, top: 8, background: "rgba(0,0,0,.65)", color: "#fff" }}>{i + 1}위</span>
              </a>
              <div className="trend-body stack" style={{ gap: 6, padding: 12 }}>
                <a href={p.url} target="_blank" rel="noreferrer" className="trend-title small" style={{ fontWeight: 700 }}>{p.title}</a>
                <div className="tiny muted">{p.topic ? `${p.topic} · ` : ""}{p.nickname} · {ago(p.at)}</div>
                <div className="tiny">❤️ {p.likes.toLocaleString("ko-KR")} · 💬 {p.comments.toLocaleString("ko-KR")}</div>
                <Link className="btn btn-sm" href={`/new?hint=${encodeURIComponent(hintOf(p.title))}`}>✍️ 글감으로</Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !data.error && <div className="card empty">불러온 글이 없어요.</div>
      )}
    </div>
  );
}
