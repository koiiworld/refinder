"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd, KRW_PER_USD } from "@/components/ui";
import type { MonthRevenue, RevenueChannel } from "@/lib/dashboard";

const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const seriesVar = (i: number) => `var(--series-${(i % 3) + 1})`;

// ───────── 최근 10주 추이: 선 그래프 + 마우스/터치 위치 안내 ─────────
export function TrendChart({ weeks, series }: { weeks: string[]; series: { id: string; name: string; values: number[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 220, L = 28, R = 72, T = 12, B = 26;
  const max = Math.max(2, ...series.flatMap((s) => s.values));
  const top = Math.ceil(max / 2) * 2;
  const x = (i: number) => L + (i * (W - L - R)) / (weeks.length - 1);
  const yv = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, top / 2, top];
  const empty = series.every((s) => s.values.every((v) => v === 0));
  // 선 끝 이름표가 겹치지 않게 살짝 띄움
  const ends = series.map((s, i) => ({ i, y: yv(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  const labelY = (i: number) => ends.find((e) => e.i === i)!.y;

  return (
    <div style={{ position: "relative" }}>
      {empty && <p className="small muted" style={{ margin: "0 0 6px" }}>최근 10주 동안 완성한 글이 아직 없습니다.</p>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="최근 10주 블로그별 주간 완성 글 수"
        onMouseLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - L) / (W - L - R)) * (weeks.length - 1));
          setHover(i >= 0 && i < weeks.length ? i : null);
        }}
        style={{ display: "block", touchAction: "pan-y" }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={yv(t)} y2={yv(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={yv(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => (i % 3 === 0 || i === weeks.length - 1 ? <text key={w} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{w.slice(5).replace("-", "/")}</text> : null))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s, si) => (
          <g key={s.id}>
            <polyline fill="none" stroke={seriesVar(si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${yv(v)}`).join(" ")} />
            <circle cx={x(s.values.length - 1)} cy={yv(s.values[s.values.length - 1])} r={4} fill={seriesVar(si)} stroke="var(--panel)" strokeWidth={2} />
            {hover != null && <circle cx={x(hover)} cy={yv(s.values[hover])} r={4} fill={seriesVar(si)} stroke="var(--panel)" strokeWidth={2} />}
            <text x={W - R + 8} y={labelY(si) + 4} fontSize={11} fill="var(--text)">{s.name.length > 6 ? s.name.slice(0, 6) + "…" : s.name}</text>
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="tiny muted">{weeks[hover].slice(5).replace("-", "/")} 주</div>
          {series.map((s, si) => (
            <div key={s.id} className="tiny row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <span className="dot" style={{ background: seriesVar(si) }} /> {s.name} <b>{s.values[hover]}건</b>
            </div>
          ))}
        </div>
      )}
      <div className="row tiny" style={{ gap: 12, marginTop: 6 }}>
        {series.map((s, si) => (
          <span key={s.id} className="row" style={{ gap: 4 }}>
            <span className="dot" style={{ background: seriesVar(si) }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ───────── 최근 7일 AI 비용 막대 ─────────
export function CostDays({ days }: { days: { day: string; usd: number }[] }) {
  const max = Math.max(0.0001, ...days.map((d) => d.usd));
  return (
    <div>
      <div className="tiny muted" style={{ marginBottom: 6 }}>최근 7일 일별 AI 비용</div>
      <div className="cost-days">
        {days.map((d) => (
          <div key={d.day} className="cost-day" title={`${d.day.slice(5)} ${fmtUsd(d.usd)}`}>
            <span className="tiny" style={{ minHeight: 16 }}>{d.usd ? fmtUsd(d.usd).split(" ")[0] : ""}</span>
            <div className="cost-bar-wrap">
              <div className="cost-bar" style={{ height: `${Math.max(d.usd ? 4 : 0, (d.usd / max) * 100)}%` }} />
            </div>
            <span className="tiny muted">{d.day.slice(5).replace("-", "/")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── 수익: 정산 화면 숫자를 직접 입력 ─────────
const CHANNELS: { id: RevenueChannel; name: string; metricHint: string; usd?: boolean }[] = [
  { id: "coupang", name: "쿠팡파트너스", metricHint: "예: 클릭 1,840 · 주문 46" },
  { id: "adpost", name: "애드포스트 (네이버)", metricHint: "예: 노출 128,000 · 클릭 2,150" },
  { id: "adsense", name: "애드센스", metricHint: "예: 페이지뷰 9,400 · RPM $1.98", usd: true },
];

export function RevenueCard({ month, data, total, prevTotal, aiKrw }: { month: string; data: MonthRevenue; total: number; prevTotal: number | null; aiKrw: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.id, { krw: data[c.id]?.krw ? String(data[c.id]!.krw) : "", usd: data[c.id]?.usd != null ? String(data[c.id]!.usd) : "", metric: data[c.id]?.metric ?? "" }])) as Record<RevenueChannel, { krw: string; usd: string; metric: string }>,
  );
  const [, m] = month.split("-").map(Number);
  const delta = prevTotal ? (total - prevTotal) / prevTotal : null;

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const payload = Object.fromEntries(
        CHANNELS.map((c) => {
          const usd = f[c.id].usd.trim() ? Number(f[c.id].usd.replace(/[^\d.]/g, "")) : null;
          const won = f[c.id].krw.trim() ? Number(f[c.id].krw.replace(/[^\d]/g, "")) : usd != null ? Math.round(usd * KRW_PER_USD) : 0;
          return [c.id, { krw: won, usd, metric: f[c.id].metric }];
        }),
      );
      await api("/api/dashboard/revenue", "PUT", { month, data: payload });
      setEdit(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15 }}>수익 ({m}월)</h2>
        <div className="row">
          <span className="tiny muted">직접 입력한 정산 숫자 · 달러는 $1 = ₩{KRW_PER_USD.toLocaleString()} 환산</span>
          <button className="btn btn-sm" onClick={() => setEdit(!edit)}>{edit ? "닫기" : total ? "수정" : "이번 달 수익 입력"}</button>
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        {total > 0 ? (
          <div className="kpi-grid">
            <div>
              <div className="small muted">이번 달 총 수익</div>
              <div className="kpi-num">{krw(total)}</div>
              {delta != null && <div className={`tiny ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "▲" : "▼"} 지난달 대비 {Math.abs(Math.round(delta * 100))}%</div>}
            </div>
            <div>
              <div className="small muted">AI 비용 대비 수익</div>
              <div className="kpi-num">{aiKrw > 0 ? `약 ${Math.round(total / aiKrw).toLocaleString("ko-KR")}배` : "-"}</div>
              <div className="tiny muted">수익 {krw(total)} ÷ AI 비용 {krw(aiKrw)}</div>
            </div>
          </div>
        ) : (
          !edit && <p className="small muted" style={{ margin: 0 }}>아직 입력한 수익이 없습니다. 쿠팡파트너스·애드포스트·애드센스는 앱에서 자동으로 가져올 수 없어, 각 정산 화면의 이번 달 숫자를 입력하면 AI 비용과 비교해 보여 줍니다.</p>
        )}
        {total > 0 && !edit && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>채널</th><th style={{ textAlign: "right" }}>이번 달 수익</th><th>메모</th></tr></thead>
              <tbody>
                {CHANNELS.filter((c) => data[c.id]).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }}>
                      {krw(data[c.id]!.krw)}
                      {data[c.id]!.usd != null && <span className="tiny muted"> (${data[c.id]!.usd})</span>}
                    </td>
                    <td className="tiny muted">{data[c.id]!.metric}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {edit && (
          <div className="stack" style={{ gap: 10 }}>
            {CHANNELS.map((c) => (
              <div key={c.id} className="rev-row">
                <b className="small" style={{ width: 140 }}>{c.name}</b>
                {c.usd && <input className="input" inputMode="decimal" placeholder="달러 (예: 18.60)" value={f[c.id].usd} onChange={(e) => setF({ ...f, [c.id]: { ...f[c.id], usd: e.target.value } })} aria-label={`${c.name} 달러`} />}
                <input className="input" inputMode="numeric" placeholder={c.usd ? "원화 (비우면 자동 환산)" : "원화 (예: 212000)"} value={f[c.id].krw} onChange={(e) => setF({ ...f, [c.id]: { ...f[c.id], krw: e.target.value } })} aria-label={`${c.name} 원화`} />
                <input className="input" placeholder={c.metricHint} value={f[c.id].metric} onChange={(e) => setF({ ...f, [c.id]: { ...f[c.id], metric: e.target.value } })} aria-label={`${c.name} 메모`} />
              </div>
            ))}
            {msg && <div className="notice notice-bad small">{msg}</div>}
            <div className="row">
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : "저장"}</button>
              <span className="tiny muted">쿠팡은 수수료 확정 기준, 애드포스트·애드센스는 정산 전 집계 기준을 권장합니다.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
