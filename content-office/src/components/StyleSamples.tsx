"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client-utils";
import { fmtDate } from "./ui";

type Sample = { id: string; filename: string; content: string; enabled: boolean; chars: number; created_at: string };

const MAX_PROMPT_CHARS = 8000; // 서버 MAX_SAMPLE_CHARS 와 동일

export default function StyleSamples({ blogId }: { blogId: string }) {
  const [items, setItems] = useState<Sample[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setItems(await api<Sample[]>(`/api/blogs/${blogId}/samples`)), [blogId]);
  useEffect(() => void load(), [load]);

  async function upload(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    const bad = files.find((f) => !/\.(md|markdown|txt)$/i.test(f.name));
    if (bad) return setMsg({ ok: false, text: `${bad.name}: .md, .markdown, .txt 파일만 올릴 수 있습니다.` });
    setBusy(true);
    setMsg(null);
    try {
      const payload = await Promise.all(files.map(async (f) => ({ filename: f.name, content: await f.text() })));
      await api(`/api/blogs/${blogId}/samples`, "POST", { files: payload });
      setMsg({ ok: true, text: `${files.length}개 파일을 올렸습니다. 다음 AI 작업부터 이 말투를 참고합니다.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const enabled = items.filter((s) => s.enabled);
  const totalChars = enabled.reduce((a, s) => a + Number(s.chars), 0);

  return (
    <section className="card">
      <div className="card-head">
        <h3>말투 예시 파일</h3>
        <span className="tiny muted">사용 중 {enabled.length}개 · {totalChars.toLocaleString()}자</span>
      </div>
      <div className="card-pad stack">
        <p className="small muted">
          이 블로그에 실제로 쓴 글을 마크다운(.md)이나 텍스트(.txt) 파일로 올리세요. AI가 <b>원고 작성·수정 요청·선택 부분 수정·교차 검수</b>, 그리고 프롬프트 수정실의 글 원고 다듬기에서
          말투(어미, 문장 길이, 문단 나누기, 강조·이모티콘 습관)를 따라 씁니다. 내용은 베끼지 않고 쓰는 방식만 참고합니다.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          className="card"
          style={{ borderStyle: "dashed", padding: 20, textAlign: "center", cursor: "pointer", background: drag ? "var(--accent-soft)" : "var(--panel-2)" }}
        >
          {busy ? <span className="spinner" /> : <span className="small">파일을 끌어다 놓거나 <b style={{ color: "var(--accent)" }}>눌러서 선택</b> (.md, .txt · 여러 개 가능 · 파일당 10만 자 이하)</span>}
          <input ref={input} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`}>{msg.text}</div>}
        {totalChars > MAX_PROMPT_CHARS && (
          <div className="notice small">
            사용 중인 예시가 {totalChars.toLocaleString()}자라서, AI 요청마다 파일별로 앞부분을 나눠 총 {MAX_PROMPT_CHARS.toLocaleString()}자까지만 보냅니다(비용 절약).
            가장 대표적인 글만 '사용'으로 두면 더 정확합니다.
          </div>
        )}
        <div className="list card">
          {items.map((s) => (
            <div key={s.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <label className="check small" title="AI 작업에 사용">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={async (e) => {
                      await api(`/api/blogs/${blogId}/samples/${s.id}`, "PATCH", { enabled: e.target.checked });
                      await load();
                    }}
                  />
                  사용
                </label>
                <span className="strong small ellipsis" style={{ flex: 1 }}>{s.filename}</span>
                <span className="tiny muted">{Number(s.chars).toLocaleString()}자 · {fmtDate(s.created_at, false)}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "접기" : "보기"}</button>
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={async () => {
                    if (!confirm(`${s.filename}을(를) 삭제할까요?`)) return;
                    await api(`/api/blogs/${blogId}/samples/${s.id}`, "DELETE");
                    await load();
                  }}
                >
                  삭제
                </button>
              </div>
              {open === s.id && (
                <pre className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto", background: "var(--panel-2)", padding: 10, borderRadius: 8, margin: 0, fontFamily: "inherit" }}>{s.content}</pre>
              )}
            </div>
          ))}
          {!items.length && <div className="empty small">아직 올린 예시 파일이 없습니다. 지금은 위의 '작성 문체' 설명만 참고합니다.</div>}
        </div>
      </div>
    </section>
  );
}
