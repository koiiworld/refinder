import Link from "next/link";
import { dashboardData, PASS_SCORE } from "@/lib/dashboard";
import { ensureWorker } from "@/lib/jobs";
import { fmtDate, fmtUsd, KRW_PER_USD } from "@/components/ui";
import { AiBalances, BlogTopButton, CostDays, HealthBanner, RevenueCard, TopKeywordsCard, TrendChart } from "./DashboardParts";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v == null ? "-" : Math.round(v).toLocaleString("ko-KR"));

export default async function Dashboard() {
  ensureWorker();
  const d = await dashboardData();
  const [y, m] = d.month.split("-").map(Number);
  const pubDelta = d.kpi.publishedThisMonth - d.kpi.publishedPrevSame;
  const seriesVar = (i: number) => `var(--series-${(i % 3) + 1})`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p className="sub">
            {y}년 {m}월 기준 · 앱에 실제로 기록된 숫자만 보여 줍니다. 수익은 각 정산 화면의 숫자를 직접 입력하세요.
          </p>
        </div>
        <Link href="/new" className="btn btn-primary">+ 글 만들기</Link>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {/* 고장 알림 */}
        <HealthBanner items={d.health} />
        {/* 핵심 지표 */}
        <div className="kpi-grid">
          <div className="card card-pad kpi">
            <div className="small muted">이번 달 발행 글</div>
            <div className="kpi-num">{d.kpi.publishedThisMonth}건</div>
            <div className={`tiny ${pubDelta > 0 ? "up" : pubDelta < 0 ? "down" : "muted"}`}>
              {pubDelta > 0 ? "▲" : pubDelta < 0 ? "▼" : "–"} 지난달 같은 기간 대비 {pubDelta > 0 ? `+${pubDelta}` : pubDelta}
            </div>
            <div className="tiny muted">⑦에서 &apos;발행 완료&apos;를 누른 글 · 완성(검수 끝) {d.kpi.completedThisMonth}건</div>
          </div>
          <div className="card card-pad kpi">
            <div className="small muted">1차 검수 통과율</div>
            <div className="kpi-num">{pct(d.kpi.firstPassRate)}</div>
            <div className="tiny muted">이번 달 첫 검수 {d.kpi.firstTotal}건 중 {d.kpi.firstPass}건이 {PASS_SCORE}점 이상</div>
          </div>
          <div className="card card-pad kpi">
            <div className="small muted">완성 글 평균 월간 검색량</div>
            <div className="kpi-num">{num(d.kpi.avgVolume)}</div>
            <div className="tiny muted">글 키워드의 네이버 검색광고 실제 검색수</div>
          </div>
        </div>

        {/* 수익 (직접 입력) */}
        <RevenueCard month={d.month} data={d.revenue.data} total={d.revenue.total} prevTotal={d.revenue.prevTotal} aiKrw={d.cost.monthUsd * KRW_PER_USD} coupang={d.revenue.coupang} goal={d.revenue.goal} />

        {/* AI 비용 */}
        <section className="card">
          <div className="card-head" style={{ flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 15 }}>AI 비용</h2>
            <span className="tiny muted">토큰 × 단가 추정치 · 실제 청구액은 각 사 사용량 페이지 기준</span>
          </div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div>
                <div className="small muted">이번 달 누적 ({m}/1~)</div>
                <div className="kpi-num">{fmtUsd(d.cost.monthUsd)}</div>
                <div className="tiny muted">AI 호출 {d.cost.monthCalls}회</div>
              </div>
              <div>
                <div className="small muted">오늘 (한국 시간 0시부터)</div>
                <div className="kpi-num" style={{ fontSize: 22 }}>{fmtUsd(d.cost.todayUsd)}</div>
                <div className="tiny muted">호출 {d.ops.todayCalls}회</div>
              </div>
              <div>
                <div className="small muted">완성 글 1편당</div>
                <div className="kpi-num" style={{ fontSize: 22 }}>{d.cost.perPost == null ? "-" : fmtUsd(d.cost.perPost)}</div>
                <div className="tiny muted">이번 달 비용 ÷ 완성 글 {d.kpi.completedThisMonth}편</div>
              </div>
            </div>
            <details className="fold">
              <summary className="small" style={{ color: "var(--accent)", cursor: "pointer" }}>자세히 보기 (최근 7일 · 오늘 단계별)</summary>
              <div className="stack" style={{ gap: 12, marginTop: 10 }}>
                <CostDays days={d.cost.days} />
                {d.cost.todaySteps.length > 0 && (
                  <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                    {d.cost.todaySteps.map((s) => (
                      <div key={s.step} className="list-item row between" style={{ flexWrap: "nowrap" }}>
                        <span className="small">{s.label}</span>
                        <b className="small" style={{ flexShrink: 0 }}>{fmtUsd(s.cost)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
            <AiBalances />
          </div>
        </section>

        {/* 방문자 비교(왼쪽) · 완성 글 추이(오른쪽) */}
        <div className="dash-pair">
          <section className="card">
            <div className="card-head" style={{ flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15 }}>블로그별 방문자 비교 <a href="/diagnose" className="tiny" style={{ color: "var(--accent)", fontWeight: 500, marginLeft: 6 }}>🩺 블로그 진단 →</a></h2>
              <span className="tiny muted">{d.visits.updatedAt ? `${fmtDate(d.visits.updatedAt)} 수집 · 1시간마다 갱신` : "아직 수집 전"}</span>
            </div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <div className="tiny muted">최근 30일 일별 방문자 (기록한 날만 표시)</div>
              <TrendChart weeks={d.visits.daily.days} series={d.visits.daily.series} unit="명" tipSuffix="" label="최근 30일 블로그별 일별 방문자 수" emptyText="아직 기록된 방문자 수가 없습니다." />
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="tbl">
                  <thead><tr><th>블로그</th><th style={{ textAlign: "right" }}>오늘</th><th style={{ textAlign: "right" }}>최근 7일</th><th style={{ textAlign: "right" }}>이번 달</th><th style={{ textAlign: "right" }}>누적</th></tr></thead>
                  <tbody>
                    {d.visits.blogs.map((b) => (
                      <tr key={b.id}>
                        <td><BlogTopButton blogId={b.id} name={b.name} />{!b.hasUrl && <div className="tiny muted">블로그 주소를 넣으면 집계</div>}</td>
                        <td style={{ textAlign: "right" }}>{num(b.today)}</td>
                        <td style={{ textAlign: "right" }}>{num(b.week)}</td>
                        <td style={{ textAlign: "right" }}>{num(b.month)}</td>
                        <td style={{ textAlign: "right" }}>{num(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                공개 방문자 숫자 · {d.visits.blogs.map((b) => b.since).filter(Boolean).sort()[0] ?? "오늘"}부터 기록 · 블로그 이름을 누르면 인기 글 TOP 10
              </p>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2 style={{ fontSize: 15 }}>최근 5주 완성 글 추이</h2></div>
            <div className="card-pad">
              <p className="tiny muted" style={{ marginTop: 0 }}>블로그별 주간 완성 글 수 (⑥ 검수까지 끝난 글, 월요일 시작 주)</p>
              <TrendChart weeks={d.trend.weeks} series={d.trend.series} />
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr><th>블로그</th>{d.trend.weeks.map((w) => <th key={w} style={{ textAlign: "right" }}>{w.slice(5).replace("-", "/")}</th>)}</tr></thead>
                  <tbody>
                    {d.trend.series.map((s) => (
                      <tr key={s.id}><td className="ellipsis" style={{ maxWidth: 120 }}>{s.name}</td>{s.values.map((v, k) => <td key={k} style={{ textAlign: "right" }}>{v || "·"}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* 블로그별 글 작업 */}
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>블로그별 글 작업 (이번 달)</h2></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>블로그</th><th style={{ textAlign: "right" }}>완성</th><th style={{ textAlign: "right" }}>발행</th><th style={{ textAlign: "right" }}>1차 통과율</th><th style={{ textAlign: "right" }}>평균 검색량</th></tr></thead>
              <tbody>
                {d.perBlog.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td style={{ textAlign: "right" }}>{b.completed}</td>
                    <td style={{ textAlign: "right" }}>{b.published}</td>
                    <td style={{ textAlign: "right" }}>{pct(b.passRate)}</td>
                    <td style={{ textAlign: "right" }}>{num(b.avgVolume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 키워드 TOP 5 (블로그 고르기) */}
        <TopKeywordsCard blogs={d.blogs.map((b) => ({ id: b.id, name: b.name }))} byBlog={d.keywordsByBlog} />

        {/* 운영 상태 */}
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted">운영 상태</span>
          <span className="badge">오늘 호출 {d.ops.todayCalls}회 · {fmtUsd(d.ops.todayUsd)}</span>
          <Link href="/posts" className="badge badge-accent">제목 선택 대기 {d.ops.choosing}건</Link>
          <Link href="/posts" className="badge badge-warn">발행 대기 {d.ops.ready}건</Link>
          <Link href="/posts" className={`badge ${d.ops.failed ? "badge-bad" : "badge-ok"}`}>{d.ops.failed ? "⚠ " : "✓ "}실패 {d.ops.failed}건</Link>
          <Link href="/posts" className="badge badge-warn">다시 검수 권장 {d.ops.rereview}건</Link>
        </div>
      </div>
    </div>
  );
}
