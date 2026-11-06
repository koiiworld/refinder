"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";
import type { Idea } from "@/lib/ideas";

type Blog = { id: string; name: string };

/** 아이디어 → 할 일: 메모를 할 일 이름으로, 링크를 메모로 */
export function todoHref(i: { id: string; memo: string; blog_id: string | null; link: string }) {
  const p = new URLSearchParams({ tab: "today", title: i.memo.slice(0, 120), idea: i.id });
  if (i.blog_id) p.set("blog", i.blog_id);
  if (i.link) p.set("memo", `참고: ${i.link}`);
  return `/todos?${p.toString()}`;
}
/** 아이디어 → 글 기획(①): 블로그 고르고 방향 칸에 메모·링크를 채움 (자동으로 AI를 부르지 않음) */
export function planHref(i: { memo: string; blog_id: string | null; link: string }) {
  const p = new URLSearchParams({ hint: `${i.memo}${i.link ? ` (참고: ${i.link})` : ""}`.slice(0, 300) });
  if (i.blog_id) p.set("blog", i.blog_id);
  return `/new?${p.toString()}`;
}

function IdeaForm({ init, blogs, onSave, onCancel, label }: { init: { memo: string; blog_id: string; link: string }; blogs: Blog[]; onSave: (f: { memo: string; blog_id: string; link: string }) => Promise<void>; onCancel?: () => void; label: string }) {
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true);
    setErr("");
    try {
      await onSave(f);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input className="input" value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void save()} placeholder="한 줄 메모 (예: 김장철 김치 보관법 — 김치냉장고 온도별)" aria-label="메모" autoFocus={!!onCancel} />
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <select className="input" style={{ maxWidth: 200 }} value={f.blog_id} onChange={(e) => setF({ ...f, blog_id: e.target.value })} aria-label="블로그">
          <option value="">블로그 (선택)</option>
          {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="참고 링크 (선택)" aria-label="참고 링크" inputMode="url" />
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !f.memo.trim()} onClick={save}>{busy ? <span className="spinner" /> : label}</button>
        {onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>취소</button>}
      </div>
    </div>
  );
}

export default function IdeaBoard({ initial, blogs, openId }: { initial: Idea[]; blogs: Blog[]; openId: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(openId);
  const [k, setK] = useState(0);
  const [search, setSearch] = useState("");
  const openRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openId) openRef.current?.scrollIntoView({ block: "center" });
  }, [openId]);

  async function reload() {
    setItems(await api<Idea[]>(`/api/ideas${search ? `?q=${encodeURIComponent(search)}` : ""}`));
  }
  const shown = items.filter((i) => !search || i.memo.includes(search) || i.link.includes(search));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad">
        <IdeaForm key={k} init={{ memo: "", blog_id: "", link: "" }} blogs={blogs} label="+ 아이디어 저장" onSave={async (f) => { await api("/api/ideas", "POST", f); setK((x) => x + 1); await reload(); }} />
      </section>
      <section className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 15 }}>저장한 아이디어 ({items.length})</h2>
          <input className="input" style={{ maxWidth: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="찾기" aria-label="아이디어 찾기" />
        </div>
        <div className="list">
          {!shown.length && <div className="list-item small muted">아직 아이디어가 없어요. 달력에서 시즌을 눌러 &apos;아이디어로 저장&apos;할 수도 있어요.</div>}
          {shown.map((i) =>
            editing === i.id ? (
              <div key={i.id} ref={i.id === openId ? openRef : undefined} className="list-item" style={{ display: "block", background: "var(--accent-soft)" }}>
                <IdeaForm init={{ memo: i.memo, blog_id: i.blog_id ?? "", link: i.link }} blogs={blogs} label="저장" onCancel={() => setEditing(null)} onSave={async (f) => { await api(`/api/ideas/${i.id}`, "PUT", f); setEditing(null); await reload(); }} />
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => router.push(todoHref(i))}>✅ 할 일 만들기</button>
                  <button className="btn btn-sm" onClick={() => router.push(planHref(i))}>📝 글 기획으로 보내기</button>
                </div>
              </div>
            ) : (
              <div key={i.id} className="list-item" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap" }}>
                <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setEditing(i.id)}>
                  <span className="small" style={{ fontWeight: 600 }}>{i.memo}</span>
                  <span className="tiny muted row" style={{ gap: 6 }}>
                    {i.blog_name && <span>{i.blog_name}</span>}
                    {i.source.startsWith("calendar:") && <span>· 📅 달력에서</span>}
                    <span>· {fmtDate(i.updated_at)}</span>
                  </span>
                  {i.link && <a className="tiny ellipsis" href={i.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--accent)" }}>🔗 {i.link}</a>}
                </div>
                <div className="row" style={{ gap: 2, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => router.push(todoHref(i))} title="할 일 만들기" aria-label="할 일 만들기">✅</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => router.push(planHref(i))} title="글 기획으로 보내기" aria-label="글 기획으로 보내기">📝</button>
                  <button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm("이 아이디어를 지울까요?")) { await api(`/api/ideas/${i.id}`, "DELETE"); await reload(); } }} aria-label="삭제">🗑</button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
