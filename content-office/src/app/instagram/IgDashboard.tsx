"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type Post = { id: string; caption: string; type: string; product: string; permalink: string; thumb: string; at: string; likes: number | null; comments: number | null; reach: number | null; views: number | null; saved: number | null; shares: number | null; interactions: number | null; avgWatchSec: number | null };
type Dash = { connected: boolean; profile: { username: string; followers: number | null; follows: number | null; mediaCount: number | null; picture?: string } | null; posts: Post[]; history: { day: string; followers: number | null }[]; at: string | null };
type SortKey = "at" | "views" | "reach" | "likes" | "comments" | "saved" | "shares";

const n = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("ko-KR"));
const kind = (p: Post) => (p.product === "REELS" ? "🎬 릴스" : p.type === "CAROUSEL_ALBUM" ? "🖼 캐러셀" : p.type === "VIDEO" ? "🎥 영상" : "📷 사진");
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

/** 팔로워 추이 (날짜별 저장된 숫자로 그린 작은 선 그래프) */
function FollowerLine({ data }: { data: { day: string; followers: number | null }[] }) {
  const pts = data.filter((d) => d.followers != null) as { day: string; followers: number }[];
  if (pts.length < 2) return <p className="tiny muted" style={{ margin: 0 }}>팔로워 그래프는 이틀 이상 모이면 보여요 (하루 한 번 자동으로 저장).</p>;
  const W = 600, H = 120, P = 8;
  const min = Math.min(...pts.map((p) => p.followers)), max = Math.max(...pts.map((p) => p.followers));
  const x = (i: number) => P + (i * (W - P * 2)) / (pts.length - 1);
  const y = (v: number) => (max === min ? H / 2 : H - P - ((v - min) * (H - P * 2)) / (max - min));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.followers).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120 }} role="img" aria-label="팔로워 추이">
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.followers)} r={3} fill="var(--accent)"><title>{`${p.day} · ${p.followers.toLocaleString("ko-KR")}명`}</title></circle>)}
      </svg>
      <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>{pts[0].day}</span><span>{min.toLocaleString("ko-KR")} ~ {max.toLocaleString("ko-KR")}명</span><span>{pts[pts.length - 1].day}</span></div>
    </div>
  );
}

