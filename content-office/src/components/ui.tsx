import { STEP_NAMES } from "@/lib/steps";

export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}

/** 원화 환산 기준 환율 */
/** 지출(AI 비용 등) 원화 환산: $1 = ₩1,500 */
export const KRW_PER_USD = 1500;
/** 수익(애드센스 달러 등) 원화 환산: $1 = ₩1,200 */
export const REVENUE_KRW_PER_USD = 1200;

/** 달러 표시 + 괄호 안 원화 환산. 예: $0.15 (₩210) */
export function fmtUsd(n: number) {
  const usd = Number(n) || 0;
  const usdText = "$" + usd.toFixed(usd && usd < 0.01 ? 4 : 2);
  const krw = usd * KRW_PER_USD;
  const krwText = krw > 0 && krw < 1 ? krw.toFixed(1) : Math.round(krw).toLocaleString("ko-KR");
  return `${usdText} (₩${krwText})`;
}

export function BlogTag({ name, color }: { name: string; color: string }) {
  return (
    <span className="row small muted" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
      <span className="blog-dot" style={{ background: color }} />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

/** 7단계 진행 표시. current = 지금 단계(1~7), done = 끝난 단계까지 */
export function Steps({ current, error = false }: { current: number; error?: boolean }) {
  return (
    <div className="pipeline" role="list" aria-label="진행 단계">
      {STEP_NAMES.map((name, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? `cur${error ? " err" : ""}` : "";
        return (
          <div key={name} className={`pipe-step ${state}`} role="listitem" aria-current={n === current ? "step" : undefined}>
            <div className="pipe-bar" />
            <div className="pipe-label">{n} {name}</div>
          </div>
        );
      })}
    </div>
  );
}
