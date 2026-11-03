"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";
import { api } from "@/components/client-utils";

type Conn = { provider: string; label: string; envKey: string; connected: boolean; media?: boolean };

export default function SettingsClient({ connections, settings, usedModels, db, naver, naverAd, youtube }: { connections: Conn[]; settings: AppSettings; usedModels: string[]; db: string; naver: boolean; naverAd: boolean; youtube: boolean }) {
  const [fallback, setFallback] = useState(settings.fallbackToTemplate);
  const keys = Array.from(new Set([...usedModels, ...Object.keys(settings.pricing)]));
  const [pricing, setPricing] = useState<Record<string, { input: string; output: string }>>(
    Object.fromEntries(keys.map((k) => [k, { input: String(settings.pricing[k]?.input ?? ""), output: String(settings.pricing[k]?.output ?? "") }])),
  );
  const [newKey, setNewKey] = useState("");
  const [models, setModels] = useState<Record<string, string[] | string>>({});
  const [msg, setMsg] = useState("");

  async function save(patch: Partial<AppSettings>) {
    await api("/api/settings", "PUT", patch);
    setMsg("저장했습니다.");
    setTimeout(() => setMsg(""), 1500);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="card-head"><h2>AI 연결 상태</h2></div>
        <div className="list">
          {connections.map((c) => (
            <div key={c.provider} className="list-item" style={{ flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <div className="strong">{c.label}</div>
                <div className="tiny muted mono">{c.envKey}</div>
              </div>
              <span className={`badge ${c.connected ? "badge-ok" : "badge-warn"}`}>{c.connected ? "연결됨" : "미연결"}</span>
              <button
                className="btn btn-sm"
                disabled={!c.connected}
                onClick={async () => {
                  setModels((m) => ({ ...m, [c.provider]: "불러오는 중…" }));
                  try {
                    const r = await api<{ models: string[]; note?: string }>(`/api/ai/models?provider=${c.provider}`);
                    setModels((m) => ({ ...m, [c.provider]: r.note ? [r.note, ...r.models] : r.models }));
                  } catch (e) {
                    setModels((m) => ({ ...m, [c.provider]: (e as Error).message }));
                  }
                }}
              >
                {c.media ? "연결 확인" : "모델 목록 불러오기"}
              </button>
              {models[c.provider] && (
                <div className="tiny mono wrap-any" style={{ flexBasis: "100%", maxHeight: 120, overflowY: "auto", background: "var(--panel-2)", padding: 8, borderRadius: 8 }}>
                  {Array.isArray(models[c.provider]) ? (models[c.provider] as string[]).join("  ·  ") : models[c.provider]}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="card-pad stack small" style={{ borderTop: "1px solid var(--line)" }}>
          <b>연결 방법</b>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li><span className="mono">content-office/.env.example</span>을 <span className="mono">.env.local</span>로 복사</li>
            <li>사용할 서비스의 API 키 입력 (OpenAI·Anthropic·Google AI Studio 콘솔에서 발급, Higgsfield는 console.higgsfield.ai의 키ID:시크릿)</li>
            <li>서버 재시작 (<span className="mono">npm run dev</span> 또는 <span className="mono">npm start</span>)</li>
          </ol>
          <span className="muted">키는 서버 프로세스에서만 읽힙니다. 화면·DB·내보내기 파일에 노출되지 않습니다.</span>
        </div>
      </section>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 15 }}>미연결 시 동작</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={fallback}
            onChange={(e) => {
              setFallback(e.target.checked);
              void save({ fallbackToTemplate: e.target.checked });
            }}
          />
          배정된 AI가 연결되지 않았으면 '템플릿(오프라인)' 초안으로 대체
        </label>
        <p className="small muted">템플릿 모드는 AI가 아닙니다. 입력한 주제·출처로 기획안/원고의 뼈대만 만들고 모든 결과에 '템플릿'임을 표시합니다. 끄면 미연결 AI 작업은 오류로 처리됩니다. 글감 추천·부분 수정은 템플릿을 쓰지 않습니다.</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>AI 단가 (USD / 100만 토큰)</h2>{msg && <span className="badge badge-ok">{msg}</span>}</div>
        <div className="card-pad stack">
          <p className="small muted">각 사 공식 가격표를 확인해 입력하세요. 입력하지 않은 모델은 비용 0으로 표시되고 토큰 수만 기록됩니다. (앱이 임의로 가격을 추정하지 않습니다) 화면의 비용은 1달러 = 1,400원 기준 원화를 괄호로 함께 표시합니다.</p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>제공자:모델</th><th>입력 단가</th><th>출력 단가</th></tr></thead>
              <tbody>
                {Object.entries(pricing).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono">{k}</td>
                    <td><input className="input" style={{ width: 110 }} inputMode="decimal" value={v.input} onChange={(e) => setPricing({ ...pricing, [k]: { ...v, input: e.target.value } })} /></td>
                    <td><input className="input" style={{ width: 110 }} inputMode="decimal" value={v.output} onChange={(e) => setPricing({ ...pricing, [k]: { ...v, output: e.target.value } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <input className="input" style={{ maxWidth: 280 }} placeholder="openai:모델ID" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <button className="btn btn-sm" disabled={!/^(openai|anthropic|google):.+/.test(newKey)} onClick={() => { setPricing({ ...pricing, [newKey]: { input: "", output: "" } }); setNewKey(""); }}>모델 추가</button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => save({ pricing: Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, { input: Number(v.input) || 0, output: Number(v.output) || 0 }])) })}
            >
              단가 저장
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 15 }}>데이터 저장소</h2>
          <p className="small">
            현재: <b>{db === "pglite" ? "내장 PostgreSQL (PGlite, ./data/pglite)" : "외부 PostgreSQL (DATABASE_URL)"}</b>
          </p>
          <p className="small muted">모든 작업 상태·버전·기록은 DB에 저장되어 앱을 종료해도 유지됩니다. Supabase를 쓰려면 DATABASE_URL에 연결 문자열을 넣으세요.</p>
          <p className="small">네이버 데이터랩: <span className={`badge ${naver ? "badge-ok" : "badge-warn"}`}>{naver ? "연결됨" : "미연결"}</span></p>
          <p className="small">네이버 검색광고: <span className={`badge ${naverAd ? "badge-ok" : "badge-warn"}`}>{naverAd ? "연결됨" : "미연결"}</span> · YouTube: <span className={`badge ${youtube ? "badge-ok" : "badge-warn"}`}>{youtube ? "연결됨" : "미연결"}</span></p>
        </section>
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 15 }}>내보내기 · 백업</h2>
          <div className="row">
            <a className="btn" href="/api/export?scope=all">전체 백업 (JSON)</a>
            <a className="btn" href="/api/export?scope=settings">블로그 설정만</a>
          </div>
          <p className="small muted">프로젝트별 원고·패키지는 각 프로젝트의 '발행 패키지' 탭에서 내려받을 수 있습니다. API 키는 포함되지 않습니다.</p>
        </section>
      </div>
    </div>
  );
}
