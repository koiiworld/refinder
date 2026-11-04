"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stageLabel, stageStep } from "@/lib/steps";
import { BlogTag, fmtDate, Steps } from "@/components/ui";
import { api } from "@/components/client-utils";

export type PostRow = { id: string; title: string; topic: string; stage: string; status: string; status_message: string; updated_at: string; blog_name: string; blog_color: string; needs_rereview: boolean };

/** 진행 현황 목록: 체크박스로 골라 휴지통으로 보내기 */
export default function PostGroups({ groups }: { groups: [string, PostRow[]][] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function trash() {
    if (!confirm(`선택한 ${sel.length}개 글을 휴지통으로 옮길까요?\n휴지통에서 되살리거나 완전히 삭제할 수 있습니다.`)) return;
    setBusy(true);
    try {
      await api("/api/trash", "POST", { action: "trash", ids: sel });
      setMsg(`${sel.length}개 글을 휴지통으로 옮겼습니다.`);
      setSel([]);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <>
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => {
          const ids = list.map((r) => r.id);
          const all = ids.every((id) => sel.includes(id));
          return (
            <section key={title} className="card">
              <div className="card-head" style={{ justifyContent: "flex-start", gap: 10 }}>
                <input
                  type="checkbox"
                  aria-label={`${title} 모두 선택`}
                  checked={all}
                  onChange={() => setSel((s) => (all ? s.filter((x) => !ids.includes(x)) : Array.from(new Set([...s, ...ids]))))}
                />
                <h2 style={{ fontSize: 15 }}>{title} ({list.length})</h2>
              </div>
              <div className="list">
                {list.map((r) => (
                  <div key={r.id} className="list-item" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap", background: sel.includes(r.id) ? "var(--accent-soft)" : undefined }}>
                    <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.title} 선택`} style={{ marginTop: 4, flexShrink: 0 }} />
                    <Link href={`/posts/${r.id}`} className="stack" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                      <div className="row between" style={{ flexWrap: "nowrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="strong ellipsis">{r.title}</div>
                          <div className="row">
                            <BlogTag name={r.blog_name} color={r.blog_color} />
                            <span className="tiny muted">키워드 {r.topic} · {fmtDate(r.updated_at)}</span>
                          </div>
                        </div>
                        <span className={`badge ${r.status === "error" ? "badge-bad" : r.stage === "ready" ? "badge-warn" : r.stage === "published" ? "badge-ok" : "badge-accent"}`} style={{ flexShrink: 0 }}>
                          {r.status === "running" && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />}
                          {stageLabel(r.stage, r.status)}
                        </span>
                      </div>
                      {r.status_message && <div className="tiny" style={{ color: r.status === "error" ? "var(--bad)" : "var(--warn)" }}>{r.status_message}</div>}
                      {r.needs_rereview && <div className="tiny" style={{ color: "var(--warn)" }}>검수 후 글을 고쳤어요 · 다시 검수를 권장합니다</div>}
                      <Steps current={r.stage === "published" ? 8 : stageStep(r.stage)} error={r.status === "error"} />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      {(sel.length > 0 || msg) && (
        <div className="selection-bar card row between">
          {sel.length > 0 ? (
            <>
              <span className="small strong">{sel.length}개 선택됨</span>
              <div className="row">
                <button className="btn btn-sm" onClick={() => setSel([])} disabled={busy}>선택 해제</button>
                <button className="btn btn-sm btn-danger" onClick={trash} disabled={busy}>
                  {busy ? <span className="spinner" /> : "🗑 휴지통으로"}
                </button>
              </div>
            </>
          ) : (
            <span className="small">{msg} <Link href="/trash" style={{ color: "var(--accent)" }}>휴지통 보기</Link></span>
          )}
        </div>
      )}
    </>
  );
}
