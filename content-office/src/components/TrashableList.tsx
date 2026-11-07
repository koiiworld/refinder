"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

export type TrashableItem = { id: string; href: string; thumb?: string | null; title: string; sub: string; badge?: string; badgeClass?: string };

/** 목록 + 체크박스 → 🗑 휴지통으로 (휴지통에서 되살리기·완전 삭제) */
export default function TrashableList({ title, items }: { title: string; items: TrashableItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const all = items.length > 0 && sel.length === items.length;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function trash(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ count: number }>("/api/trash", "POST", { action: "trash", ids });
      setMsg(`${r.count}개를 휴지통으로 옮겼어요. 휴지통에서 되살릴 수 있어요.`);
      setSel([]);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="card-head" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          {items.length > 0 && <input type="checkbox" aria-label="모두 선택" checked={all} onChange={() => setSel(all ? [] : items.map((i) => i.id))} />}
          <h2 style={{ fontSize: 15 }}>{title} ({items.length})</h2>
        </div>
        {sel.length > 0 && (
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => trash(sel)}>
            🗑 휴지통으로 ({sel.length})
          </button>
        )}
      </div>
      {msg && <div className="card-pad" style={{ paddingTop: 0 }}><div className="notice small">{msg} <Link href="/trash" style={{ color: "var(--accent)" }}>휴지통 보기</Link></div></div>}
      <div className="list">
        {!items.length && <div className="list-item small muted">아직 없어요.</div>}
        {items.map((it) => (
          <div key={it.id} className="list-item" style={{ gap: 10, flexWrap: "nowrap", background: sel.includes(it.id) ? "var(--accent-soft)" : undefined }}>
            <input type="checkbox" aria-label={`${it.title} 선택`} checked={sel.includes(it.id)} onChange={() => toggle(it.id)} style={{ flexShrink: 0 }} />
            <Link href={it.href} className="row" style={{ gap: 10, flex: 1, minWidth: 0, flexWrap: "nowrap", color: "inherit" }}>
              {it.thumb ? <img src={it.thumb} alt="" style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} /> : <span style={{ width: 40, textAlign: "center" }}>🎞</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong ellipsis">{it.title}</div>
                <div className="tiny muted" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.sub}</div>
              </div>
              {it.badge && <span className={`badge ${it.badgeClass ?? ""}`}>{it.badge}</span>}
            </Link>
            <button className="btn btn-sm btn-ghost" title="휴지통으로" aria-label={`${it.title} 휴지통으로`} disabled={busy} onClick={() => trash([it.id])} style={{ flexShrink: 0 }}>
              🗑
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
