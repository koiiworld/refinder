"use client";

import { diffWords } from "diff";
import { useEffect, useState } from "react";

export const PROVIDERS = [
  { id: "openai", label: "ChatGPT (OpenAI)", defaultModel: "gpt-5" },
  { id: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-5-5" },
  { id: "google", label: "Gemini (Google)", defaultModel: "gemini-3.5-flash" },
  { id: "template", label: "템플릿 (오프라인·AI 아님)", defaultModel: "offline-template" },
] as const;

export async function api<T = unknown>(url: string, method = "GET", payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`), { status: res.status, data });
  return data as T;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<img[^>]*>/gi, "[이미지]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function Diff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  const added = parts.filter((p) => p.added).reduce((a, p) => a + p.value.length, 0);
  const removed = parts.filter((p) => p.removed).reduce((a, p) => a + p.value.length, 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row small">
        <span className="badge badge-ok">+{added}자</span>
        <span className="badge badge-bad">-{removed}자</span>
        <span className="muted tiny">초록=추가, 빨강 취소선=삭제</span>
      </div>
      <div className="diff card card-pad" style={{ background: "var(--panel-2)" }}>
        {parts.map((p, i) => (p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>))}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3000);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg] as const;
}

/** AI 선택기 (다른 AI로 재실행/재검수) */
export function AiPicker({
  value,
  onChange,
  connections,
  allowDefault = true,
}: {
  value: { provider: string; model: string } | null;
  onChange: (v: { provider: string; model: string } | null) => void;
  connections: { provider: string; connected: boolean }[];
  allowDefault?: boolean;
}) {
  const connected = (p: string) => p === "template" || connections.find((c) => c.provider === p)?.connected;
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <select
        className="select"
        style={{ width: "auto", minWidth: 180 }}
        value={value?.provider ?? ""}
        onChange={(e) => {
          const p = PROVIDERS.find((x) => x.id === e.target.value);
          onChange(p ? { provider: p.id, model: p.defaultModel } : null);
        }}
      >
        {allowDefault && <option value="">블로그 기본 배정 AI</option>}
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {connected(p.id) ? "" : " - 미연결"}
          </option>
        ))}
      </select>
      {value && value.provider !== "template" && <ModelSelect provider={value.provider} model={value.model} onChange={(model) => onChange({ ...value, model })} />}
    </div>
  );
}

/** 설정의 AI 단가표에 있는 글 쓰는 모델 목록 (한 번만 불러와 같이 씀) */
let modelCache: Promise<Record<string, string[]>> | null = null;
function loadModels() {
  modelCache ??= api<{ pricing?: Record<string, unknown> }>("/api/settings")
    .then((s) => {
      const out: Record<string, string[]> = {};
      for (const key of Object.keys(s.pricing ?? {})) {
        const [p, ...rest] = key.split(":");
        const m = rest.join(":");
        // 이미지·영상·음성·임베딩 모델은 글 수정에 못 써서 뺌
        if (!m || /image|imagen|dall-e|veo|sora|tts|whisper|audio|embedding|realtime|transcribe|moderation|search|computer/i.test(m)) continue;
        (out[p] ??= []).push(m);
      }
      for (const p of Object.keys(out)) out[p].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
      return out;
    })
    .catch(() => ({}));
  return modelCache;
}

/** 세부 모델 고르기: 목록에서 고르거나 '직접 입력' */
function ModelSelect({ provider, model, onChange }: { provider: string; model: string; onChange: (m: string) => void }) {
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    void loadModels().then(setModels);
  }, []);
  const list = models[provider] ?? [];
  const inList = list.includes(model);
  if (custom || (list.length > 0 && !inList && model && !PROVIDERS.some((p) => p.defaultModel === model)) || !list.length)
    return (
      <span className="row" style={{ gap: 4 }}>
        <input className="input" style={{ width: 200 }} value={model} onChange={(e) => onChange(e.target.value)} placeholder="모델 ID" aria-label="모델 ID" />
        {list.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setCustom(false); if (!list.includes(model)) onChange(list[0]); }}>목록에서 고르기</button>}
      </span>
    );
  return (
    <select className="select" style={{ width: "auto", minWidth: 200 }} value={inList ? model : ""} onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : onChange(e.target.value))} aria-label="세부 모델">
      {!inList && <option value="">{model || "모델 고르기"}</option>}
      {list.map((m) => <option key={m} value={m}>{m}</option>)}
      <option value="__custom">✏️ 직접 입력…</option>
    </select>
  );
}
