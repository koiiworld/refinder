"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";
import type { Diagnosis } from "@/lib/diagnose";

const ICON = { ok: "✅", warn: "⚠️", bad: "❌", skip: "➖" } as const;

/** 네이버 홈피드(홈판) 체크포인트 — 네이버 공식 기준이 아니라 운영자들 사이에서 공통으로 말하는 요소 */
const HOMEFEED = [
  ["대표 사진(썸네일)", "선명하고 밝은 실사 사진, 글자는 적게. 첫인상이 클릭률을 결정해요."],
  ["제목", "구체적인 이득 + 약간의 호기심 (예: '이렇게 하니 ○○이 안 터졌어요'). 과장 낚시는 바로 나가는 독자가 많아져 손해."],
  ["첫 화면", "완성 사진·핵심 답을 맨 위에. 스크롤과 체류시간이 늘어요."],
  ["주제 일관성", "한 블로그는 한 분야로. 분야가 섞이면 추천 대상이 흐려져요."],
  ["발행 리듬", "주 2~3회 이상 꾸준히. 오래 쉬면 다시 노출되는 데 시간이 걸려요."],
  ["초기 반응", "발행 직후 공감·댓글·이웃 방문. 이웃과 소통하는 블로그가 유리하다는 의견이 많아요."],
  ["AI 티 줄이기", "같은 문장 틀 반복·과한 요약체 피하기. 직접 찍은 사진·구체적 수치·상황 묘사를 넣기."],
  ["모바일 가독성", "짧은 문단, 소제목, 목록·표. 대부분 폰으로 봐요."],
] as const;

export default function DiagnoseView({ blogs, blogId, initial }: { blogs: { id: string; name: string; platform: string; url: string; color: string }[]; blogId: string; initial: Diagnosis | null }) {
  const [d, setD] = useState<Diagnosis | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blog = blogs.find((b) => b.id === blogId)!;

  async function run() {
    setBusy(true);
    setErr("");
    try {
      setD(await api<Diagnosis>("/api/diagnose", "POST", { blogId }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <nav className="trend-tabs" aria-label="블로그">
        {blogs.map((b) => (
          <Link key={b.id} href={`/diagnose?blog=${b.id}`} className={`trend-tab ${b.id === blogId ? "on" : ""}`}>
            <span className="dot" style={{ background: b.color }} /> {b.name}
          </Link>
        ))}
      </nav>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between">
          <div className="small">{d ? <>마지막 진단 {fmtDate(d.at)} · 최근 글 {d.posts}개 분석</> : "아직 진단한 적이 없어요."}</div>
          <button className="btn btn-primary" disabled={busy || !blog.url} onClick={run}>{busy ? <><span className="spinner" /> 진단 중… (최대 1분)</> : d ? "🔄 다시 진단" : "🩺 진단 시작"}</button>
        </div>
        {!blog.url && <div className="notice notice-warn small">블로그 설정에서 블로그 주소를 넣어야 진단할 수 있어요.</div>}
        {err && <div className="notice notice-bad small">{err}</div>}
      </section>

      {d && (
        <>
          {d.ai?.summary && (
            <section className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row between">
                <h2 style={{ fontSize: 15, margin: 0 }}>종합 진단</h2>
                {d.ai.score != null && <span className="badge badge-accent">점수 {d.ai.score}/100</span>}
              </div>
              <p className="small" style={{ margin: 0 }}>{d.ai.summary}</p>
              {!!d.ai.good?.length && <div className="small">👍 {d.ai.good.join(" · ")}</div>}
              <div className="tiny muted">{d.ai.provider}/{d.ai.model}</div>
            </section>
          )}

          {!!d.ai?.problems?.length && (
            <section className="card">
              <div className="card-head"><h2 style={{ fontSize: 15 }}>고칠 점 (중요한 순서)</h2></div>
              <div className="card-pad stack" style={{ gap: 10 }}>
                {d.ai.problems.map((p, i) => (
                  <div key={i} className="card card-pad stack" style={{ gap: 4, padding: 10 }}>
                    <b className="small">{i + 1}. {p.title}</b>
                    <div className="tiny muted">{p.why}</div>
                    <div className="small" style={{ color: "var(--ok)" }}>→ {p.fix}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2 style={{ fontSize: 15 }}>점검표 (앱이 직접 잰 수치)</h2></div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="tbl">
                  <tbody>
                    {d.checks.map((c, i) => (
                      <tr key={i}><td style={{ width: 28 }}>{ICON[c.status]}</td><td className="small" style={{ whiteSpace: "nowrap" }}><b>{c.label}</b></td><td className="small">{c.detail}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.notes.map((n, i) => <div key={i} className="tiny muted" style={{ marginTop: 6 }}>{n}</div>)}
            </div>
          </section>

          {(!!d.ai?.titleTips?.length || !!d.ai?.next?.length) && (
            <div className="dash-2col">
              {!!d.ai?.titleTips?.length && (
                <section className="card">
                  <div className="card-head"><h2 style={{ fontSize: 15 }}>제목 개선 팁</h2></div>
                  <div className="card-pad stack" style={{ gap: 6 }}>{d.ai.titleTips.map((t, i) => <div key={i} className="small">• {t}</div>)}</div>
                </section>
              )}
              {!!d.ai?.next?.length && (
                <section className="card">
                  <div className="card-head"><h2 style={{ fontSize: 15 }}>이번 주 할 일</h2></div>
                  <div className="card-pad stack" style={{ gap: 6 }}>{d.ai.next.map((t, i) => <label key={i} className="small row" style={{ gap: 6, flexWrap: "nowrap" }}><input type="checkbox" /> {t}</label>)}</div>
                </section>
              )}
            </div>
          )}

          {!!d.metrics.indexed?.length && (
            <section className="card">
              <div className="card-head"><h2 style={{ fontSize: 15 }}>검색 누락 검사</h2></div>
              <div className="card-pad stack" style={{ gap: 4 }}>
                <p className="tiny muted" style={{ marginTop: 0 }}>최근 글 제목 그대로 네이버 블로그 검색을 해서 내 글이 30위 안에 나오는지 봤어요. 안 나오면 &apos;누락&apos;(저품질·중복 의심)일 수 있어요.</p>
                {d.metrics.indexed.map((x, i) => (
                  <div key={i} className="small row" style={{ flexWrap: "nowrap", gap: 8 }}>
                    <span>{x.found ? "✅" : "❌"}</span>
                    <a href={x.url} target="_blank" rel="noreferrer" className="ellipsis" style={{ flex: 1 }}>{x.title}</a>
                    <span className="tiny muted">{x.found ? `${x.rank}위` : "안 나옴"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {blog.platform === "naver" && (
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>네이버 홈판(홈피드) 체크포인트</h2></div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            <p className="tiny muted" style={{ margin: 0 }}>네이버는 홈피드 기준을 공개하지 않아요. 아래는 블로거들 사이에서 공통으로 이야기되는 요소예요.</p>
            {HOMEFEED.map(([t, desc]) => (
              <label key={t} className="small row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <input type="checkbox" style={{ marginTop: 3 }} />
                <span><b>{t}</b> — <span className="muted">{desc}</span></span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
