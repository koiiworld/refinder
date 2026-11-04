"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stageLabel } from "@/lib/steps";
import { BlogTag, fmtDate } from "@/components/ui";
import { api } from "@/components/client-utils";

export type TrashRow = { id: string; title: string; topic: string; stage: string; status: string; deleted_at: string; blog_name: string; blog_color: string };

export default function TrashList({ rows }: { rows: TrashRow[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const all = rows.length > 0 && sel.length === rows.length;

  async function run(action: "restore" | "purge" | "empty", ask?: string) {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    try {
      const r = await api<{ count: number }>("/api/trash", "POST", { action, ids: sel });
      setMsg(action === "restore" ? `${r.count}개 글을 되살렸습니다. 진행 현황에서 볼 수 있어요.` : `${r.count}개 글을 완전히 삭제했습니다.`);
      setSel([]);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  if (!rows.length)
    return (
      <div className="stack">
        {msg && <div className="notice notice-ok small">{msg}</div>}
        <div className="card empty">휴지통이 비어 있습니다. <Link href="/posts" style={{ color: "var(--accent)" }}>진행 현황</Link>으로 돌아가기</div>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 12 }}>
      {msg && <div className="notice small">{msg}</div>}
      <div className="row between">
        <div className="row">
          <button className="btn btn-sm" disabled={busy || !sel.length} onClick={() => run("restore")}>↩ 되살리기{sel.length ? ` (${sel.length})` : ""}</button>
          <button
            className="btn btn-sm btn-danger"
            disabled={busy || !sel.length}
            onClick={() => run("purge", `선택한 ${sel.length}개 글을 완전히 삭제할까요?\n되돌릴 수 없습니다. (키워드는 다시 고를 수 있게 돌아갑니다)`)}
          >
            완전 삭제{sel.length ? ` (${sel.length})` : ""}
          </button>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run("empty", `휴지통의 글 ${rows.length}개를 모두 완전히 삭제할까요?\n되돌릴 수 없습니다.`)}>
          휴지통 비우기
        </button>
      </div>
      <section className="card">
        <div className="card-head" style={{ justifyContent: "flex-start", gap: 10 }}>
          <input type="checkbox" aria-label="모두 선택" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} />
          <h2 style={{ fontSize: 15 }}>삭제한 글 ({rows.length})</h2>
        </div>
        <div className="list">
          {rows.map((r) => (
            <label key={r.id} className="list-item" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap", cursor: "pointer", background: sel.includes(r.id) ? "var(--accent-soft)" : undefined }}>
              <input type="checkbox" checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} style={{ marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong ellipsis">{r.title}</div>
                <div className="row">
                  <BlogTag name={r.blog_name} color={r.blog_color} />
                  <span className="tiny muted">키워드 {r.topic} · {stageLabel(r.stage, r.status)} · 삭제 {fmtDate(r.deleted_at)}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
