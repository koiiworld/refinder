"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import { CONVERT_ACCEPT } from "@/components/FileToMarkdown";

type Row = { id: string; filename: string; size: number; status: "queued" | "running" | "done" | "error"; message: string; markdown: string; chars: number; created_at: string };
const ST: Record<string, [string, string]> = { queued: ["대기", ""], running: ["바꾸는 중", ""], done: ["완료", "badge-ok"], error: ["실패", "badge-bad"] };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 📄 문서 → 마크다운: 올리기 · 목록 · 결과 보기(복사·.md 받기·채널 변환으로) */
export default function ConvertBoard({ initial, blogs }: { initial: Row[]; blogs: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [blogId, setBlogId] = useState(blogs[0]?.id ?? "");
  const ref = useRef<HTMLInputElement>(null);
  const pending = rows.some((r) => r.status === "queued" || r.status === "running");

  const reload = async () => setRows(await api<Row[]>("/api/convert"));
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void reload().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [pending]);

  async function upload(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).slice(0, 10);
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f));
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "올리지 못했어요.");
      setMsg({ ok: true, text: `${files.length}개를 올렸어요. 맥에서 바꾸는 중이에요 (맥이 꺼져 있으면 켜질 때).` });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
    if (ref.current) ref.current.value = "";
  }
  async function show(r: Row) {
    setOpen(await api<Row>(`/api/convert/${r.id}`));
  }
  async function trash(ids: string[]) {
    if (!ids.length || !confirm(`${ids.length}개를 휴지통으로 옮길까요? (30일 안에 되살릴 수 있어요)`)) return;
    await api("/api/trash", "POST", { action: "trash", ids });
    setSel([]);
    if (open && ids.includes(open.id)) setOpen(null);
    await reload();
  }
  async function toSample(r: Row) {
    if (!blogId) return;
    try {
      await api(`/api/blogs/${blogId}/samples`, "POST", { files: [{ filename: `${r.filename.replace(/\.\w+$/, "")}.md`, content: r.markdown }] });
      setMsg({ ok: true, text: `${blogs.find((b) => b.id === blogId)?.name} 블로그의 문체 샘플로 넣었어요.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section
        className="card card-pad"
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}
        style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
      >
        {busy ? <span className="small"><span className="spinner" /> 올리는 중…</span> : (
          <span className="small">📄 <b style={{ color: "var(--accent)" }}>눌러서 파일 선택</b> · 끌어다 놓기 — PDF · 워드(docx) · 파워포인트(pptx) · 엑셀(xlsx) · HTML · CSV · TXT · EPUB (한 번에 10개, 20MB 이하)</span>
        )}
        <input ref={ref} type="file" accept={CONVERT_ACCEPT} multiple hidden onChange={(e) => void upload(e.target.files)} />
      </section>
      {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`}>{msg.text}</div>}

      {open && (
        <section className="card">
          <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
            <h2 className="ellipsis" style={{ fontSize: 15, maxWidth: "60%" }}>📝 {open.filename}</h2>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button className="btn btn-sm" onClick={async () => { await navigator.clipboard.writeText(open.markdown); setMsg({ ok: true, text: "복사했어요." }); }}>📋 복사</button>
              <a className="btn btn-sm" href={`/api/convert/${open.id}?download=1`}>⬇️ .md 받기</a>
              <Link className="btn btn-sm" href={`/repurpose?convert=${open.id}`}>🔀 채널 변환으로</Link>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            {open.message && <div className="notice small">{open.message}</div>}
            <textarea className="textarea mono" readOnly value={open.markdown} style={{ minHeight: 360, fontSize: 13 }} aria-label="마크다운 결과" />
            {blogs.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <span className="small">✍️ 문체 샘플로 넣기:</span>
                <select className="input" style={{ width: "auto" }} value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그">
                  {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button className="btn btn-sm" onClick={() => toSample(open)}>넣기</button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            {rows.length > 0 && <input type="checkbox" aria-label="모두 선택" checked={sel.length === rows.length} onChange={() => setSel(sel.length === rows.length ? [] : rows.map((r) => r.id))} />}
            <h2 style={{ fontSize: 15 }}>바꾼 문서 ({rows.length})</h2>
          </div>
          {sel.length > 0 && <button className="btn btn-sm btn-danger" onClick={() => trash(sel)}>🗑 휴지통으로 ({sel.length})</button>}
        </div>
        <div className="list">
          {!rows.length && <div className="list-item small muted">아직 없어요. 위에 파일을 올려 보세요.</div>}
          {rows.map((r) => (
            <div key={r.id} className="list-item" style={{ gap: 10, flexWrap: "nowrap", background: sel.includes(r.id) ? "var(--accent-soft)" : undefined }}>
              <input type="checkbox" checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} aria-label={`${r.filename} 선택`} />
              <button type="button" onClick={() => r.status === "done" && show(r)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: r.status === "done" ? "pointer" : "default", padding: 0 }}>
                <div className="strong ellipsis">{r.filename}</div>
                <div className="tiny muted ellipsis">{kb(r.size)}{r.status === "done" ? ` · ${Number(r.chars).toLocaleString("ko-KR")}자` : ""} · {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{r.message ? ` · ${r.message}` : ""}</div>
              </button>
              <span className={`badge ${ST[r.status]?.[1] ?? ""}`}>{(r.status === "queued" || r.status === "running") && <span className="spinner" />} {ST[r.status]?.[0] ?? r.status}</span>
              <button className="btn btn-sm btn-ghost" title="휴지통으로" aria-label={`${r.filename} 휴지통으로`} onClick={() => trash([r.id])}>🗑</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
