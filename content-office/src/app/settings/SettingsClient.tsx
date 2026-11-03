"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";
import { STEP_AI_LABEL, type StepKey } from "@/lib/steps";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";

type Conn = { provider: string; label: string; envKey: string; connected: boolean; media?: boolean };

const PROVIDER_NAMES: Record<string, string> = { openai: "ChatGPT (OpenAI)", anthropic: "Claude (Anthropic)", google: "Gemini (Google)" };

export default function SettingsClient({ connections, settings, db, data, month }: { connections: Conn[]; settings: AppSettings; db: string; data: { naverAd: boolean; datalab: boolean; youtube: boolean }; month: { runs: number; cost: number } }) {
  const [stepAi, setStepAi] = useState(settings.stepAi);
  const [pricing, setPricing] = useState<Record<string, { input: string; output: string }>>(() => {
    const keys = Array.from(new Set([...Object.values(settings.stepAi).map((a) => `${a.provider}:${a.model}`), "google:gemini-3.5-flash", ...Object.keys(settings.pricing)]));
    return Object.fromEntries(keys.map((k) => [k, { input: String(settings.pricing[k]?.input ?? ""), output: String(settings.pricing[k]?.output ?? "") }]));
  });
  const [msg, setMsg] = useState("");
  const [models, setModels] = useState<Record<string, string>>({});
  const conn = (p: string) => connections.find((c) => c.provider === p)?.connected;

  async function save(patch: Partial<AppSettings>) {
    await api("/api/settings", "PUT", patch);
    setMsg("저장했습니다.");
    setTimeout(() => setMsg(""), 1500);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="card-head"><h2>단계별 AI</h2>{msg && <span className="badge badge-ok">{msg}</span>}</div>
        <div className="list">
          {(Object.keys(STEP_AI_LABEL) as StepKey[]).map((k) => {
            const a = stepAi[k];
            return (
              <div key={k} className="list-item" style={{ flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <div className="strong small">{STEP_AI_LABEL[k]}</div>
                  <div className="tiny muted">{conn(a.provider) ? "연결됨" : "미연결"} · 쓸 수 없으면(미연결·크레딧 부족·혼잡) 연결된 다른 AI로 자동 대체</div>
                </div>
                <select className="select" style={{ width: 190 }} value={a.provider} onChange={(e) => setStepAi({ ...stepAi, [k]: { provider: e.target.value as typeof a.provider, model: { openai: "gpt-5.4-mini", anthropic: "claude-sonnet-5-5", google: "gemini-3.5-flash" }[e.target.value] ?? "" } })} aria-label={`${STEP_AI_LABEL[k]} AI`}>
                  {Object.entries(PROVIDER_NAMES).map(([id, name]) => <option key={id} value={id}>{name}{conn(id) ? "" : " - 미연결"}</option>)}
                </select>
                <input className="input" style={{ width: 190 }} value={a.model} onChange={(e) => setStepAi({ ...stepAi, [k]: { ...a, model: e.target.value } })} aria-label="모델 ID" />
              </div>
            );
          })}
          <div className="list-item small muted">⑤ 이미지 생성: Higgsfield (버튼을 누를 때만 생성) · ② 키워드 선택·⑦ 발행: 직접</div>
        </div>
        <div className="card-pad row" style={{ paddingTop: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={() => save({ stepAi })}>단계별 AI 저장</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>AI 연결</h2><span className="small muted">이번 달 {month.runs}회 · {fmtUsd(month.cost)}</span></div>
        <div className="list">
          {connections.map((c) => (
            <div key={c.provider} className="list-item" style={{ flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <div className="strong">{c.label}</div>
                <div className="tiny muted mono">{c.envKey}</div>
              </div>
              <span className={`badge ${c.connected ? "badge-ok" : "badge-warn"}`}>{c.connected ? "키 연결됨" : "미연결"}</span>
              <button
                className="btn btn-sm"
                disabled={!c.connected}
                onClick={async () => {
                  setModels((m) => ({ ...m, [c.provider]: "확인 중…" }));
                  try {
                    const r = await api<{ models: string[]; note?: string }>(`/api/ai/models?provider=${c.provider}`);
                    setModels((m) => ({ ...m, [c.provider]: [r.note, ...r.models].filter(Boolean).join("  ·  ") }));
                  } catch (e) {
                    setModels((m) => ({ ...m, [c.provider]: (e as Error).message }));
                  }
                }}
              >
                {c.media ? "연결 확인" : "모델 목록"}
              </button>
              {models[c.provider] && <div className="tiny mono wrap-any" style={{ flexBasis: "100%", maxHeight: 100, overflowY: "auto", background: "var(--panel-2)", padding: 8, borderRadius: 8 }}>{models[c.provider]}</div>}
            </div>
          ))}
          <div className="list-item small" style={{ flexWrap: "wrap", gap: 6 }}>
            <span className="muted">키워드 데이터:</span>
            <span className={`badge ${data.naverAd ? "badge-ok" : "badge-warn"}`}>네이버 검색광고 {data.naverAd ? "연결됨" : "미연결"}</span>
            <span className={`badge ${data.datalab ? "badge-ok" : "badge-warn"}`}>네이버 데이터랩 {data.datalab ? "연결됨" : "미연결"}</span>
            <span className={`badge ${data.youtube ? "badge-ok" : "badge-warn"}`}>YouTube {data.youtube ? "연결됨" : "미연결"}</span>
          </div>
        </div>
        <p className="tiny muted card-pad">키 연결됨 = 키가 들어 있음. ChatGPT·Claude는 크레딧을 충전해야 실제로 쓰이고, 그 전에는 Gemini가 대신 처리합니다.</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>AI 단가 (USD / 100만 토큰)</h2></div>
        <div className="card-pad stack">
          <p className="small muted">각 사 가격표를 보고 입력하면 비용이 원화와 함께 계산됩니다. 비워 두면 0으로 기록됩니다.</p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>제공자:모델</th><th>입력</th><th>출력</th></tr></thead>
              <tbody>
                {Object.entries(pricing).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono">{k}</td>
                    <td><input className="input" style={{ width: 100 }} inputMode="decimal" value={v.input} onChange={(e) => setPricing({ ...pricing, [k]: { ...v, input: e.target.value } })} /></td>
                    <td><input className="input" style={{ width: 100 }} inputMode="decimal" value={v.output} onChange={(e) => setPricing({ ...pricing, [k]: { ...v, output: e.target.value } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => save({ pricing: Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, { input: Number(v.input) || 0, output: Number(v.output) || 0 }])) })}>단가 저장</button>
        </div>
      </section>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 15 }}>데이터 · 백업</h2>
        <p className="small">저장 위치: <b>{db === "pglite" ? "내장 데이터베이스" : "외부 PostgreSQL"}</b> · 앱을 꺼도 유지됩니다.</p>
        <div className="row">
          <a className="btn btn-sm" href="/api/export?scope=all">전체 백업 (JSON)</a>
          <a className="btn btn-sm" href="/api/export?scope=settings">블로그 설정만</a>
        </div>
      </section>
    </div>
  );
}
