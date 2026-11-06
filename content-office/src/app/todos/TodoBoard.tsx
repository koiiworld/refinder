"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import type { Todo } from "@/lib/todos";

type Blog = { id: string; name: string; color: string };
type Post = { id: string; title: string; blog_id: string };
type Form = { title: string; due_date: string; due_time: string; blog_id: string; project_id: string; memo: string; notify: boolean; idea_id: string };

const NOTICE: Record<string, string> = { pending: "🔔 예약됨", sending: "🔔 보내는 중", sent: "✅ 알림 보냄", canceled: "", failed: "⚠️ 알림 실패" };
const fmtDay = (d: string, today: string) => {
  if (d === today) return "오늘";
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const x = new Date(`${d}T00:00:00Z`).getTime();
  const diff = Math.round((x - t) / 86400000);
  const w = "일월화수목금토"[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const md = `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${w})`;
  return diff === 1 ? `내일 ${md}` : diff < 0 ? `${md} · ${-diff}일 지남` : md;
};

function TodoForm({ init, blogs, posts, telegram, onSave, onCancel, saveLabel }: { init: Form; blogs: Blog[]; posts: Post[]; telegram: boolean; onSave: (f: Form) => Promise<void>; onCancel?: () => void; saveLabel: string }) {
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
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
      <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void save()} placeholder="할 일 (예: 김장 레시피 사진 고르기)" aria-label="할 일 이름" autoFocus={!!onCancel} />
      <div className="todo-fields">
        <label className="small stack" style={{ gap: 2 }}>날짜<input className="input" type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} aria-label="날짜" /></label>
        <label className="small stack" style={{ gap: 2 }}>시간 (선택)<input className="input" type="time" value={f.due_time} onChange={(e) => set({ due_time: e.target.value, notify: e.target.value ? f.notify : false })} aria-label="시간" /></label>
        <label className="small stack" style={{ gap: 2 }}>블로그 (선택)
          <select className="input" value={f.blog_id} onChange={(e) => set({ blog_id: e.target.value, project_id: "" })} aria-label="블로그">
            <option value="">없음</option>
            {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="small stack" style={{ gap: 2 }}>글 (선택)
          <select className="input" value={f.project_id} onChange={(e) => set({ project_id: e.target.value })} aria-label="글">
            <option value="">없음</option>
            {posts.filter((p) => !f.blog_id || p.blog_id === f.blog_id).map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 40)}</option>)}
          </select>
        </label>
      </div>
      <input className="input" value={f.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="메모 (선택)" aria-label="메모" />
      <label className="small row" style={{ gap: 6, opacity: f.due_time ? 1 : 0.5 }}>
        <input type="checkbox" checked={f.notify} disabled={!f.due_time} onChange={(e) => set({ notify: e.target.checked })} />
        🔔 이 시간에 텔레그램 알림 {!f.due_time ? "(시간을 정하면 켤 수 있어요)" : !telegram ? "(텔레그램 연결 전 · 설정에서 연결하면 보내져요)" : ""}
      </label>
      {err && <div className="notice notice-bad small">{err}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !f.title.trim()} onClick={save}>{busy ? <span className="spinner" /> : saveLabel}</button>
        {onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>취소</button>}
      </div>
    </div>
  );
}

