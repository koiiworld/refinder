import { fmtUsd } from "@/components/ui";
import { todayUsage } from "@/lib/usage";

const AI_NAMES: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", google: "Gemini" };

/** 오늘 쓴 AI 비용 (한국 시간 0시부터) — 단계별·모델별 (대시보드) */
export default async function TodayCost() {
  const usage = await todayUsage();
  return (
    <details className="card cost-card">
      <summary className="card-head" style={{ flexWrap: "wrap", cursor: "pointer" }}>
        <h2 style={{ fontSize: 15 }}><span className="cost-arrow">▸</span> 오늘 쓴 AI 비용 <span className="small muted">(한국 시간 0시부터 · 눌러서 자세히)</span></h2>
        <span className="badge badge-accent">합계 {fmtUsd(usage.total)}</span>
      </summary>
      {usage.models.length ? (
        <div className="card-pad stack" style={{ gap: 14 }}>
          <div>
            <div className="label">어디에 썼나 (단계별)</div>
            <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
              {usage.steps.map((s) => (
                <div key={s.step} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <div className="row between" style={{ flexWrap: "nowrap" }}>
                    <b className="small">{s.label}</b>
                    <b className="small" style={{ flexShrink: 0 }}>{fmtUsd(s.cost)}</b>
                  </div>
                  {s.models.filter((m) => m.calls > 0).map((m) => (
                    <div key={m.provider + m.model} className="row between tiny muted" style={{ flexWrap: "nowrap" }}>
                      <span className="ellipsis">{AI_NAMES[m.provider] ?? m.provider} {m.model} · {m.calls}회</span>
                      <span style={{ flexShrink: 0 }}>{fmtUsd(m.cost)}</span>
                    </div>
                  ))}
                  {s.failed > 0 && <div className="tiny muted">실패(거절) {s.failed}회 · 비용 없음</div>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="label">모델별 합계</div>
            <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
              {usage.models.filter((m) => m.calls > 0).map((m) => (
                <div key={m.provider + m.model} className="list-item row between" style={{ flexWrap: "nowrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small"><b>{AI_NAMES[m.provider] ?? m.provider}</b> <span className="tiny muted">{m.model}</span></div>
                    <div className="tiny muted">{m.calls}회 · 토큰 입력 {m.inputTokens.toLocaleString()} / 출력 {m.outputTokens.toLocaleString()}</div>
                  </div>
                  <b className="small" style={{ flexShrink: 0 }}>{fmtUsd(m.cost)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="card-pad small muted">오늘은 아직 AI를 쓰지 않았습니다.</p>
      )}
      <p className="card-pad tiny muted">
        토큰 수 × 설정의 단가로 계산한 추정치입니다. 실제 청구액은 각 사 사용량 페이지가 기준이고, Gemini 무료 사용분은 청구되지 않습니다. &apos;실패&apos;는 대부분 크레딧 부족·혼잡으로 거절된 호출이라 비용이 들지 않습니다(답이 중간에 잘린 경우는 쓴 토큰만큼 포함).
        {usage.images > 0 && ` · 오늘 Higgsfield 이미지 생성 ${usage.images}건 (크레딧은 Higgsfield 사이트에서 확인)`}
      </p>
    </details>
  );
}
