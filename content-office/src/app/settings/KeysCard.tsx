"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

type KeyRow = { env: string; label: string; group: string; state: "app" | "env" | "none" | "unreadable"; last4: string; at: string | null };

const STATE: Record<KeyRow["state"], [string, string]> = {
  app: ["badge-ok", "앱에 저장됨"],
  env: ["badge-ok", "서버 설정에 있음"],
  none: ["badge-warn", "없음"],
  unreadable: ["badge-bad", "다시 입력 필요"],
};

/** 🔑 API 키 직접 연결: 붙여 넣고 저장 → 암호화해서 저장, 맥·Render 둘 다 1분 안에 적용 */
export default function KeysCard({ initial, canSave }: { initial: KeyRow[]; canSave: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ env: string; text: string; bad?: boolean } | null>(null);

  async function send(env: string, payload: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      setRows(await api<KeyRow[]>("/api/settings/keys", "POST", { env, ...payload }));
      setEdit(null);
      setVal("");
      setMsg({ env, text: done });
      router.refresh(); // 위쪽 'AI 연결' 상태도 새로
    } catch (e) {
      setMsg({ env, text: (e as Error).message, bad: true });
    } finally {
      setBusy(false);
    }
  }

  const groups = Array.from(new Set(rows.map((r) => r.group)));
  return (
    <section className="card">
      <div className="card-head"><h2>🔑 API 키 직접 연결</h2></div>
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <p className="tiny muted">
          키를 붙여 넣고 저장하면 앱 비밀번호로 암호화해서 저장해요. 맥과 Render 둘 다 1분 안에 적용돼요. 화면에는 끝 4자리만 보여요.
          앱에 넣은 키가 서버 설정(.env.local·Render)보다 먼저 쓰이고, 지우면 서버 설정 키로 돌아가요.
        </p>
        {!canSave && <div className="notice notice-bad small" style={{ marginTop: 8 }}>앱 비밀번호(APP_PASSWORD)가 없는 서버라 여기서는 저장할 수 없어요.</div>}
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="tiny muted strong card-pad" style={{ paddingBottom: 4 }}>{g}</div>
          <div className="list">
            {rows.filter((r) => r.group === g).map((r) => (
              <div key={r.env} className="list-item" style={{ flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: "1 1 220px" }}>
                  <div className="strong small">{r.label}</div>
                  <div className="tiny muted mono">{r.env}</div>
                </div>
                <span className={`badge ${STATE[r.state][0]}`}>{STATE[r.state][1]}{r.state === "app" && r.last4 ? ` ••••${r.last4}` : ""}</span>
                <button className="btn btn-sm" disabled={!canSave || busy} onClick={() => { setEdit(edit === r.env ? null : r.env); setVal(""); setMsg(null); }}>
                  {edit === r.env ? "닫기" : r.state === "none" ? "키 입력" : "키 바꾸기"}
                </button>
                {r.state === "app" && (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm(`${r.label} 키를 앱에서 지울까요? (서버 설정 키가 있으면 그걸로 돌아가요)`) && send(r.env, { remove: true }, "지웠어요.")}>지우기</button>
                )}
                {edit === r.env && (
                  <div className="row" style={{ flexBasis: "100%", gap: 6, flexWrap: "nowrap" }}>
                    <input
                      className="input mono"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && val.trim() && send(r.env, { value: val }, "저장했어요. 바로 적용돼요.")}
                      placeholder="여기에 키 붙여 넣기"
                      aria-label={`${r.label} 키`}
                    />
                    <button className="btn btn-primary btn-sm" disabled={busy || !val.trim()} onClick={() => send(r.env, { value: val }, "저장했어요. 바로 적용돼요.")}>{busy ? <span className="spinner" /> : "저장"}</button>
                  </div>
                )}
                {msg?.env === r.env && <div className={`tiny ${msg.bad ? "" : "muted"}`} style={{ flexBasis: "100%", color: msg.bad ? "var(--bad)" : undefined }}>{msg.text}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
