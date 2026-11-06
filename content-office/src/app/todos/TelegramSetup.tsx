"use client";

import { useState } from "react";
import { api } from "@/components/client-utils";

/** 텔레그램 연결 도우미: 채팅 ID 찾기(메시지 안 보냄) · 시험 메시지(누를 때만) */
export default function TelegramSetup({ connected, hasToken }: { connected: boolean; hasToken: boolean }) {
  const [chats, setChats] = useState<{ id: string; name: string }[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  async function find() {
    setBusy("find");
    setMsg(null);
    try {
      const r = await api<{ chats: { id: string; name: string }[] }>("/api/telegram", "POST", { action: "find_chat" });
      setChats(r.chats);
      if (!r.chats.length) setMsg({ ok: false, text: "아직 봇에게 온 메시지가 없어요. 텔레그램에서 내 봇에게 아무 말이나 보낸 뒤 다시 눌러 주세요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }
  async function test() {
    if (!confirm("텔레그램으로 시험 메시지 1개를 보낼까요?")) return;
    setBusy("test");
    setMsg(null);
    try {
      await api("/api/telegram", "POST", { action: "test" });
      setMsg({ ok: true, text: "시험 메시지를 보냈어요. 텔레그램을 확인해 보세요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }
  return (
    <details className="card card-pad" open={!connected}>
      <summary className="small" style={{ cursor: "pointer" }}><b>🔔 텔레그램 알림 {connected ? "연결됨" : "연결 전"}</b></summary>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {!hasToken ? (
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>텔레그램에서 <b>@BotFather</b> 검색 → <code>/newbot</code> → 봇 이름 정하기 → <b>토큰</b>을 받아요.</li>
            <li>Render → Environment 에 <code>TELEGRAM_BOT_TOKEN</code> 으로 토큰을 넣어요.</li>
            <li>내 봇에게 아무 말이나 보낸 뒤, 여기서 &apos;채팅 ID 찾기&apos;를 눌러요.</li>
          </ol>
        ) : !connected ? (
          <span className="small">토큰은 들어 있어요. 내 봇에게 아무 말이나 보낸 뒤 &apos;채팅 ID 찾기&apos;를 누르고, 나온 숫자를 Render → Environment 에 <code>TELEGRAM_CHAT_ID</code> 로 넣으세요.</span>
        ) : (
          <span className="small">시간을 정한 할 일에서 🔔을 켜면 그 시각에 알려 줘요.</span>
        )}
        <div className="row" style={{ gap: 6 }}>
          {hasToken && <button className="btn btn-sm" disabled={!!busy} onClick={find}>{busy === "find" ? <span className="spinner" /> : "채팅 ID 찾기"}</button>}
          {connected && <button className="btn btn-sm" disabled={!!busy} onClick={test}>{busy === "test" ? <span className="spinner" /> : "시험 메시지 보내기"}</button>}
        </div>
        {chats?.map((c) => <div key={c.id} className="small">💬 {c.name} · 채팅 ID <b><code>{c.id}</code></b></div>)}
        {msg && <div className={`notice ${msg.ok ? "notice-ok" : "notice-bad"} small`}>{msg.text}</div>}
      </div>
    </details>
  );
}
