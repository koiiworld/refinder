"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

/** ✅ 게시함 표시: 인스타·유튜브에 실제로 올린 뒤 직접 누름 (앱이 대신 올리지 않음) */
export default function PostedButton({ type, id, postedAt, onChange }: { type: "carousel" | "studio" | "video"; id: string; postedAt: string | null; onChange?: (postedAt: string | null) => void }) {
  const router = useRouter();
  const [at, setAt] = useState(postedAt);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (at && !confirm("게시함 표시를 취소할까요?")) return;
    setBusy(true);
    try {
      const r = await api<{ posted_at: string | null }>("/api/work/posted", "POST", { type, id, posted: !at });
      setAt(r.posted_at);
      onChange?.(r.posted_at);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <button type="button" className={`btn btn-sm ${at ? "" : "btn-primary"}`} disabled={busy} onClick={toggle} title={at ? "누르면 게시함 표시 취소" : "실제로 올렸으면 눌러 주세요"}>
      {busy ? <span className="spinner" /> : at ? `✅ 게시함 · ${new Date(at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}` : "✅ 게시함 표시"}
    </button>
  );
}
