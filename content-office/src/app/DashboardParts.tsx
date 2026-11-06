"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, Modal } from "@/components/client-utils";
import { fmtUsd, KRW_PER_USD, REVENUE_KRW_PER_USD } from "@/components/ui";
import type { MonthRevenue, RevenueChannel } from "@/lib/dashboard";

/** 입력칸 숫자에 천 단위 쉼표 */
const commas = (v: string) => (v ? String(v).replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "");
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
          const won = f[c.id].krw.trim() ? Number(f[c.id].krw.replace(/[^\d]/g, "")) : usd != null ? Math.round(usd * REVENUE_KRW_PER_USD) : 0;
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

  // 윈도우 캡처(Win+Shift+S)처럼 클립보드에 있는 이미지: 대시보드 어디서든 Ctrl+V
  const readRef = useRef(readCapture);
  readRef.current = readCapture;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void readRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15 }}>수익 ({m}월)</h2>
        <div className="row">
          <span className="tiny muted">쿠팡 자동 · 나머지는 직접 입력/캡처 · 달러 환산: 수익 $1 = ₩{REVENUE_KRW_PER_USD.toLocaleString()} · 지출 $1 = ₩{KRW_PER_USD.toLocaleString()}</span>
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
        {!edit && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>채널</th><th style={{ textAlign: "right" }}>이번 달 수익</th><th>메모</th></tr></thead>
              <tbody>
                {CHANNELS.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }} className={data[c.id] ? "" : "muted"}>
                      {krw(data[c.id]?.krw ?? 0)}
                      {data[c.id]?.usd != null && <span className="tiny muted"> (${data[c.id]!.usd})</span>}
                    </td>
                    <td className="tiny muted">{data[c.id]?.metric || (c.id === "coupang" ? (coupang?.connected ? "API 자동 집계 대기" : "API 키를 연결하면 자동") : "아직 입력 안 함")}</td>
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
          style={{ borderStyle: "dashed", padding: 12, textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
        >
          {reading ? <span className="small"><span className="spinner" /> AI가 캡처에서 애드포스트 수익을 읽는 중…</span> : <span className="small">📷 <b>애드포스트</b> 수익 화면 캡처: <b style={{ color: "var(--accent)" }}>눌러서 파일 선택</b> · 끌어다 놓기 · <b>Ctrl+V</b>(맥은 ⌘V)로 붙여넣기</span>}
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
                <input className="input" inputMode="numeric" placeholder={c.usd ? "원화 (비우면 자동 환산)" : "원화 (예: 212,000)"} value={commas(f[c.id].krw)} onChange={(e) => setF({ ...f, [c.id]: { ...f[c.id], krw: e.target.value.replace(/[^\d]/g, "") } })} aria-label={`${c.name} 원화`} />
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

// ───────── 블로그 이름 누르면: 인기 글 TOP 10 팝업 ─────────
type ViewsBlock = { items: { rank: number; title: string; views: number }[]; source: "capture" | "sum" | "none"; label: string; days: number; capturedAt: string | null };
type TopData = { views: Record<"day" | "week" | "month", ViewsBlock>; dailyCaptures: number; reaction: { title: string; url: string; likes: number; comments: number; views: number | null }[]; platform: string };

export function BlogTopButton({ blogId, name }: { blogId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<TopData | null>(null);
  const [tab, setTab] = useState<"views" | "reaction">("views");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [capKind, setCapKind] = useState<"" | "day" | "week" | "month">("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setErr("");
    try {
      const x = await api<TopData>(`/api/dashboard/top?blogId=${blogId}`);
      setD(x);
      const has = (["day", "week", "month"] as const).find((k) => x.views[k].items.length);
      setTab(has || x.platform === "tistory" ? "views" : "reaction");
      if (has) setPeriod((p) => (x.views[p].items.length ? p : has));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  async function read(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 3);
    if (!imgs.length) return;
    setBusy(true);
    setErr("");
    try {
      const images = await Promise.all(imgs.map((x) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(x); })));
      const r = await api<{ kind: "day" | "week" | "month"; date: string }>(`/api/dashboard/top`, "POST", { blogId, images, kind: capKind || undefined });
      await load();
      setTab("views");
      setPeriod(r.kind);
      setNote(`${r.date} ${r.kind === "day" ? "일간" : r.kind === "week" ? "주간" : "월간"} 조회수로 저장했어요. 매일 넣으면 주간·월간이 자동으로 쌓여요.`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void readRef.current(files);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [open]);

  return (
    <>
      <button type="button" className="linklike" onClick={() => { setOpen(true); void load(); }} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", textAlign: "left" }} title="인기 글 TOP 10 보기">
        {name} <span className="tiny">🏆</span>
      </button>
      {open && (
        <Modal title={`🏆 ${name} 인기 글 TOP 10`} onClose={() => setOpen(false)}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn btn-sm ${tab === "views" ? "btn-primary" : ""}`} onClick={() => setTab("views")}>👁 조회수 순위</button>
              {d?.platform !== "tistory" && <button className={`btn btn-sm ${tab === "reaction" ? "btn-primary" : ""}`} onClick={() => setTab("reaction")}>❤️ 반응 순위</button>}
            </div>
            {!d && !err && <div className="small muted"><span className="spinner" /> 불러오는 중…</div>}
            {err && <div className="notice notice-bad small">{err}</div>}
            {d && tab === "views" && (
              <>
                <div className="row" style={{ gap: 6 }}>
                  {(["day", "week", "month"] as const).map((k) => (
                    <button key={k} className={`btn btn-sm ${period === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setPeriod(k)}>
                      {k === "day" ? "일간" : k === "week" ? "주간" : "월간"}
                    </button>
                  ))}
                  <span className="tiny muted">일간 캡처 {d.dailyCaptures}일치 기억 중</span>
                </div>
                {d.views[period].items.length ? (
                  <>
                    <div className="tiny muted">
                      {d.views[period].source === "sum" ? d.views[period].label : `${d.views[period].label || "기간 정보 없음"} · 캡처 기준`}
                      {d.views[period].capturedAt ? ` · 마지막 캡처 ${fmtDateShort(d.views[period].capturedAt!)}` : ""}
                    </div>
                    <ol className="stack" style={{ gap: 4, margin: 0, paddingLeft: 22 }}>
                      {d.views[period].items.map((i) => <li key={i.rank} className="small"><span className="ellipsis" style={{ display: "inline-block", maxWidth: "75%", verticalAlign: "bottom" }}>{i.title}</span> <b style={{ float: "right" }}>{i.views.toLocaleString("ko-KR")}회</b></li>)}
                    </ol>
                  </>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>
                    {period === "day"
                      ? `${d.platform === "tistory" ? "티스토리" : "네이버"}는 글별 조회수를 밖에서 볼 수 없게 막아 둬서, 통계 화면 캡처를 올리면 AI가 읽어 순위를 만들어요.`
                      : `${period === "week" ? "주간" : "월간"} 순위는 그 기간 캡처를 넣거나, 일간 캡처를 매일 넣으면 자동으로 합쳐져요.`}
                  </p>
                )}
                {note && <div className="notice notice-ok small">{note}</div>}
                <div className="row" style={{ gap: 6 }}>
                  <span className="tiny muted">넣을 캡처:</span>
                  <select className="input" style={{ maxWidth: 150, padding: "2px 6px", fontSize: 13 }} value={capKind} onChange={(e) => setCapKind(e.target.value as typeof capKind)} aria-label="캡처 기간 종류">
                    <option value="">AI가 알아서 판단</option>
                    <option value="day">일간</option>
                    <option value="week">주간</option>
                    <option value="month">월간</option>
                  </select>
                </div>
                <div
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void read(Array.from(e.dataTransfer.files)); }}
                  style={{ borderStyle: "dashed", padding: 12, textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
                >
                  {busy ? <span className="small"><span className="spinner" /> AI가 조회수 순위를 읽는 중…</span> : <span className="small">📷 {d.platform === "tistory" ? "티스토리 통계 > 인기글" : <>크리에이터 어드바이저 &gt; 콘텐츠 &gt; 조회수 순위</>} 캡처: <b style={{ color: "var(--accent)" }}>눌러서 파일 선택</b> · 끌어다 놓기 · <b>Ctrl+V</b></span>}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void read(Array.from(e.target.files))} />
                </div>
                {d.platform !== "tistory" && <a className="tiny" href="https://creator-advisor.naver.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>크리에이터 어드바이저 열기 ↗</a>}
              </>
            )}
            {d && tab === "reaction" && (
              d.reaction.length ? (
                <>
                  <div className="tiny muted">최근 글 중 공감·댓글이 많은 순서 (공개된 숫자)</div>
                  <ol className="stack" style={{ gap: 4, margin: 0, paddingLeft: 22 }}>
                    {d.reaction.map((r) => (
                      <li key={r.url} className="small">
                        <a href={r.url} target="_blank" rel="noreferrer" className="ellipsis" style={{ display: "inline-block", maxWidth: "68%", verticalAlign: "bottom" }}>{r.title}</a>
                        <span className="tiny muted" style={{ float: "right" }}>{r.views != null && `👁 ${r.views.toLocaleString("ko-KR")} · `}❤️ {r.likes} · 💬 {r.comments}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>글 목록을 불러오지 못했어요.</p>
              )
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

const fmtDateShort = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// ───────── AI별 잔액: 충전액 · 사용액 · 사용률 · 남은 잔액 ─────────
type BalanceRow = { id: string; name: string; billing: string; topups: { usd: number; at: string; note?: string }[]; charged: number | null; used: number; calls: number; since: string | null; remaining: number | null; rate: number | null; actual: { usd: number; at: string } | null };

export function AiBalances() {
  const [rows, setRows] = useState<BalanceRow[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [at, setAt] = useState("");
  const [err, setErr] = useState("");
  const [real, setReal] = useState("");
  async function setActual(provider: string, v: number | null) {
    setErr("");
    try {
      setRows(await api<BalanceRow[]>("/api/dashboard/balances", "POST", { provider, actual: v }));
      setReal("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    api<BalanceRow[]>("/api/dashboard/balances").then(setRows).catch((e) => setErr((e as Error).message));
  }, []);
  async function add(provider: string) {
    setErr("");
    try {
      setRows(await api<BalanceRow[]>("/api/dashboard/balances", "POST", { provider, usd: Number(amt.replace(/[^\d.]/g, "")), at: at || undefined }));
      setAmt("");
      setAt("");
      setEdit(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function remove(provider: string, index: number) {
    if (!confirm("이 충전 기록을 지울까요?")) return;
    setRows(await api<BalanceRow[]>("/api/dashboard/balances", "POST", { provider, remove: index }));
  }
  const bar = (r: number | null) => {
    const pct = r == null ? 0 : Math.min(100, Math.round(r * 100));
    const color = pct >= 90 ? "var(--bad, #d33)" : pct >= 70 ? "var(--warn, #e8a000)" : "var(--ok, #1a9e5a)";
    return (
      <div className="hbar" style={{ minWidth: 60 }} title={`${pct}% 사용`}>
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
    );
  };
  return (
    <div className="stack" style={{ gap: 8, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div className="row between">
        <b className="small">💳 AI별 잔액</b>
        <span className="tiny muted">충전액은 직접 기록 · 사용액은 이 앱에서 쓴 금액(추정)</span>
      </div>
      {!rows && !err && <div className="small muted"><span className="spinner" /> 불러오는 중…</div>}
      {err && <div className="notice notice-bad small">{err}</div>}
      {rows && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>AI</th><th style={{ textAlign: "right" }}>충전액</th><th style={{ textAlign: "right" }}>사용액</th><th>사용률</th><th style={{ textAlign: "right" }}>남은 잔액</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">
                    <a href={r.billing} target="_blank" rel="noreferrer" title="실제 잔액은 이 사이트에서 확인">{r.name} ↗</a>
                    <div className="tiny muted">{r.since ? `${new Date(r.since).toLocaleDateString("ko-KR")}부터 · ${r.calls}회` : `기록된 사용 ${r.calls}회`}</div>
                  </td>
                  <td style={{ textAlign: "right" }} className="small">{r.charged == null ? <span className="muted">-</span> : fmtUsd(r.charged)}</td>
                  <td style={{ textAlign: "right" }} className="small">{fmtUsd(r.used)}</td>
                  <td className="small" style={{ minWidth: 110 }}>
                    {r.rate == null ? <span className="tiny muted">충전액을 넣으면 계산</span> : <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>{bar(r.rate)}<span className="tiny">{Math.round(r.rate * 100)}%</span></div>}
                  </td>
                  <td style={{ textAlign: "right" }} className="small"><b style={{ color: r.remaining != null && r.charged ? (r.remaining / r.charged < 0.1 ? "var(--bad, #d33)" : undefined) : undefined }}>{r.remaining == null ? "-" : fmtUsd(r.remaining)}</b></td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setEdit(edit === r.id ? null : r.id)}>{edit === r.id ? "닫기" : "＋ 충전"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && edit && (() => {
        const r = rows.find((x) => x.id === edit)!;
        return (
          <div className="card card-pad stack" style={{ gap: 6, padding: 10 }}>
            <b className="small">{r.name} 충전 기록</b>
            {r.topups.map((t, i) => (
              <div key={i} className="row between small" style={{ flexWrap: "nowrap" }}>
                <span>{new Date(t.at).toLocaleDateString("ko-KR")} · {fmtUsd(t.usd)}{t.note ? ` · ${t.note}` : ""}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => remove(r.id, i)}>지우기</button>
              </div>
            ))}
            <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input className="input" inputMode="decimal" placeholder="충전 금액 (달러, 예: 10)" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="충전 금액" />
              <input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} aria-label="충전한 날" style={{ maxWidth: 160 }} />
              <button className="btn btn-sm btn-primary" disabled={!amt.trim()} onClick={() => add(r.id)}>추가</button>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "nowrap", marginTop: 4 }}>
              <input className="input" inputMode="decimal" placeholder={`실제 사용액 (결제 화면 기준, 예: 0.06)`} value={real} onChange={(e) => setReal(e.target.value)} aria-label="실제 사용액" />
              <button className="btn btn-sm" disabled={!real.trim()} onClick={() => setActual(r.id, Number(real.replace(/[^\d.]/g, "")))}>실제 사용액으로 맞추기</button>
              {r.actual && <button className="btn btn-sm btn-ghost" onClick={() => setActual(r.id, null)}>맞춤 해제</button>}
            </div>
            {r.actual && <span className="tiny muted">{new Date(r.actual.at).toLocaleDateString("ko-KR")}에 실제 사용액 {fmtUsd(r.actual.usd)}로 맞춤 · 그 뒤로는 앱 기록을 더해요</span>}
            <span className="tiny muted">충전한 날부터 이 앱에서 쓴 금액을 빼서 남은 잔액을 보여줘요. 날짜를 비우면 오늘로 기록돼요. 각 사 웹사이트에서 직접 쓴 금액은 빠지니, 가끔 ↗ 링크로 실제 잔액과 맞춰 보세요.</span>
          </div>
        );
      })()}
    </div>
  );
}

// ───────── 검색량 높은 키워드 TOP 5 (블로그 고르기 ▼) ─────────
const STAGE_LABEL: Record<string, string> = { titles: "제목 고르는 중", writing: "글 쓰는 중", reviewing: "검수 중", ready: "발행 대기", published: "발행 완료" };

export function TopKeywordsCard({ blogs, byBlog }: { blogs: { id: string; name: string }[]; byBlog: Record<string, { keyword: string; volume: number; project_id: string | null; stage: string | null }[]> }) {
  const [blogId, setBlogId] = useState(blogs.find((b) => byBlog[b.id]?.length)?.id ?? blogs[0]?.id ?? "");
  const rows = byBlog[blogId] ?? [];
  const name = blogs.find((b) => b.id === blogId)?.name ?? "";
  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15 }}>검색량 높은 키워드 TOP 5</h2>
        <span className="tiny muted">그 블로그 주제로 추천·선택한 키워드 · 네이버 월간 검색수 순</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>키워드</th>
              <th>
                <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <select value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그 고르기" style={{ font: "inherit", fontWeight: 600, border: "1px solid var(--line)", borderRadius: 8, padding: "2px 22px 2px 8px", background: "var(--panel)", color: "inherit", cursor: "pointer", appearance: "none" }}>
                    {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <span aria-hidden style={{ position: "absolute", right: 7, pointerEvents: "none", fontSize: 10 }}>▼</span>
                </label>
              </th>
              <th style={{ textAlign: "right" }}>월간 검색량</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k, i) => (
              <tr key={k.keyword}>
                <td>{i + 1}</td>
                <td>{k.project_id ? <a href={`/posts/${k.project_id}`} style={{ color: "var(--accent)" }}>{k.keyword}</a> : k.keyword}</td>
                <td>{name}</td>
                <td style={{ textAlign: "right" }}>{k.volume.toLocaleString("ko-KR")}</td>
                <td>{k.stage ? STAGE_LABEL[k.stage] ?? k.stage : <a href={`/new?hint=${encodeURIComponent(k.keyword)}`} style={{ color: "var(--accent)" }}>✍️ 아직 안 씀 · 쓰기</a>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="small muted">이 블로그는 아직 검색량을 잰 키워드가 없어요. 글 만들기에서 키워드 추천을 받아 보세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
