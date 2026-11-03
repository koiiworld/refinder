"use client";

import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, width: "100%" }}>
      <form
        className="card card-pad stack"
        style={{ width: "min(360px, 100%)" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
          if (!res.ok) return setErr("비밀번호가 올바르지 않습니다.");
          const next = new URLSearchParams(location.search).get("next") || "/";
          location.href = next.startsWith("/") ? next : "/";
        }}
      >
        <h1 style={{ fontSize: 18 }}>AI 콘텐츠 오피스</h1>
        <input className="input" type="password" placeholder="접속 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <div className="notice notice-bad small">{err}</div>}
        <button className="btn btn-primary">들어가기</button>
      </form>
    </div>
  );
}
