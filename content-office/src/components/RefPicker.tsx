"use client";

import { useState } from "react";

/** 🎨 레퍼런스 사진 고르기: 올리기 · 만든 이미지에서 고르기 · 빼기 (사진은 /api/refs 에 저장되고 아이디만 돌려받음) */
export async function uploadRefs(files: FileList | File[]) {
  const fd = new FormData();
  Array.from(files).slice(0, 5).forEach((f) => fd.append("files", f));
  const res = await fetch("/api/refs", { method: "POST", body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "올리기 실패");
  return (d.data?.ids ?? d.ids ?? []) as string[];
}
export async function refFromUrl(url: string) {
  const res = await fetch("/api/refs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "가져오기 실패");
  return (d.data?.ids ?? d.ids ?? []) as string[];
}

export default function RefPicker({ ids, max = 5, onChange, candidates = [], disabled, label = "이번만 레퍼런스" }: { ids: string[]; max?: number; onChange: (ids: string[]) => void | Promise<void>; candidates?: { url: string; label: string }[]; disabled?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState(false);
  async function add(fn: () => Promise<string[]>) {
    setBusy(true);
    setErr("");
    try {
      const got = await fn();
      await onChange(Array.from(new Set([...ids, ...got])).slice(0, max));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className="tiny strong">{label} {ids.length}/{max}</span>
        <label className={`btn btn-sm${disabled || busy || ids.length >= max ? " disabled" : ""}`} style={{ pointerEvents: disabled || busy || ids.length >= max ? "none" : undefined, opacity: disabled || ids.length >= max ? 0.5 : 1 }}>
          {busy ? <span className="spinner" /> : "+ 사진 올리기"}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files?.length && add(() => uploadRefs(e.target.files!))} />
        </label>
        {candidates.length > 0 && <button type="button" className="btn btn-sm btn-ghost" disabled={disabled || busy || ids.length >= max} onClick={() => setPick(!pick)}>{pick ? "닫기" : "만든 이미지에서 고르기"}</button>}
      </div>
      {pick && (
        <div className="ref-grid">
          {candidates.map((c) => (
            <button type="button" key={c.url} className="ref-thumb pick" title={c.label} disabled={busy} onClick={() => { setPick(false); void add(() => refFromUrl(c.url)); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt={c.label} />
            </button>
          ))}
        </div>
      )}
      {ids.length > 0 && (
        <div className="ref-grid">
          {ids.map((id) => (
            <span key={id} className="ref-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${id}.jpg`} alt="레퍼런스" />
              <button type="button" aria-label="빼기" disabled={disabled} onClick={() => onChange(ids.filter((x) => x !== id))}>×</button>
            </span>
          ))}
        </div>
      )}
      {err && <span className="tiny" style={{ color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}
