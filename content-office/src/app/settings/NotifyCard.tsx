"use client";

import { useState } from "react";
import { api } from "@/components/client-utils";

type Policy = { quietOn: boolean; quietStart: string; quietEnd: string; briefingOn: boolean; briefingTime: string };
type Log = { id: string; kind: string; round: number; send_at: string; status: string; error: string | null; sent_at: string | null; name: string; run_date: string };
const ST: Record<string, [string, string]> = { pending: ["예약", ""], sending: ["보내는 중", ""], sent: ["보냄", "badge-ok"], failed: ["실패", "badge-bad"], unknown: ["결과 미확인", "badge-warn"], canceled: ["취소 (완료됨)", ""], skipped: ["건너뜀", ""] };
const KIND: Record<string, string> = { first: "첫 알림", remind: "재알림", snooze: "30분 뒤" };

/** 알림 설정: 텔레그램 연결 상태 · 시험 메시지 · 방해 금지 · 아침 브리핑 · 발송 기록 */
export default function NotifyCard({ connected, bot, initial, log: initialLog }: { connected: boolean; bot: string; initial: Policy; log: Log[] }) {
  const [p, setP] = useState(initial);
  const [log, setLog] = useState(initialLog);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(patch: Partial<Policy>) {
    try {
      setP(await api<Policy>("/api/routines/policy", "PUT", patch));
      setMsg({ ok: true, text: "저장했어요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }
  return (
    <section id="notify" className="card">
      <div className="card-head"><h2>🔔 알림 설정 (텔레그램)</h2><span className={`badge ${connected ? "badge-ok" : "badge-warn"}`}>{connected ? "연결 확인" : "연결 전"}</span></div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <span className="small">{connected ? `봇 ${bot || "연결됨"} → 내 텔레그램 채팅으로 보내요.` : "봇 토큰과 채팅 ID를 넣으면 루틴·할 일 알림이 텔레그램으로 와요."} <a href="/todos" style={{ color: "var(--accent)" }}>연결·시험 메시지는 할 일 화면에서</a></span>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={p.quietOn} onChange={(e) => save({ quietOn: e.target.checked })} /> 방해 금지
          <input className="input" type="time" style={{ width: 110 }} value={p.quietStart} onChange={(e) => save({ quietStart: e.target.value })} aria-label="방해 금지 시작" /> ~
          <input className="input" type="time" style={{ width: 110 }} value={p.quietEnd} onChange={(e) => save({ quietEnd: e.target.value })} aria-label="방해 금지 끝" />
        </label>
        <span className="tiny muted">방해 금지 시간에 보낼 알림은 끝나는 시각으로 미뤄요. 그때 이미 완료했거나 마감이 지났으면 보내지 않아요.</span>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={p.briefingOn} onChange={(e) => save({ briefingOn: e.target.checked })} /> ☀️ 오늘의 업무 브리핑
          <input className="input" type="time" style={{ width: 110 }} value={p.briefingTime} onChange={(e) => save({ briefingTime: e.target.value })} aria-label="브리핑 시각" />
          <span className="tiny muted">오늘 루틴·할 일을 하루 한 번 모아서 (개별 알림과 따로)</span>
        </label>
        <span className="tiny muted">루틴마다 정한 시각·재알림이 이 기본값보다 먼저예요. 승인 대기·AI 오류 알림은 다음 단계에서 이어 붙일 예정이에요.</span>
        {msg && <div className={`notice small ${msg.ok ? "" : "notice-bad"}`}>{msg.text}</div>}
        <details>
          <summary className="small strong" style={{ cursor: "pointer" }}>발송 기록 ({log.length})</summary>
          <button className="btn btn-sm btn-ghost" onClick={async () => setLog((await api<{ log: Log[] }>("/api/routines/policy")).log)}>새로고침</button>
          <div className="list">
            {log.map((l) => (
              <div key={l.id} className="list-item" style={{ gap: 8, flexWrap: "nowrap" }}>
                <span className="tiny mono" style={{ width: 120, flexShrink: 0 }}>{new Date(l.sent_at ?? l.send_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="small ellipsis" style={{ flex: 1 }}>{l.name} · {KIND[l.kind] ?? l.kind}{l.round > 0 ? ` ${l.round}` : ""}{l.error ? <span className="tiny muted"> · {l.error}</span> : null}</span>
                <span className={`badge ${ST[l.status]?.[1] ?? ""}`}>{ST[l.status]?.[0] ?? l.status}</span>
              </div>
            ))}
            {!log.length && <div className="list-item small muted">아직 기록이 없어요.</div>}
          </div>
        </details>
      </div>
    </section>
  );
}
