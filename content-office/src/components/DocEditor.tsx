"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

/** 문서의 from~to 를 HTML 로 (표·목록·굵게 그대로) */
function rangeHtml(ed: Editor, from: number, to: number) {
  const frag = DOMSerializer.fromSchema(ed.schema).serializeFragment(ed.state.doc.slice(from, to).content);
  const box = document.createElement("div");
  box.appendChild(frag);
  return box.innerHTML;
}
/** AI 가 준 HTML 조각 정리 (스크립트·이벤트 속성 제거) */
function cleanHtml(html: string) {
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  d.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((n) => n.remove());
  d.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
  });
  return d.body.firstElementChild?.innerHTML ?? "";
}
const htmlText = (html: string) => new DOMParser().parseFromString(html, "text/html").body.innerText || new DOMParser().parseFromString(html, "text/html").body.textContent || "";

/** 글자 크기 (네이버 블로그 편집기와 비슷한 단계) */
const FONT_SIZES = ["11", "13", "15", "16", "19", "24", "28", "30", "34", "38"];
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
  onWholeRequest,
}: {
  projectId: string;
  serverDoc: EditorDoc | null;
  locked: boolean;
  lockedReason?: string;
  connections: { provider: string; connected: boolean }[];
  onSaved: (r: { needsRereview: boolean }) => void;
  /** 고른 곳 없이 말로만 요청 → 글 전체에서 AI가 찾아 고침 */
  onWholeRequest?: (note: string) => unknown;
}) {
  const [title, setTitle] = useState(serverDoc?.title ?? "");
  const [state, setState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<EditorDoc | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const revisionRef = useRef(serverDoc?.revision ?? 0);
  const dirtyRef = useRef(false);
  const titleRef = useRef(title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ✨ AI 수정: 선택한 글 · ✂️ 캡처한 영역(블록 단위) · 아무것도 없으면 글 전체에 말로 요청
  const [aiOpen, setAiOpen] = useState<null | { from: number; to: number; text: string; html?: string; image?: string; block?: boolean; whole?: boolean }>(null);
  const [capturing, setCapturing] = useState(false);
  const [drag, setDrag] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !locked,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ allowBase64: true }),
      TextStyle,
      FontSize,
      Placeholder.configure({ placeholder: "여기에 본문을 작성하세요. 텍스트를 선택하면 AI 부분 수정을 쓸 수 있습니다." }),
    ],
    content: serverDoc?.content_html ?? "",
    editorProps: {
      attributes: { class: "prose", "aria-label": "원고 본문" },
      // 📋 붙여넣기 기록 (ChatGPT·제미나이에서 복사해 온 글·사진): 붙이기 전 원고 보관 + 진행 기록
      handlePaste: (_view, event) => {
        const dt = event.clipboardData;
        if (!dt) return false;
        const txt = dt.getData("text/plain") || "";
        const html = dt.getData("text/html") || "";
        const imgs = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/")).length + (html.match(/<img\b/gi)?.length ?? 0);
        if (txt.trim().length >= 20 || imgs) {
          void fetch(`/api/projects/${projectId}/paste`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ preview: txt.slice(0, 200), chars: txt.length, images: imgs }) }).catch(() => {});
        }
        // 사진 파일을 복사해 온 경우(제미나이에서 '이미지 복사' 등): 커서 자리에 사진으로 넣음 (저장할 때 앱 이미지로 따로 보관)
        const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/") && f.size <= 15 * 1024 * 1024);
        if (files.length && !html.trim()) {
          for (const f of files) {
            const r = new FileReader();
            r.onload = () => {
              const node = _view.state.schema.nodes.image?.create({ src: String(r.result), alt: "붙여넣은 사진" });
              if (node) _view.dispatch(_view.state.tr.replaceSelectionWith(node));
            };
            r.readAsDataURL(f);
          }
          return true;
        }
        return false; // 글 붙여넣기는 그대로 진행
      },
    },
    // 사용자가 실제로 편집했을 때만 저장 (불러올 때의 자동 정리·변환은 무시)
    onUpdate: ({ editor: e, transaction }) => {
      if (!transaction.docChanged || !e.isFocused) return;
      markDirty();
    },
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
            fontSize: String(e.getAttributes("textStyle").fontSize ?? ""),
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
    // 고른 글이 없으면: 말로 요청해서 AI가 글 전체에서 고칠 곳을 찾아 고침
    if (!text.trim()) return setAiOpen({ from: 0, to: 0, text: "", whole: true });
    // 여러 문단·표에 걸쳐 고르면 걸친 블록 전체를 HTML 로 (구조 유지)
    const $f = editor!.state.doc.resolve(from), $t = editor!.state.doc.resolve(to);
    if ($f.depth > 0 && $t.depth > 0 && ($f.index(0) !== $t.index(0) || $f.node(1).type.name !== "paragraph" && $f.node(1).type.name !== "heading")) {
      const bf = $f.before(1), bt = $t.after(1);
      return setAiOpen({ from: bf, to: bt, text: editor!.state.doc.textBetween(bf, bt, "\n"), html: rangeHtml(editor!, bf, bt), block: true });
    }
    setAiOpen({ from, to, text });
  }

  /** ✂️ 캡처: 본문 위를 드래그한 영역 → 그 영역에 걸친 문단들(블록 단위) + 화면 이미지 */
  async function finishCapture(r: { x0: number; y0: number; x1: number; y1: number }) {
    setCapturing(false);
    setDrag(null);
    const ed = editor!;
    const view = ed.view;
    const box = view.dom.getBoundingClientRect();
    const left = Math.max(box.left + 2, Math.min(r.x0, r.x1)), right = Math.min(box.right - 2, Math.max(r.x0, r.x1));
    const top = Math.max(box.top + 2, Math.min(r.y0, r.y1)), bottom = Math.min(box.bottom - 2, Math.max(r.y0, r.y1));
    if (right - left < 8 || bottom - top < 8) return;
    const a = view.posAtCoords({ left, top }) ?? view.posAtCoords({ left: box.left + 4, top });
    const b = view.posAtCoords({ left: right, top: bottom }) ?? view.posAtCoords({ left: box.right - 4, top: bottom });
    if (!a || !b) return alert("본문 글 위를 드래그해 주세요.");
    const doc = ed.state.doc;
    // 걸친 문단 전체로 넓힘 (맨 위 블록 기준)
    const $a = doc.resolve(Math.min(a.pos, b.pos));
    const $b = doc.resolve(Math.max(a.pos, b.pos));
    const from = $a.depth > 0 ? $a.before(1) : 0;
    const to = $b.depth > 0 ? $b.after(1) : doc.content.size;
    const text = doc.textBetween(from, to, "\n").trim();
    if (!text) return alert("이 영역에서 글을 찾지 못했어요. 글이 있는 곳을 드래그해 주세요.");
    let image: string | undefined;
    try {
      const { toCanvas } = await import("html-to-image");
      const scale = 1;
      const canvas = await toCanvas(view.dom as HTMLElement, {
        pixelRatio: scale,
        skipFonts: true,
        backgroundColor: "#ffffff",
        // 다른 사이트 이미지·깨진 이미지는 캡처를 막으니 빼고 (글 위치 확인용이라 충분)
        filter: (n) => !(n instanceof HTMLImageElement) || n.src.startsWith("data:") || n.src.startsWith(location.origin),
      });
      const crop = document.createElement("canvas");
      crop.width = Math.round(right - left);
      crop.height = Math.round(bottom - top);
      crop.getContext("2d")!.drawImage(canvas, (left - box.left) * scale, (top - box.top) * scale, crop.width * scale, crop.height * scale, 0, 0, crop.width, crop.height);
      image = crop.toDataURL("image/jpeg", 0.85);
    } catch (e) {
      // 화면 이미지는 선택 — 실패하면 글만 보냄
      console.warn("capture image failed", e);
    }
    setAiOpen({ from, to, text, html: rangeHtml(ed, from, to), image, block: true });
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
          <select
            className="tb"
            value={(active?.fontSize ?? "").replace("px", "")}
            disabled={locked}
            onChange={(e) => (e.target.value ? editor.chain().focus().setFontSize(`${e.target.value}px`).run() : editor.chain().focus().unsetFontSize().run())}
            title="글자 크기 (글자를 고른 뒤 바꾸세요)"
            aria-label="글자 크기"
            style={{ width: "auto", paddingRight: 4 }}
          >
            <option value="">크기 기본</option>
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
          <button type="button" className={`tb ${capturing ? "on" : ""}`} onClick={() => { setCapturing((c) => !c); setDrag(null); }} disabled={locked} title="본문 위를 드래그해서 고칠 곳을 잘라 AI에게 보여줘요">
            ✂️ {capturing ? "캡처 취소" : "캡처"}
          </button>
          <button type="button" className={`tb ${active?.hasSel ? "on" : ""}`} onClick={openAi} disabled={locked} title="고른 글·캡처한 곳을 고치거나, 아무것도 안 골랐으면 말로 요청해서 글 전체에서 고쳐요">
            ✨ AI 수정
          </button>
        </div>
        {capturing && <div className="notice small" style={{ margin: 0, borderRadius: 0 }}>✂️ 고칠 곳을 본문 위에서 드래그하세요. 걸친 문단 전체를 AI에게 보여줘요. (Esc 취소)</div>}
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
        <div ref={shellRef} style={{ position: "relative" }}>
          <EditorContent editor={editor} />
          {capturing && (
            <div
              role="presentation"
              tabIndex={-1}
              onKeyDown={(e) => e.key === "Escape" && setCapturing(false)}
              onMouseDown={(e) => { e.preventDefault(); setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }); }}
              onMouseMove={(e) => drag && setDrag({ ...drag, x1: e.clientX, y1: e.clientY })}
              onMouseUp={() => drag && void finishCapture(drag)}
              onTouchStart={(e) => { const t = e.touches[0]; setDrag({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY }); }}
              onTouchMove={(e) => { const t = e.touches[0]; if (drag) setDrag({ ...drag, x1: t.clientX, y1: t.clientY }); }}
              onTouchEnd={() => drag && void finishCapture(drag)}
              style={{ position: "absolute", inset: 0, cursor: "crosshair", background: "rgba(40,90,255,.04)", zIndex: 5, touchAction: "none" }}
            >
              {drag && shellRef.current && (() => {
                const b = shellRef.current.getBoundingClientRect();
                return <div style={{ position: "absolute", left: Math.min(drag.x0, drag.x1) - b.left, top: Math.min(drag.y0, drag.y1) - b.top, width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0), border: "2px dashed var(--accent)", background: "rgba(40,90,255,.08)", pointerEvents: "none" }} />;
              })()}
            </div>
          )}
        </div>
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
          image={aiOpen.image}
          html={aiOpen.html}
          captured={!!aiOpen.image}
          whole={!!aiOpen.whole}
          canWhole={!!onWholeRequest}
          context={editor.getText()}
          connections={connections}
          onClose={() => setAiOpen(null)}
          onWhole={async (note) => {
            // 고치기 전에 내 변경부터 저장
            if (dirtyRef.current) await save(true);
            setAiOpen(null);
            await onWholeRequest?.(note);
          }}
          onApply={(text) => {
            if (aiOpen.block && aiOpen.html) {
              // 캡처·여러 문단: AI 가 고친 HTML(표·목록 구조 그대로)로 그 블록들을 바꿈
              editor.chain().focus().insertContentAt({ from: aiOpen.from, to: aiOpen.to }, cleanHtml(text) || "<p></p>").run();
            } else {
              editor.chain().focus().insertContentAt({ from: aiOpen.from, to: aiOpen.to }, text.replace(/\n+/g, " ")).run();
            }
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
  image,
  html,
  captured = false,
  whole,
  canWhole,
  context,
  connections,
  onClose,
  onApply,
  onWhole,
}: {
  projectId: string;
  selected: string;
  image?: string;
  html?: string;
  captured?: boolean;
  whole: boolean;
  canWhole: boolean;
  context: string;
  connections: { provider: string; connected: boolean }[];
  onClose: () => void;
  onApply: (text: string) => void;
  onWhole: (note: string) => void | Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ text: string; provider: string; model: string } | null>(null);
  const presets = html
    ? ["표에 행 하나 추가해줘", "표 아래에 기준일 메모 달아줘", "금액 합계 칸을 추가해줘", "맞춤법·띄어쓰기만 교정", "더 자연스럽게 다듬어줘"]
    : ["더 자연스럽게 다듬어줘", "더 짧고 간결하게", "블로그 문체에 맞게 바꿔줘", "맞춤법·띄어쓰기만 교정", "예시를 하나 추가해줘"];

  async function run() {
    setBusy(true);
    setErr("");
    setResult(null);
    if (whole) {
      // 고른 곳 없이 말로만: 글 전체에서 AI가 찾아 고침 (화면을 닫아도 계속)
      try {
        await onWhole(instruction.trim());
      } catch (e) {
        setErr((e as Error).message);
      }
      setBusy(false);
      return;
    }
    const res = await fetch("/api/ai/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, selected, instruction, context, ...(html ? { html } : {}), ...(image ? { image } : {}), ...(ai ?? {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "실패");
    setResult(data);
  }

  return (
    <Modal
      title={whole ? "✨ AI 수정 · 말로 요청" : captured ? "✨ AI 수정 · 캡처한 부분" : "✨ AI 수정 · 선택한 부분"}
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
            <button className="btn btn-primary" onClick={run} disabled={busy || !instruction.trim() || (whole && !canWhole)}>
              {busy ? <span className="spinner" /> : whole ? "글 전체에 반영 요청" : "AI 수정 실행"}
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        {whole ? (
          <div className="notice small">
            고른 글이 없어서 <b>말로 요청</b>하는 방식이에요. 무엇을 어디서 어떻게 바꿀지 적으면 AI가 글 전체에서 그 부분을 찾아 고쳐요. (예: &quot;부모급여 표에 2026년 11월 기준이라고 작게 적어줘&quot;)
            <div className="tiny muted" style={{ marginTop: 4 }}>정확한 곳을 짚으려면 ✂️ 캡처로 그 부분을 드래그하거나, 글을 드래그해 고른 뒤 ✨ AI 수정을 누르세요.</div>
          </div>
        ) : (
          <div>
            <div className="label">{captured ? "캡처한 부분 (이 영역의 문단 전체를 고쳐요)" : "선택한 부분"}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image && <img src={image} alt="캡처한 영역" style={{ maxWidth: "100%", maxHeight: 220, border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6 }} />}
            {html && !image ? (
              <div className="prose card card-pad ai-html-preview" style={{ background: "var(--panel-2)", maxHeight: 200, overflow: "auto", fontSize: 13 }} dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} />
            ) : (
              <div className="card card-pad small" style={{ background: "var(--panel-2)", maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap" }}>{selected}</div>
            )}
            {html && <div className="tiny muted" style={{ marginTop: 4 }}>표·목록·굵은 글씨 모양을 그대로 살려서 고쳐요.</div>}
          </div>
        )}
        <div className="field">
          <label className="label">{whole ? "수정 요청 (말로)" : "수정 지시"}</label>
          <textarea className="textarea" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={whole ? "예: 육아지원금 표 아래에 '2026년 11월 기준' 메모를 달고, 월별 금액 합계를 한 줄로 정리해줘" : "어떻게 고칠지 적어주세요"} autoFocus />
          {!whole && (
            <div className="row" style={{ marginTop: 6 }}>
              {presets.map((p) => (
                <button key={p} type="button" className="btn btn-sm" onClick={() => setInstruction(p)}>{p}</button>
              ))}
            </div>
          )}
        </div>
        {!whole && (
          <div className="field">
            <span className="label">사용할 AI</span>
            <AiPicker value={ai} onChange={setAi} connections={connections} />
          </div>
        )}
        {whole && !canWhole && <div className="notice notice-warn small">이 화면에서는 글 전체 수정 요청을 쓸 수 없어요. 글을 고르거나 캡처해 주세요.</div>}
        {err && <div className="notice notice-bad small">{err}</div>}
        {result && (
          <div>
            <div className="label">수정 전후 비교 ({result.provider}/{result.model})</div>
            {html ? (
              <>
                <div className="prose card card-pad ai-html-preview" style={{ maxHeight: 320, overflow: "auto", fontSize: 14 }} dangerouslySetInnerHTML={{ __html: cleanHtml(result.text) }} />
                <details style={{ marginTop: 6 }}>
                  <summary className="tiny muted" style={{ cursor: "pointer" }}>바뀐 글자 비교</summary>
                  <Diff before={selected} after={htmlText(cleanHtml(result.text))} />
                </details>
              </>
            ) : (
              <Diff before={selected} after={result.text} />
            )}
            <p className="tiny muted" style={{ marginTop: 6 }}>적용 전까지 원고는 바뀌지 않습니다. 적용 후에도 ↶(실행 취소)나 버전 복원으로 되돌릴 수 있습니다.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
