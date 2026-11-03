"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiPicker, Diff, Modal } from "./client-utils";

export interface EditorDoc {
  title: string;
  content_html: string;
  revision: number;
  last_editor: string;
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export default function DocEditor({
  projectId,
  serverDoc,
  locked,
  lockedReason,
  connections,
  onSaved,
}: {
  projectId: string;
  serverDoc: EditorDoc | null;
  locked: boolean;
  lockedReason?: string;
  connections: { provider: string; connected: boolean }[];
  onSaved: (r: { needsRereview: boolean }) => void;
}) {
  const [title, setTitle] = useState(serverDoc?.title ?? "");
  const [state, setState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<EditorDoc | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const revisionRef = useRef(serverDoc?.revision ?? 0);
  const dirtyRef = useRef(false);
  const titleRef = useRef(title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiOpen, setAiOpen] = useState<null | { from: number; to: number; text: string }>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !locked,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: "여기에 본문을 작성하세요. 텍스트를 선택하면 AI 부분 수정을 쓸 수 있습니다." }),
    ],
    content: serverDoc?.content_html ?? "",
    editorProps: { attributes: { class: "prose", "aria-label": "원고 본문" } },
    onUpdate: () => markDirty(),
  });

  const save = useCallback(
    async (force = false) => {
      if (!editor) return;
      if (!dirtyRef.current && !force) return;
      setState("saving");
      const html = editor.getHTML();
      const res = await fetch(`/api/projects/${projectId}/document`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html, title: titleRef.current, revision: revisionRef.current }),
      }).catch(() => null);
      if (!res) return setState("error");
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setConflict(data.current);
        return setState("conflict");
      }
      if (!res.ok) return setState("error");
      revisionRef.current = data.revision;
      // 저장 중에 추가 입력이 있었으면 dirty 유지
      if (editor.getHTML() === html) {
        dirtyRef.current = false;
        setState("saved");
      } else {
        setState("dirty");
        schedule();
      }
      setSavedAt(new Date());
      onSaved({ needsRereview: !!data.needsRereview });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, projectId, onSaved],
  );

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 1200);
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  function markDirty() {
    dirtyRef.current = true;
    setState((s) => (s === "conflict" ? s : "dirty"));
    schedule();
  }

  // 잠금 상태 반영
  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);

  // 서버에서 원고가 바뀐 경우(AI 작성·복원) — 사용자가 수정 중이 아닐 때만 반영
  useEffect(() => {
    if (!editor || !serverDoc) return;
    if (serverDoc.revision > revisionRef.current) {
      if (!dirtyRef.current) {
        editor.commands.setContent(serverDoc.content_html, { emitUpdate: false });
        setTitle(serverDoc.title);
        titleRef.current = serverDoc.title;
        revisionRef.current = serverDoc.revision;
      } else {
        setConflict(serverDoc);
        setState("conflict");
      }
    }
  }, [editor, serverDoc]);

  // 저장 안 된 변경이 있으면 페이지 이탈 경고
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            underline: e.isActive("underline"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            table: e.isActive("table"),
            hasSel: !e.state.selection.empty,
          }
        : null,
  });

  if (!editor) return <div className="editor-shell card-pad muted">에디터 불러오는 중…</div>;

  const tb = (label: string, on: boolean | undefined, fn: () => void, title?: string) => (
    <button type="button" className={`tb ${on ? "on" : ""}`} onClick={fn} title={title ?? label} aria-pressed={!!on} disabled={locked}>
      {label}
    </button>
  );

  function insertLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = prompt("링크 URL (비우면 링크 제거)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor!.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function insertImageUrl() {
    const url = prompt("이미지 URL");
    if (!url?.trim()) return;
    const alt = prompt("대체 텍스트 (이미지 설명)") ?? "";
    editor!.chain().focus().setImage({ src: url.trim(), alt }).run();
  }

  function insertImageFile(file: File) {
    if (file.size > 3 * 1024 * 1024) return alert("3MB 이하 이미지만 직접 업로드할 수 있습니다.");
    const reader = new FileReader();
    reader.onload = () => editor!.chain().focus().setImage({ src: String(reader.result), alt: file.name }).run();
    reader.readAsDataURL(file);
  }

  function openAi() {
    const { from, to } = editor!.state.selection;
    const text = editor!.state.doc.textBetween(from, to, "\n");
    if (!text.trim()) return alert("AI로 수정할 문장(문단)을 먼저 드래그해서 선택하세요.");
    setAiOpen({ from, to, text });
  }

  const stateLabel: Record<SaveState, string> = {
    saved: savedAt ? `자동 저장됨 ${savedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "저장됨",
    dirty: "변경됨 · 곧 자동 저장",
    saving: "저장 중…",
    error: "저장 실패 · 재시도 필요",
    conflict: "충돌 · 확인 필요",
  };

  return (
    <div className="stack">
      {locked && <div className="notice notice-warn small">🔒 {lockedReason ?? "AI 작업 중에는 편집이 잠깁니다."}</div>}
      {conflict && (
        <div className="notice notice-bad small stack" style={{ gap: 8 }}>
          <div>
            다른 곳(AI 작업, 복원 또는 다른 창)에서 원고가 변경되었습니다 (서버 rev {conflict.revision}). 어떻게 처리할까요?
          </div>
          <div className="row">
            <button
              className="btn btn-sm"
              onClick={() => {
                editor.commands.setContent(conflict.content_html, { emitUpdate: false });
                setTitle(conflict.title);
                titleRef.current = conflict.title;
                revisionRef.current = conflict.revision;
                dirtyRef.current = false;
                setConflict(null);
                setState("saved");
              }}
            >
              서버 원고 불러오기 (내 변경 버림)
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                revisionRef.current = conflict.revision;
                setConflict(null);
                dirtyRef.current = true;
                void save(true);
              }}
            >
              내 원고로 덮어쓰기
            </button>
          </div>
          <span className="tiny">어느 쪽을 선택해도 이전 내용은 버전 기록에서 복원할 수 있습니다.</span>
        </div>
      )}
      <div className="editor-shell">
        <div className="toolbar" role="toolbar" aria-label="서식">
          {tb("B", active?.bold, () => editor.chain().focus().toggleBold().run(), "굵게")}
          {tb("I", active?.italic, () => editor.chain().focus().toggleItalic().run(), "기울임")}
          {tb("U", active?.underline, () => editor.chain().focus().toggleUnderline().run(), "밑줄")}
          {tb("S", active?.strike, () => editor.chain().focus().toggleStrike().run(), "취소선")}
          <span className="tb-sep" />
          {tb("H2", active?.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "소제목")}
          {tb("H3", active?.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "작은 소제목")}
          {tb("•목록", active?.bullet, () => editor.chain().focus().toggleBulletList().run())}
          {tb("1.목록", active?.ordered, () => editor.chain().focus().toggleOrderedList().run())}
          {tb("인용", active?.quote, () => editor.chain().focus().toggleBlockquote().run())}
          <span className="tb-sep" />
          {tb("링크", active?.link, insertLink)}
          {tb("이미지URL", false, insertImageUrl)}
          <label className="tb" style={{ display: "inline-flex", alignItems: "center", opacity: locked ? 0.5 : 1 }} title="이미지 업로드">
            업로드
            <input type="file" accept="image/*" hidden disabled={locked} onChange={(e) => e.target.files?.[0] && insertImageFile(e.target.files[0])} />
          </label>
          {tb("표", false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), "표 삽입")}
          {active?.table && (
            <>
              {tb("+행", false, () => editor.chain().focus().addRowAfter().run(), "아래에 행 추가")}
              {tb("+열", false, () => editor.chain().focus().addColumnAfter().run(), "오른쪽에 열 추가")}
              {tb("-행", false, () => editor.chain().focus().deleteRow().run(), "행 삭제")}
              {tb("-열", false, () => editor.chain().focus().deleteColumn().run(), "열 삭제")}
              {tb("표삭제", false, () => editor.chain().focus().deleteTable().run())}
            </>
          )}
          <span className="tb-sep" />
          {tb("↶", false, () => editor.chain().focus().undo().run(), "실행 취소")}
          {tb("↷", false, () => editor.chain().focus().redo().run(), "다시 실행")}
          <span className="tb-sep" />
          <button type="button" className={`tb ${active?.hasSel ? "on" : ""}`} onClick={openAi} disabled={locked} title="선택한 부분만 AI로 수정">
            ✨ 선택 부분 AI 수정
          </button>
        </div>
        <input
          className="title-input"
          value={title}
          disabled={locked}
          placeholder="글 제목"
          aria-label="글 제목"
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            markDirty();
          }}
        />
        <EditorContent editor={editor} />
        <div className="sticky-actions row between">
          <span className="save-state" aria-live="polite">
            {state === "saving" && <span className="spinner" style={{ width: 10, height: 10 }} />}
            <span style={{ color: state === "error" || state === "conflict" ? "var(--bad)" : undefined }}>{stateLabel[state]}</span>
          </span>
          <div className="row">
            {state === "error" && (
              <button className="btn btn-sm" onClick={() => void save(true)}>
                다시 저장
              </button>
            )}
            <button
              className="btn btn-sm"
              disabled={locked}
              onClick={async () => {
                await save();
                const label = prompt("버전 이름 (선택)", "수동 저장");
                if (label === null) return;
                await fetch(`/api/projects/${projectId}/versions`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ kind: "draft", label }),
                });
                onSaved({ needsRereview: false });
              }}
            >
              버전 저장
            </button>
          </div>
        </div>
      </div>

      {aiOpen && (
        <AiEditModal
          projectId={projectId}
          selected={aiOpen.text}
          context={editor.getText()}
          connections={connections}
          onClose={() => setAiOpen(null)}
          onApply={(text) => {
            editor.chain().focus().insertContentAt({ from: aiOpen.from, to: aiOpen.to }, text.replace(/\n+/g, " ")).run();
            setAiOpen(null);
          }}
        />
      )}
    </div>
  );
}

function AiEditModal({
  projectId,
  selected,
  context,
  connections,
  onClose,
  onApply,
}: {
  projectId: string;
  selected: string;
  context: string;
  connections: { provider: string; connected: boolean }[];
  onClose: () => void;
  onApply: (text: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ text: string; provider: string; model: string } | null>(null);
  const presets = ["더 자연스럽게 다듬어줘", "더 짧고 간결하게", "블로그 문체에 맞게 바꿔줘", "맞춤법·띄어쓰기만 교정", "예시를 하나 추가해줘"];

  async function run() {
    setBusy(true);
    setErr("");
    setResult(null);
    const res = await fetch("/api/ai/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, selected, instruction, context, ...(ai ?? {}) }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "실패");
    setResult(data);
  }

  return (
    <Modal
      title="선택 부분 AI 수정"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>취소</button>
          {result ? (
            <>
              <button className="btn" onClick={run} disabled={busy}>다시 생성</button>
              <button className="btn btn-primary" onClick={() => onApply(result.text)}>이 수정 적용</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={run} disabled={busy || !instruction.trim()}>
              {busy ? <span className="spinner" /> : "AI 수정 실행"}
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div>
          <div className="label">선택한 부분</div>
          <div className="card card-pad small" style={{ background: "var(--panel-2)", maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap" }}>{selected}</div>
        </div>
        <div className="field">
          <label className="label">수정 지시</label>
          <textarea className="textarea" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="어떻게 고칠지 적어주세요" />
          <div className="row" style={{ marginTop: 6 }}>
            {presets.map((p) => (
              <button key={p} type="button" className="btn btn-sm" onClick={() => setInstruction(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">사용할 AI</span>
          <AiPicker value={ai} onChange={setAi} connections={connections} />
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}
        {result && (
          <div>
            <div className="label">수정 전후 비교 ({result.provider}/{result.model})</div>
            <Diff before={selected} after={result.text} />
            <p className="tiny muted" style={{ marginTop: 6 }}>적용 전까지 원고는 바뀌지 않습니다. 적용 후에도 ↶(실행 취소)나 버전 복원으로 되돌릴 수 있습니다.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
