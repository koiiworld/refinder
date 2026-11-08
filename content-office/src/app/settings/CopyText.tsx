"use client";

import { useState } from "react";

/** 값 + 복사 버튼 */
export default function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex" }}>
      <code style={{ userSelect: "all" }}>{text}</code>
      <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "복사됨" : "복사"}</button>
    </span>
  );
}
