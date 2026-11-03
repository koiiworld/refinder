import { STAGES, stageDef, STAGE_INDEX } from "@/lib/stages";

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

/** 원화 환산 기준 환율 (1달러 = 1,400원) */
export const KRW_PER_USD = 1400;

/** 달러 표시 + 괄호 안 원화 환산. 예: $0.15 (₩210) */
export function fmtUsd(n: number) {
  const usd = Number(n) || 0;
  const usdText = "$" + usd.toFixed(usd && usd < 0.01 ? 4 : 2);
  const krw = usd * KRW_PER_USD;
  const krwText = krw > 0 && krw < 1 ? krw.toFixed(1) : Math.round(krw).toLocaleString("ko-KR");
  return `${usdText} (₩${krwText})`;
}

export function StageBadge({ stage, status }: { stage: string; status?: string }) {
  const def = stageDef(stage);
  let cls = "badge";
  if (status === "error") cls += " badge-bad";
  else if (status === "running") cls += " badge-accent";
  else if (def.kind === "gate" || def.kind === "manual") cls += " badge-warn";
  else if (stage === "done") cls += " badge-ok";
  return (
    <span className={cls}>
      {status === "running" && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />}
      {status === "error" ? `${def.label} 오류` : def.kind === "gate" && status !== "running" ? `${def.label} 대기` : def.label}
    </span>
  );
}

export function Pipeline({ stage, status }: { stage: string; status: string }) {
  const cur = STAGE_INDEX[stage] ?? -1;
  return (
    <div className="pipeline" role="list" aria-label="제작 단계">
      <div className="pipe-step done" role="listitem">
        <div className="pipe-bar" />
        <div className="pipe-label">글감 수집</div>
      </div>
      {STAGES.filter((s) => s.key !== "done").map((s, i) => {
        const state = stage === "done" || i < cur ? "done" : i === cur ? "cur" : "";
        const extra = i === cur ? (status === "error" ? " err" : s.kind === "gate" || s.kind === "manual" ? " gate" : "") : "";
        return (
          <div key={s.key} className={`pipe-step ${state}${extra} ${s.phase === 2 ? "p2" : ""}`} role="listitem" aria-current={i === cur ? "step" : undefined}>
            <div className="pipe-bar" />
            <div className="pipe-label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function BlogTag({ name, color }: { name: string; color: string }) {
  return (
    <span className="row small muted" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
      <span className="blog-dot" style={{ background: color }} />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

export function PhaseNote({ children }: { children: React.ReactNode }) {
  return <div className="notice notice-warn small">{children}</div>;
}
