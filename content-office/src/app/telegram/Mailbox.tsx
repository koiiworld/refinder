"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";

type Msg = { id: string; direction: "out" | "in"; kind: string; chat_id: string; chat_name: string; text: string; status: string; error: string | null; created_at: string };
const KIND: Record<string, string> = { routine: "🔁 루틴 알림", todo: "✅ 할 일 알림", briefing: "☀️ 업무 브리핑", test: "🧪 시험 메시지", manual: "✉️ 직접 보냄", reply: "↩️ 자동 답", text: "💬 메시지", button: "🔘 버튼 누름" };
const when = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 💬 받은 메시지함 · 보낸 메시지함 · 직접 보내기 */
export default function Mailbox({ connected, initialCounts }: { connected: boolean; initialCounts: { in: number; out: number; unread: number } }) {
  const [box, setBox] = useState<"in" | "out">("in");
  const [list, setList] = useState<Msg[] | null>(null);
  const [counts, setCounts] = useState(initialCounts);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load(b = box) {
    try {
      const r = await api<{ list: Msg[]; counts: typeof counts }>(`/api/telegram?box=${b}`);
      setList(r.list);
      setCounts(b === "in" ? { ...r.counts, unread: 0 } : r.counts);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }
  useEffect(() => {
    setList(null);
    void load(box);
    // 받은 메시지는 서버가 1분마다 가져와요 → 화면도 30초마다 새로
    const t = setInterval(() => void load(box), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);

  async function send() {
    if (!text.trim() || !confirm("내 텔레그램으로 이 메시지를 보낼까요?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/telegram", "POST", { action: "send", text });
      setText("");
      setMsg({ ok: true, text: "보냈어요. 보낸 메시지함에 기록됐어요." });
      setBox("out");
      void load("out");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2>💬 메시지함</h2>
        <div className="row" style={{ gap: 6 }}>
          <button className={`chip ${box === "in" ? "on" : ""}`} onClick={() => setBox("in")}>📥 받은 메시지함 ({counts.in}){counts.unread > 0 && box !== "in" ? <span className="badge badge-bad" style={{ marginLeft: 4 }}>새 {counts.unread}</span> : null}</button>
          <button className={`chip ${box === "out" ? "on" : ""}`} onClick={() => setBox("out")}>📤 보낸 메시지함 ({counts.out})</button>
          <button className="btn btn-sm btn-ghost" onClick={() => load()}>새로고침</button>
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        {connected ? (
          <div className="stack" style={{ gap: 6 }}>
            <textarea className="textarea" style={{ minHeight: 60 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="✉️ 내 텔레그램으로 보낼 메모 (예: 내일 아침 10시 촬영 준비)" aria-label="보낼 메시지" />
            <div className="row between">
              <span className="tiny muted">보내기를 눌러야만 가요. 보낸 건 보낸 메시지함에 남아요.</span>
              <button className="btn btn-sm btn-primary" disabled={busy || !text.trim()} onClick={send}>{busy ? <span className="spinner" /> : "보내기"}</button>
            </div>
          </div>
        ) : (
          <div className="notice small">텔레그램을 연결하면 보내고 받은 메시지가 여기 모여요.</div>
        )}
        {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`}>{msg.text}</div>}
        <span className="tiny muted">
          {box === "in" ? "봇에게 보낸 메시지와 누른 버튼(완료 처리·30분 뒤)이 와요. 서버가 1분마다 가져와요." : "앱이 보낸 루틴·할 일 알림, 브리핑, 시험 메시지, 직접 보낸 메시지예요."}
        </span>
        <div className="list">
          {list === null && <div className="list-item small muted"><span className="spinner" /> 불러오는 중…</div>}
          {list?.length === 0 && <div className="list-item small muted">{box === "in" ? "아직 받은 메시지가 없어요. 텔레그램에서 내 봇에게 말을 걸어 보세요." : "아직 보낸 메시지가 없어요. (이 기능을 켠 뒤부터 기록돼요)"}</div>}
          {list?.map((m) => (
            <button key={m.id} type="button" className="list-item" onClick={() => setOpen(open === m.id ? null : m.id)} style={{ textAlign: "left", width: "100%", border: 0, background: "none", cursor: "pointer", alignItems: "flex-start", gap: 10, flexWrap: "nowrap" }}>
              <span className="tiny mono muted" style={{ width: 92, flexShrink: 0, paddingTop: 2 }}>{when(m.created_at)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tiny muted">{KIND[m.kind] ?? m.kind}{m.chat_name ? ` · ${m.chat_name}` : ""}</div>
                <div className="small" style={open === m.id ? { whiteSpace: "pre-wrap", wordBreak: "break-word" } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</div>
                {m.error && <div className="tiny" style={{ color: "var(--bad)" }}>{m.error}</div>}
              </div>
              {m.direction === "out" && <span className={`badge ${m.status === "failed" ? "badge-bad" : "badge-ok"}`}>{m.status === "failed" ? "실패" : "보냄"}</span>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
