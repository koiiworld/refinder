"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stageLabel } from "@/lib/steps";
import { BlogTag, fmtDate } from "@/components/ui";
import { api } from "@/components/client-utils";

/** 30일 자동 완전 삭제까지 남은 날 */
const left = (at: string) => Math.max(0, 30 - Math.floor((Date.now() - new Date(at).getTime()) / 86400000));
export type TrashRow = { id: string; title: string; topic: string; stage: string; status: string; deleted_at: string; blog_name: string; blog_color: string };

export type MediaTrashRow = { id: string; title: string; kind: string; deleted_at: string };

export default function TrashList({ rows, media = [] }: { rows: TrashRow[]; media?: MediaTrashRow[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const all = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const allMedia = media.length > 0 && media.every((r) => sel.includes(r.id));
  const total = rows.length + media.length;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function run(action: "restore" | "purge" | "empty", ask?: string) {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    try {
      const r = await api<{ count: number }>("/api/trash", "POST", { action, ids: sel });
      setMsg(action === "restore" ? `${r.count}개를 되살렸습니다. 원래 있던 목록에서 볼 수 있어요.` : `${r.count}개를 완전히 삭제했습니다.`);
      setSel([]);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  if (!total)
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
            onClick={() => run("purge", `선택한 ${sel.length}개를 완전히 삭제할까요?\n되돌릴 수 없습니다. (키워드는 다시 고를 수 있게 돌아갑니다)`)}
          >
            완전 삭제{sel.length ? ` (${sel.length})` : ""}
          </button>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run("empty", `휴지통의 ${total}개를 모두 완전히 삭제할까요?\n되돌릴 수 없습니다.`)}>
          휴지통 비우기
        </button>
      </div>
      {rows.length > 0 && <section className="card">
        <div className="card-head" style={{ justifyContent: "flex-start", gap: 10 }}>
          <input type="checkbox" aria-label="모두 선택" checked={all} onChange={() => setSel((s) => (all ? s.filter((x) => !rows.some((r) => r.id === x)) : Array.from(new Set([...s, ...rows.map((r) => r.id)]))))} />
          <h2 style={{ fontSize: 15 }}>삭제한 글 ({rows.length})</h2>
        </div>
        <div className="list">
          {rows.map((r) => (
            <label key={r.id} className="list-item" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap", cursor: "pointer", background: sel.includes(r.id) ? "var(--accent-soft)" : undefined }}>
              <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong ellipsis">{r.title}</div>
                <div className="row">
                  <BlogTag name={r.blog_name} color={r.blog_color} />
                  <span className="tiny muted">키워드 {r.topic} · {stageLabel(r.stage, r.status)} · 삭제 {fmtDate(r.deleted_at)} · {left(r.deleted_at)}일 뒤 자동 완전 삭제</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>}
      {media.length > 0 && (
        <section className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 10 }}>
            <input type="checkbox" aria-label="릴스·영상 편집 모두 선택" checked={allMedia} onChange={() => setSel((s) => (allMedia ? s.filter((x) => !media.some((r) => r.id === x)) : Array.from(new Set([...s, ...media.map((r) => r.id)]))))} />
            <h2 style={{ fontSize: 15 }}>그 밖에 지운 것 ({media.length})</h2>
          </div>
          <div className="list">
            {media.map((r) => (
              <label key={r.id} className="list-item" style={{ gap: 10, flexWrap: "nowrap", cursor: "pointer", background: sel.includes(r.id) ? "var(--accent-soft)" : undefined }}>
                <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong ellipsis">{r.title || "제목 없음"}</div>
                  <span className="tiny muted">{r.kind === "reel" ? "✂️ 릴스 편집" : r.kind === "edit" ? "🎞 영상 편집" : r.kind === "video" ? "🏭 영상공장" : r.kind} · 삭제 {fmtDate(r.deleted_at)} · {left(r.deleted_at)}일 뒤 자동 완전 삭제</span>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