export default function TodoBoard({ tab, today, initial, blogs, posts, telegram, prefill }: { tab: string; today: string; initial: Todo[]; blogs: Blog[]; posts: Post[]; telegram: boolean; prefill: { title: string; blog_id: string; memo: string; idea_id: string; due_date: string } | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [toast, setToast] = useState("");
  const empty: Form = { title: prefill?.title ?? "", due_date: prefill?.due_date || today, due_time: "", blog_id: prefill?.blog_id ?? "", project_id: "", memo: prefill?.memo ?? "", notify: false, idea_id: prefill?.idea_id ?? "" };

  async function reload() {
    setItems(await api<Todo[]>(`/api/todos?tab=${tab}`));
    router.refresh();
  }
  async function add(f: Form) {
    await api("/api/todos", "POST", { ...f, due_time: f.due_time || null, blog_id: f.blog_id || null, project_id: f.project_id || null, idea_id: f.idea_id || null });
    setFormKey((k) => k + 1);
    setToast(f.due_date > today ? `'${fmtDay(f.due_date, today)}' 예정에 추가했어요.` : "오늘 할 일에 추가했어요.");
    if (prefill) router.replace(`/todos?tab=${tab}`, { scroll: false });
    await reload();
  }
  async function save(id: string, f: Form) {
    await api(`/api/todos/${id}`, "PUT", { ...f, due_time: f.due_time || null, blog_id: f.blog_id || null, project_id: f.project_id || null });
    setEditing(null);
    await reload();
  }
  async function toggleDone(t: Todo) {
    await api(`/api/todos/${t.id}`, "PUT", { done: !t.done_at });
    await reload();
  }
  async function toggleNotify(t: Todo) {
    await api(`/api/todos/${t.id}`, "PUT", { notify: !t.notify });
    await reload();
  }
  async function remove(t: Todo) {
    if (!confirm(`'${t.title}'을(를) 지울까요?${t.notify ? " (알림 예약도 취소돼요)" : ""}`)) return;
    await api(`/api/todos/${t.id}`, "DELETE");
    await reload();
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {tab !== "done" && (
        <section className="card card-pad">
          {prefill && <div className="tiny muted" style={{ marginBottom: 6 }}>💡 아이디어에서 넘어온 내용을 채워 뒀어요.</div>}
          <TodoForm key={formKey} init={empty} blogs={blogs} posts={posts} telegram={telegram} onSave={add} saveLabel="+ 할 일 추가" />
          {toast && <div className="notice notice-ok small" style={{ marginTop: 8 }}>{toast}</div>}
        </section>
      )}

      <section className="card">
        <div className="list">
          {!items.length && <div className="list-item small muted">{tab === "today" ? "오늘 할 일이 없어요. 🎉" : tab === "upcoming" ? "예정된 할 일이 없어요." : "완료한 할 일이 없어요."}</div>}
          {items.map((t) =>
            editing === t.id ? (
              <div key={t.id} className="list-item" style={{ display: "block" }}>
                <TodoForm init={{ title: t.title, due_date: t.due_date, due_time: t.due_time ?? "", blog_id: t.blog_id ?? "", project_id: t.project_id ?? "", memo: t.memo, notify: t.notify, idea_id: t.idea_id ?? "" }} blogs={blogs} posts={posts} telegram={telegram} onSave={(f) => save(t.id, f)} onCancel={() => setEditing(null)} saveLabel="저장" />
              </div>
            ) : (
              <div key={t.id} className="list-item todo-row">
                <input type="checkbox" checked={!!t.done_at} onChange={() => toggleDone(t)} aria-label={`${t.title} 완료`} className="todo-check" />
                <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                  <span className="small" style={{ fontWeight: 600, textDecoration: t.done_at ? "line-through" : undefined, color: t.done_at ? "var(--muted)" : undefined }}>{t.title}</span>
                  <span className="tiny muted row" style={{ gap: 6 }}>
                    <span style={{ color: t.due_date < today && !t.done_at ? "var(--bad)" : undefined }}>{fmtDay(t.due_date, today)}{t.due_time ? ` ${t.due_time}` : ""}</span>
                    {t.blog_name && <span>· {t.blog_name}</span>}
                    {t.project_id && t.project_title && <Link href={`/posts/${t.project_id}`} style={{ color: "var(--accent)" }}>· 📄 {t.project_title.slice(0, 24)}</Link>}
                    {t.notice && NOTICE[t.notice.status] && <span title={t.notice.error ?? ""} style={{ color: t.notice.status === "failed" ? "var(--bad)" : undefined }}>· {NOTICE[t.notice.status]}</span>}
                  </span>
                  {t.memo && <span className="tiny muted">{t.memo}</span>}
                </div>
                <div className="row" style={{ gap: 2, flexShrink: 0 }}>
                  {t.due_time && !t.done_at && <button className="btn btn-sm btn-ghost" onClick={() => toggleNotify(t)} title={t.notify ? "알림 끄기" : "알림 켜기"} aria-label={t.notify ? "알림 끄기" : "알림 켜기"}>{t.notify ? "🔔" : "🔕"}</button>}
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(t.id)} aria-label="수정">✏️</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => remove(t)} aria-label="삭제">🗑</button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
