import Link from "next/link";
import { listScraps, trendTab, TREND_TABS } from "@/lib/trends";
import { fmtDate } from "@/components/ui";
import TrendGrid from "./TrendGrid";

export const dynamic = "force-dynamic";

export default async function Trends({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string }> }) {
  const sp = await searchParams;
  const showScraps = sp.tab === "scraps";
  const tab = TREND_TABS.find((t) => t.id === (sp.c ?? "hot")) ?? TREND_TABS[0];
  const scraps = await listScraps();
  const data = showScraps ? null : await trendTab(tab.id);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>트렌드 뷰어</h1>
          <p className="sub">유튜브 한국 인기 급상승 영상입니다. 마음에 드는 건 📌 스크랩해 두고, ✍️ 글감으로 누르면 그 주제로 키워드 추천을 시작합니다.</p>
        </div>
        <Link href="/hot" className="btn btn-sm">📰 블로그 핫이슈</Link>
      </div>

      <nav className="trend-tabs" aria-label="카테고리">
        {TREND_TABS.map((t) => (
          <Link key={t.id} href={t.id === "hot" ? "/trends" : `/trends?c=${t.id}`} scroll={false} className={`trend-tab ${!showScraps && t.id === tab.id ? "on" : ""}`}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </Link>
        ))}
        <Link href="/trends?tab=scraps" scroll={false} className={`trend-tab ${showScraps ? "on" : ""}`}>
          <span aria-hidden>📌</span> 스크랩 {scraps.length > 0 && <span className="badge" style={{ padding: "0 6px" }}>{scraps.length}</span>}
        </Link>
      </nav>

      {showScraps ? (
        scraps.length ? (
          <TrendGrid
            videos={scraps.map((s) => ({ id: s.item_id, title: s.title, channel: s.channel, thumbnail: s.thumbnail, url: s.url, views: s.views ?? 0, publishedAt: "", scrappedAt: s.created_at, category: s.category }))}
            scrapped={scraps.map((s) => s.item_id)}
            category="스크랩"
            ranked={false}
          />
        ) : (
          <div className="card empty">아직 스크랩한 영상이 없습니다. 카테고리 탭에서 📌 스크랩을 눌러 모아 두세요.</div>
        )
      ) : !data?.connected ? (
        <div className="card empty">YouTube API 키가 연결되지 않았습니다. 설정에서 YOUTUBE_API_KEY를 확인해 주세요.</div>
      ) : (
        <>
          {(tab.blog || tab.note) && (
            <div className="row small" style={{ gap: 8, marginBottom: 12 }}>
              {tab.blog && <span className="badge badge-accent">✍️ {tab.blog} 글감</span>}
              {tab.note && <span className="muted">{tab.note} · 최근 {tab.days}일 영상 · 묶음별 &apos;뜨는 속도(시간당 조회수)&apos; 순</span>}
            </div>
          )}
          {data.error && <div className="notice notice-warn small" style={{ marginBottom: 12 }}>{data.error}</div>}
          {data.videos.length ? (
            <TrendGrid
              key={tab.id}
              videos={data.videos.map((v) => ({ id: v.id, title: v.title, channel: v.channel, thumbnail: v.thumbnail, url: v.url, views: v.views, publishedAt: v.publishedAt, seconds: v.seconds, likes: v.likes, group: v.group, perHour: data.ranked === "speed" ? v.perHour : undefined }))}
              groups={data.groups.length > 1 ? data.groups : []}
              scrapped={scraps.map((s) => s.item_id)}
              category={tab.label}
              ranked
            />
          ) : (
            !data.error && <div className="card empty">지금은 이 탭에 보여 줄 영상이 없습니다.</div>
          )}
          {data.at > 0 && <p className="tiny muted" style={{ marginTop: 12 }}>{fmtDate(new Date(data.at).toISOString())} 기준 · {data.nextRefreshHours >= 1 ? `${data.nextRefreshHours}시간` : "30분"}마다 새로 불러옵니다 · YouTube Data API 공식 데이터</p>}
        </>
      )}
    </div>
  );
}
