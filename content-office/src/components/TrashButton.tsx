"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

/** 상세 화면의 🗑 휴지통으로 버튼 → 옮긴 뒤 목록으로 */
export default function TrashButton({ id, back, label = "이 프로젝트" }: { id: string; back: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`${label}를 휴지통으로 옮길까요?\n휴지통에서 30일 안에 되살릴 수 있어요.`)) return;
        setBusy(true);
        try {
          await api("/api/trash", "POST", { action: "trash", ids: [id] });
          router.push(back);
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
          setBusy(false);
        }
      }}
    >
      🗑 휴지통으로
    </button>
  );
}
