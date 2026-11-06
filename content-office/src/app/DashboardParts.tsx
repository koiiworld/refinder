"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd, KRW_PER_USD } from "@/components/ui";
import type { MonthRevenue, RevenueChannel } from "@/lib/dashboard";

const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const seriesVar = (i: number) => `var(--series-${(i % 3) + 1})`;

// ───────── 선 그래프 (주간 완성 글 · 일별 방문자 공용) + 마우스/터치 위치 안내 ─────────
// 값이 null 인 지점(기록 없는 날)은 선을 끊고 안내에 '-' 로 표시
export function TrendChart({ weeks, series, unit = "건", label = "최근 5주 블로그별 주간 완성 글 수", emptyText = "최근 5주 동안 완성한 글이 아직 없습니다.", tipSuffix = " 주" }: { weeks: string[]; series: { id: string; name: string; values: (number | null)[] }[]; unit?: string; label?: string; emptyText?: string; tipSuffix?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 220, L = 36, R = 72, T = 12, B = 26;
  const max = Math.max(2, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const step = niceStep(max / 2);
  const top = step * Math.ceil(max / step);
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, weeks.length - 1);
  const yv = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  const empty = series.every((s) => s.values.every((v) => !v));
  const lastIdx = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1; };
  // 선 끝 이름표가 겹치지 않게 살짝 띄움
  const ends = series.map((s, i) => { const li = lastIdx(s.values); return { i, y: yv(li >= 0 ? s.values[li]! : 0) }; }).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  // 아래로 넘치면 위로 밀어 올림 (값이 모두 0일 때 이름표가 축 아래로 내려가지 않게)
  const bottom = H - B;
  if (ends.length && ends[ends.length - 1].y > bottom) {
    ends[ends.length - 1].y = bottom;
    for (let k = ends.length - 2; k >= 0; k--) if (ends[k + 1].y - ends[k].y < 14) ends[k].y = ends[k + 1].y - 14;
  }
  const labelY = (i: number) => ends.find((e) => e.i === i)!.y;
  // null 로 끊긴 구간별 선
  const segments = (vals: (number | null)[]) => {
    const out: string[][] = [];
    let cur: string[] = [];
    vals.forEach((v, i) => { if (v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(`${x(i)},${yv(v)}`); });
    if (cur.length) out.push(cur);
    return out;
  };
  const every = weeks.length <= 6 ? 1 : Math.ceil(weeks.length / 6);
  const fmtX = (w: string) => w.slice(5).replace("-", "/");

  return (
    <div style={{ position: "relative" }}>
      {empty && <p className="small muted" style={{ margin: "0 0 6px" }}>{emptyText}</p>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
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
            <text x={L - 8} y={yv(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{t.toLocaleString("ko-KR")}</text>
          </g>
        ))}
        {weeks.map((w, i) => ((weeks.length - 1 - i) % every === 0 ? <text key={w} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmtX(w)}</text> : null))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s, si) => {
          const li = lastIdx(s.values);
          return (
            <g key={s.id}>
              {segments(s.values).map((pts, k) => (pts.length > 1
                ? <polyline key={k} fill="none" stroke={seriesVar(si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts.join(" ")} />
                : <circle key={k} cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r={2.5} fill={seriesVar(si)} />))}
              {li >= 0 && <circle cx={x(li)} cy={yv(s.values[li]!)} r={4} fill={seriesVar(si)} stroke="var(--panel)" strokeWidth={2} />}
              {hover != null && s.values[hover] != null && <circle cx={x(hover)} cy={yv(s.values[hover]!)} r={4} fill={seriesVar(si)} stroke="var(--panel)" strokeWidth={2} />}
              <text x={W - R + 8} y={labelY(si) + 4} fontSize={11} fill="var(--text)">{s.name.length > 6 ? s.name.slice(0, 6) + "…" : s.name}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="tiny muted">{fmtX(weeks[hover])}{tipSuffix}</div>
          {series.map((s, si) => (
            <div key={s.id} className="tiny row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <span className="dot" style={{ background: seriesVar(si) }} /> {s.name} <b>{s.values[hover] == null ? "-" : `${s.values[hover]!.toLocaleString("ko-KR")}${unit}`}</b>
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

/** 눈금 간격을 1·2·5 단위로 */
function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
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

export function RevenueCard({ month, data, total, prevTotal, aiKrw, coupang }: { month: string; data: MonthRevenue; total: number; prevTotal: number | null; aiKrw: number; coupang?: { connected: boolean; at: string | null; error: string } }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.id, { krw: data[c.id]?.krw ? String(data[c.id]!.krw) : "", usd: data[c.id]?.usd != null ? String(data[c.id]!.usd) : "", metric: data[c.id]?.metric ?? "" }])) as Record<RevenueChannel, { krw: string; usd: string; metric: string }>,
  );
  const [, m] = month.split("-").map(Number);
  const [syncing, setSyncing] = useState(false);
  const [reading, setReading] = useState(false);
  const [capNote, setCapNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
      setCapNote("");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  async function syncCoupang() {
    setSyncing(true);
    setMsg("");
    try {
      await api("/api/dashboard/revenue/coupang", "POST");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setSyncing(false);
  }

  // 애드포스트 수익 캡처 → AI가 숫자를 읽어 입력칸에 채움 (저장은 직접)
  async function readCapture(files: File[]) {
    const imgs = files.filter((x) => x.type.startsWith("image/")).slice(0, 3);
    if (!imgs.length) return;
    setReading(true);
    setMsg("");
    setCapNote("");
    try {
      const images = await Promise.all(imgs.map((x) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(x); })));
      const r = await api<{ krw: number; period: string; metric: string; provider: string; model: string }>("/api/dashboard/revenue/capture", "POST", { channel: "adpost", month, images });
      setF((cur) => ({ ...cur, adpost: { ...cur.adpost, krw: String(r.krw), metric: [r.metric, r.period && `기간 ${r.period}`].filter(Boolean).join(" · ") || cur.adpost.metric } }));
      setEdit(true);
      setCapNote(`캡처에서 애드포스트 ${krw(r.krw)}을 읽었어요 (${r.provider}/${r.model}). 숫자가 맞는지 확인하고 '저장'을 누르세요.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setReading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15 }}>수익 ({m}월)</h2>
        <div className="row">
          <span className="tiny muted">쿠팡 자동 · 나머지는 직접 입력/캡처 · 달러는 $1 = ₩{KRW_PER_USD.toLocaleString()} 환산</span>
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
          !edit && <p className="small muted" style={{ margin: 0 }}>아직 수익이 없습니다. 쿠팡파트너스는 API 키를 연결하면 자동으로, 애드포스트는 수익 화면 캡처를 아래에 올리면 AI가 읽어 채워 줍니다.</p>
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
        <div className="row" style={{ gap: 8 }}>
          <span className="small"><b>쿠팡파트너스</b> · {coupang?.connected ? (coupang.at ? `API 자동 집계 · ${new Date(coupang.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준` : "API 연결됨") : "API 키를 연결하면 자동 집계"}</span>
          {coupang?.connected && <button className="btn btn-sm" disabled={syncing} onClick={syncCoupang}>{syncing ? <><span className="spinner" /> 불러오는 중…</> : "🔄 지금 불러오기"}</button>}
          {coupang?.error && <span className="tiny" style={{ color: "var(--bad)" }}>{coupang.error}</span>}
        </div>
        <div
          className="card"
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void readCapture(Array.from(e.dataTransfer.files)); }}
          onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); void readCapture(fs); } }}
          style={{ borderStyle: "dashed", padding: 12, textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
        >
          {reading ? <span className="small"><span className="spinner" /> AI가 캡처에서 애드포스트 수익을 읽는 중…</span> : <span className="small">📷 <b>애드포스트</b> 수익 화면 캡처를 끌어다 놓거나 <b style={{ color: "var(--accent)" }}>눌러서 선택</b></span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void readCapture(Array.from(e.target.files))} />
        </div>
        {capNote && <div className="notice notice-ok small">{capNote}</div>}
        {!edit && msg && <div className="notice notice-bad small">{msg}</div>}
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
