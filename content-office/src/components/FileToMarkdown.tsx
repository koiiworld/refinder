"use client";

import { useRef, useState } from "react";
import { api } from "@/components/client-utils";

export const CONVERT_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.html,.htm,.csv,.json,.xml,.txt,.md,.epub";
type Conv = { id: string; filename: string; status: string; message: string; markdown: string };

/** 파일 올리기 → 맥에서 마크다운으로 바꿔질 때까지 기다림 */
export async function convertFiles(files: File[], onStatus?: (s: string) => void): Promise<Conv[]> {
  const fd = new FormData();
  for (const f of files.slice(0, 10)) fd.append("file", f);
  const res = await fetch("/api/convert", { method: "POST", body: fd });
  const j = (await res.json().catch(() => ({}))) as { ids?: string[]; error?: string };
  if (!res.ok || !j.ids) throw new Error(j.error ?? "파일을 올리지 못했어요.");
  const out: Conv[] = [];
  for (const id of j.ids) {
    for (let i = 0; i < 400; i++) {
      const c = await api<Conv>(`/api/convert/${id}`);
      if (c.status === "done" || c.status === "error") {
        out.push(c);
        break;
      }
      onStatus?.(c.message || "맥에서 바꾸는 중…");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return out;
}

/** 📄 파일에서 불러오기 버튼: PDF·워드·PPT 등을 마크다운 글로 바꿔 넘겨줌 */
export default function FileToMarkdown({ onText, label = "📄 파일에서 불러오기 (PDF·워드·PPT)", multiple = false }: { onText: (md: string, filename: string) => void; label?: string; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function go(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setErr("");
    setBusy("올리는 중…");
    try {
      for (const c of await convertFiles(files, setBusy)) {
        if (c.status === "error") setErr(`${c.filename}: ${c.message}`);
        else if (c.markdown.trim()) onText(c.markdown, c.filename);
        else setErr(`${c.filename}: ${c.message || "글자를 찾지 못했어요."}`);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
    if (ref.current) ref.current.value = "";
  }
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => ref.current?.click()}>{busy ? <><span className="spinner" /> {busy}</> : label}</button>
      <input ref={ref} type="file" accept={CONVERT_ACCEPT} multiple={multiple} hidden onChange={(e) => void go(e.target.files)} />
      {err && <span className="tiny" style={{ color: "var(--bad)" }}>{err}</span>}
    </span>
  );
}
