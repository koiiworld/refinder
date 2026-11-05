"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

export type TrendCardVideo = { id: string; title: string; channel: string; thumbnail: string; url: string; views: number; publishedAt: string; seconds?: number; likes?: number; scrappedAt?: string; category?: string; group?: string; perHour?: number };

const views = (n: number) => (n >= 100_000_000 ? `${(n / 100_000_000).toFixed(1)}억` : n >= 10_000 ? `${Math.round(n / 10_000).toLocaleString("ko-KR")}만` : n.toLocaleString("ko-KR"));
function ago(iso: string) {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "방금 전";
  if (h < 24) return `${Math.floor(h)}시간 전`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}일 전` : `${Math.floor(d / 30)}개월 전`;
}
function len(s?: number) {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
/** 영상 제목 → 키워드 추천 방향 (해시태그·괄호·특수문자 정리) */
const hintOf = (t: string) => t.replace(/#\S+/g, "").replace(/[\[\(【].*?[\]\)】]/g, " ").replace(/[|｜·•!?~"'“”‘’]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export default function TrendGrid({ videos: all, groups = [], scrapped, category, ranked }: { videos: TrendCardVideo[]; groups?: string[]; scrapped: string[]; category: string; ranked: boolean }) {
  const router = useRouter();
  const [group, setGroup] = useState("");
  const [shortsOnly, setShortsOnly] = useState(false);
  const videos = all.filter((v) => (!group || v.group === group) && (!shortsOnly || (v.seconds ?? 999) <= 180));
  const [saved, setSaved] = useState<string[]>(scrapped);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(v: TrendCardVideo) {
    const on = saved.includes(v.id);
    setBusy(v.id);
    try {
      await api("/api/trends", "POST", on ? { action: "unscrap", item_id: v.id } : { action: "scrap", item_id: v.id, title: v.title, channel: v.channel, thumbnail: v.thumbnail, url: v.url, views: v.views, category });
      setSaved((s) => (on ? s.filter((x) => x !== v.id) : [...s, v.id]));
      if (!ranked) router.refresh();
    } catch {
      /* 실패하면 그대로 */
    }
    setBusy(null);
  }

  return (
    <>
    {(groups.length > 0 || all.some((v) => v.seconds)) && (
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {groups.length > 0 && (
          <>
            <button className={`chip ${!group ? "on" : ""}`} onClick={() => setGroup("")}>전체 {all.length}</button>
            {groups.map((g) => (
              <button key={g} className={`chip ${group === g ? "on" : ""}`} onClick={() => setGroup(g)}>
                {g} {all.filter((v) => v.group === g).length}
              </button>
            ))}
          </>
        )}
        <button className={`chip ${shortsOnly ? "on" : ""}`} onClick={() => setShortsOnly(!shortsOnly)} aria-pressed={shortsOnly}>⚡ 쇼츠만</button>
      </div>
    )}
    {!videos.length && <div className="card empty">조건에 맞는 영상이 없습니다.</div>}
    <div className="trend-grid">
      {videos.map((v, i) => {
        const on = saved.includes(v.id);
        return (
          <article key={v.id} className="card trend-card">
            <a href={v.url} target="_blank" rel="noreferrer" className="trend-thumb" aria-label={`${v.title} 유튜브에서 보기`}>
              {v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="trend-thumb-empty">▶</span>
              )}
              {ranked && <span className={`trend-rank ${i < 3 ? "top" : ""}`}>{i + 1}위</span>}
              {v.seconds ? <span className="trend-len">{v.seconds <= 180 ? "Shorts" : len(v.seconds)}</span> : null}
              {v.group && v.group !== "급상승" && groups.length > 0 && <span className="trend-group">{v.group}</span>}
            </a>
            <div className="trend-body">
              <h3 className="trend-title" title={v.title}>{v.title}</h3>
              <div className="tiny muted ellipsis">{v.channel}</div>
              <div className="tiny muted">
                조회 {views(v.views)}회{v.publishedAt ? ` · ${ago(v.publishedAt)}` : ""}{v.perHour ? ` · 시간당 ${views(v.perHour)}회` : ""}{v.scrappedAt ? ` · ${fmtDate(v.scrappedAt, false)} 스크랩${v.category ? ` (${v.category})` : ""}` : ""}
              </div>
              <div className="row" style={{ gap: 6, marginTop: "auto", paddingTop: 8 }}>
                <button className={`btn btn-sm ${on ? "btn-primary" : ""}`} disabled={busy === v.id} onClick={() => toggle(v)} aria-pressed={on}>
                  {on ? "📌 스크랩됨" : "📌 스크랩"}
                </button>
                <Link className="btn btn-sm" href={`/new?hint=${encodeURIComponent(hintOf(v.title))}`}>✍️ 글감으로</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
    </>
  );
}
