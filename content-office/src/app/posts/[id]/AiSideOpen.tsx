"use client";

import { useState } from "react";

/**
 * 🤖 진짜 ChatGPT·제미나이를 앱 오른쪽에 나란히 열기 (내 아이디·대화 기록·구독 그대로)
 * - 사이트가 다른 화면 안에 들어가는 걸 막아 두어서 '옆 창'으로 염
 * - 열 때 지금 글(또는 이미지 컨셉·재료)을 복사해 둠 → 거기서 붙여넣기만
 * - 거기서 만든 글·사진은 복사해서 편집기에 붙여넣으면 됨 (붙여넣기 기록·검수 반영됨)
 */
export default function AiSideOpen({ kind, getText }: { kind: "chatgpt" | "gemini"; getText: () => string }) {
  const [msg, setMsg] = useState("");
  const url = kind === "chatgpt" ? "https://chatgpt.com/" : "https://gemini.google.com/app";
  const name = kind === "chatgpt" ? "ChatGPT" : "제미나이";
  async function open() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(getText());
      copied = true;
    } catch {
      /* 복사 실패해도 창은 엶 */
    }
    const w = Math.round(window.screen.availWidth * 0.42);
    const left = window.screen.availWidth - w;
    const win = window.open(url, `side-${kind}`, `popup=yes,width=${w},height=${window.screen.availHeight},left=${left},top=0`);
    if (!win) window.open(url, "_blank");
    setMsg(copied ? `${name} 창을 오른쪽에 열었어요. 입력창에 붙여넣기(⌘V)만 하세요.` : `${name} 창을 열었어요.`);
    setTimeout(() => setMsg(""), 6000);
  }
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn btn-sm" onClick={open} title={`${name}를 내 아이디로 옆 창에 열고, 지금 내용을 복사해 둬요`}>
        {kind === "chatgpt" ? "💬 ChatGPT 옆에 열기 (글 복사)" : "🎨 제미나이 옆에 열기 (컨셉·재료 복사)"}
      </button>
      <span className="tiny muted">{msg || `내 계정으로 쓰고, 만든 ${kind === "chatgpt" ? "글" : "사진"}은 복사해서 본문에 붙여넣으세요. 붙여넣기는 기록되고 검수에도 반영돼요.`}</span>
    </div>
  );
}
