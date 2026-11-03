"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 간단한 POST 액션 버튼 (성공 시 화면 새로고침) */
export default function ActionButton({
  url,
  payload,
  label,
  className = "btn btn-sm",
  confirmText,
  method = "POST",
  redirect,
}: {
  url: string;
  payload?: unknown;
  label: string;
  className?: string;
  confirmText?: string;
  method?: string;
  redirect?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="row" style={{ gap: 4 }}>
      <button
        className={className}
        disabled={busy}
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (confirmText && !confirm(confirmText)) return;
          setBusy(true);
          setErr("");
          const res = await fetch(url, {
            method,
            headers: { "content-type": "application/json" },
            body: payload === undefined ? undefined : JSON.stringify(payload),
          });
          setBusy(false);
          if (!res.ok) {
            setErr((await res.json().catch(() => ({}))).error ?? "실패");
            return;
          }
          if (redirect) router.push(redirect);
          router.refresh();
        }}
      >
        {busy ? <span className="spinner" /> : label}
      </button>
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
    </span>
  );
}