/** 📊 인스타 대시보드 — 인스타 API(읽기만)로 받은 숫자 */
export default function IgDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<SortKey>("at");
  const [only, setOnly] = useState<"all" | "reel" | "feed">("all");

  useEffect(() => { api<Dash>("/api/instagram/insights").then(setD).catch((e) => setErr((e as Error).message)); }, []);
  async function sync() {
    setBusy(true); setErr("");
    try { setD(await api<Dash>("/api/instagram/insights", "POST")); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const posts = useMemo(() => {
    const list = (d?.posts ?? []).filter((p) => only === "all" || (only === "reel" ? p.product === "REELS" : p.product !== "REELS"));
    return [...list].sort((a, b) => (sort === "at" ? b.at.localeCompare(a.at) : (b[sort] ?? -1) - (a[sort] ?? -1)));
  }, [d, sort, only]);
  // 저장·공유가 많은 글 = 알고리즘이 좋아하는 글 → 위 3개 표시
  const best = useMemo(() => new Set([...(d?.posts ?? [])].sort((a, b) => ((b.saved ?? 0) + (b.shares ?? 0) * 2) - ((a.saved ?? 0) + (a.shares ?? 0) * 2)).slice(0, 3).filter((p) => (p.saved ?? 0) + (p.shares ?? 0) > 0).map((p) => p.id)), [d]);

  if (!d) return <section className="card card-pad"><span className="tiny muted">{err || <><span className="spinner" /> 인스타 대시보드 불러오는 중…</>}</span></section>;

  if (!d.connected && !d.profile) return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <b>📊 인스타 대시보드</b>
      <p className="small" style={{ margin: 0 }}>인스타 API를 연결하면 게시물별 조회수·도달·저장·공유와 팔로워 추이를 자동으로 모아 보여 줘요 (읽기만 해요, 무료).</p>
      <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>인스타 계정을 프로페셔널(크리에이터·비즈니스)로 바꾸기</li>
        <li>developers.facebook.com → 앱 만들기 → &apos;Instagram에서 메시지 및 콘텐츠 관리&apos; → Instagram 로그인 API 설정 → 토큰 생성</li>
        <li>설정 → 키 → <b>인스타그램 액세스 토큰</b>에 붙여넣기</li>
      </ol>
    </section>
  );

  const p = d.profile;
  const week = d.history.filter((h) => h.followers != null);
  const weekAgo = week.find((h) => h.day >= new Date(Date.now() - 7 * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10));
  const diff = p?.followers != null && weekAgo?.followers != null ? p.followers - weekAgo.followers : null;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="card card-pad" style={{ flex: "1 1 140px", minWidth: 140 }}>
      <div className="tiny muted">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      {sub && <div className="tiny muted">{sub}</div>}
    </div>
  );
  const th = (k: SortKey, l: string) => <th style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: "right", padding: "6px 6px" }} onClick={() => setSort(k)}>{l}{sort === k ? " ▼" : ""}</th>;

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        {p?.picture && <img src={p.picture} alt="" width={36} height={36} style={{ borderRadius: 999 }} />}
        <b>📊 인스타 대시보드{p ? ` · @${p.username}` : ""}</b>
        <span className="tiny muted">{d.at ? `${fmtDate(d.at)} 기준` : ""}</span>
        <button className="btn btn-sm" style={{ marginLeft: "auto" }} disabled={busy || !d.connected} onClick={() => void sync()}>{busy ? <><span className="spinner" /> 받는 중…</> : "↻ 지금 새로고침"}</button>
      </div>
      {!d.connected && <p className="notice small" style={{ margin: 0 }}>토큰이 빠져서 예전에 저장된 숫자만 보여 줘요. 설정 → 키에서 인스타 토큰을 다시 넣어 주세요.</p>}
      {err && <p className="notice notice-bad small" style={{ margin: 0 }}>{err}</p>}
      {!p ? (
        <p className="small muted" style={{ margin: 0 }}>아직 받은 숫자가 없어요. ↻ 지금 새로고침을 눌러 주세요.</p>
      ) : (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {tile("팔로워", n(p.followers), diff != null ? `7일 ${diff >= 0 ? "+" : ""}${diff.toLocaleString("ko-KR")}` : undefined)}
            {tile("게시물", n(p.mediaCount))}
            {tile("최근 평균 도달", n(avg(d.posts.map((x) => x.reach))), `최근 ${d.posts.length}개`)}
            {tile("최근 평균 저장", n(avg(d.posts.map((x) => x.saved))), `공유 ${n(avg(d.posts.map((x) => x.shares)))}`)}
          </div>
          <FollowerLine data={d.history} />
          <div className="row" style={{ gap: 6 }}>
            <div className="seg">{([["all", "전체"], ["reel", "🎬 릴스"], ["feed", "📷 피드"]] as const).map(([k, l]) => <button key={k} className={only === k ? "on" : ""} onClick={() => setOnly(k)}>{l}</button>)}</div>
            <span className="tiny muted">제목 칸을 누르면 그 숫자 순으로 정렬 · ⭐ = 저장·공유 많은 글 TOP 3</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "6px 6px", cursor: "pointer" }} onClick={() => setSort("at")}>게시물{sort === "at" ? " ▼" : ""}</th>
                {th("views", "조회")}{th("reach", "도달")}{th("likes", "❤️")}{th("comments", "💬")}{th("saved", "저장")}{th("shares", "공유")}
                <th style={{ textAlign: "right", padding: "6px 6px", whiteSpace: "nowrap" }}>평균 시청</th>
              </tr></thead>
              <tbody>
                {posts.map((x) => (
                  <tr key={x.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 6px" }}>
                      <a href={x.permalink} target="_blank" rel="noreferrer" className="row" style={{ gap: 8, flexWrap: "nowrap", color: "inherit", textDecoration: "none" }}>
                        {x.thumb ? <img src={x.thumb} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }} /> : <span style={{ width: 44, height: 44, borderRadius: 6, background: "var(--line)", flexShrink: 0 }} />}
                        <span style={{ minWidth: 0 }}>
                          <span className="tiny muted">{best.has(x.id) ? "⭐ " : ""}{kind(x)} · {x.at ? fmtDate(x.at, false) : ""}</span><br />
                          <span className="ellipsis" style={{ display: "inline-block", maxWidth: 320 }}>{x.caption.split("\n")[0] || "(캡션 없음)"}</span>
                        </span>
                      </a>
                    </td>
                    {[x.views, x.reach, x.likes, x.comments, x.saved, x.shares].map((v, i) => <td key={i} className="mono" style={{ textAlign: "right", padding: "6px 6px" }}>{n(v)}</td>)}
                    <td className="mono" style={{ textAlign: "right", padding: "6px 6px" }}>{x.avgWatchSec != null ? `${x.avgWatchSec}초` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>하루 한 번 자동으로 받아 날짜별로 쌓아요 (맥이나 Render 중 켜진 곳에서). 인스타 API는 읽기만 해요 — 게시·답글은 직접 해요.</p>
        </>
      )}
    </section>
  );
}
