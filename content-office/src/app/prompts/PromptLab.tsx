"use client";

import { useMemo, useState } from "react";
import { getGuide, KINDS, supports, TARGETS, TARGET_LABEL, KIND_LABEL, type PromptKind, type PromptMedia, type PromptTarget, type RefineResult } from "@/lib/prompt-guides";
import type { PromptRow } from "@/lib/promptlab";
import { AiPicker, api, Diff, Modal, useToast } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type BlogLite = { id: string; name: string; color: string };
type Conn = { provider: string; connected: boolean };

function kindLabel(kind: PromptKind, media: PromptMedia) {
  return kind === "visual" ? (media === "video" ? "영상" : "이미지") : KIND_LABEL[kind];
}

export default function PromptLab({ blogs, initial, connections }: { blogs: BlogLite[]; initial: PromptRow[]; connections: Conn[] }) {
  const [list, setList] = useState<PromptRow[]>(initial);
  const [target, setTarget] = useState<PromptTarget>("higgsfield");
  const [kind, setKind] = useState<PromptKind>("visual");
  const [media, setMedia] = useState<PromptMedia>("video");
  const [blogId, setBlogId] = useState("");
  const [text, setText] = useState("");
  const [goal, setGoal] = useState("");
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [filter, setFilter] = useState<PromptTarget | "all">("all");
  const [toast, setToast] = useToast();

  const sup = supports(target, kind);
  const guide = sup.ok ? getGuide(target, kind, media) : null;
  const sel = list.find((p) => p.id === selId) ?? null;
  const anyAi = connections.some((c) => c.connected);

  function upsert(row: PromptRow) {
    setList((l) => [row, ...l.filter((x) => x.id !== row.id)]);
    setSelId(row.id);
  }

  function pickTarget(t: PromptTarget) {
    setTarget(t);
    // 지원하지 않는 조합이면 가능한 용도로 자동 전환
    if (!supports(t, kind).ok) setKind(t === "higgsfield" ? "visual" : "writing");
  }

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const row = await api<PromptRow>("/api/prompts", "POST", { target, kind, media, blogId, text, goal, ...(ai ?? {}) });
      upsert(row);
      setToast("프롬프트를 다듬었습니다.");
      document.getElementById("prompt-result")?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* ───── 입력 ───── */}
        <section className="card card-pad stack">
          <div className="field">
            <span className="label">대상 AI</span>
            <div className="row">
              {TARGETS.map((t) => (
                <button key={t.id} type="button" className={`btn btn-sm ${target === t.id ? "btn-primary" : ""}`} onClick={() => pickTarget(t.id)} title={t.desc}>
                  {t.label}
                </button>
              ))}
            </div>
            <span className="tiny muted" style={{ marginTop: 4 }}>{TARGETS.find((t) => t.id === target)?.desc}</span>
          </div>
          <div className="field">
            <span className="label">용도</span>
            <div className="row">
              {KINDS.map((k) => {
                const s = supports(target, k.id);
                return (
                  <button key={k.id} type="button" disabled={!s.ok} title={s.reason ?? k.desc} className={`btn btn-sm ${kind === k.id ? "btn-primary" : ""}`} onClick={() => setKind(k.id)}>
                    {k.label}
                  </button>
                );
              })}
            </div>
            {target === "claude" && <span className="tiny muted" style={{ marginTop: 4 }}>Claude는 이미지·영상을 만들지 않아 '이미지·영상'은 선택할 수 없습니다.</span>}
            {target === "higgsfield" && <span className="tiny muted" style={{ marginTop: 4 }}>Higgsfield는 이미지·영상 생성 전용입니다.</span>}
          </div>
          {kind === "visual" && (
            <div className="field">
              <span className="label">결과물</span>
              <div className="row">
                <button type="button" className={`btn btn-sm ${media === "image" ? "btn-primary" : ""}`} onClick={() => setMedia("image")}>이미지</button>
                <button type="button" className={`btn btn-sm ${media === "video" ? "btn-primary" : ""}`} onClick={() => setMedia("video")}>영상</button>
              </div>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="pb">블로그 맥락 (선택)</label>
            <select id="pb" className="select" value={blogId} onChange={(e) => setBlogId(e.target.value)}>
              <option value="">적용 안 함</option>
              {blogs.map((b) => <option key={b.id} value={b.id}>{b.name} — {kind === "visual" ? "이미지 스타일" : "문체"} 반영</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="pt">다듬을 프롬프트 *</label>
            <textarea id="pt" className="textarea" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "visual" ? "예: 맛있는 계란말이 만드는 영상" : kind === "writing" ? "예: 계란말이 레시피 블로그 글 써줘" : "예: 계란 유통기한 지나도 먹어도 돼?"} />
          </div>
          <div className="field">
            <label className="label" htmlFor="pg">원하는 결과 (선택)</label>
            <input id="pg" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="예: 인스타 릴스용 세로 8초, 따뜻한 분위기" />
          </div>
          <div className="field">
            <span className="label">다듬을 때 쓸 AI</span>
            <AiPicker value={ai} onChange={setAi} connections={connections} />
            {!anyAi && <span className="tiny" style={{ color: "var(--warn)", marginTop: 4 }}>AI가 연결되지 않아 원문을 고쳐 쓰지 않고, 권장 구조만 덧붙입니다.</span>}
          </div>
          {err && <div className="notice notice-bad small">{err}</div>}
          <button className="btn btn-primary" disabled={busy || !sup.ok || !text.trim()} onClick={create}>
            {busy ? <><span className="spinner" /> 다듬는 중…</> : `${TARGET_LABEL[target]} ${kindLabel(kind, media)}용으로 다듬기`}
          </button>
        </section>

        {/* ───── 지침 ───── */}
        <section className="card card-pad stack">
          {guide ? (
            <>
              <div className="row between">
                <h2 style={{ fontSize: 15 }}>{guide.title} 작성 요령</h2>
                <span className="badge">{guide.language === "en" ? "영어 권장" : "한국어"}</span>
              </div>
              <div>
                <div className="label">권장 구조</div>
                <div className="card card-pad small mono" style={{ background: "var(--panel-2)", whiteSpace: "pre-wrap" }}>{guide.structure}</div>
              </div>
              <div>
                <div className="label">요령</div>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{guide.tips.map((t) => <li key={t} style={{ marginBottom: 4 }}>{t}</li>)}</ul>
              </div>
              <div>
                <div className="label">피할 것</div>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{guide.avoid.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <p className="tiny muted">일반적으로 알려진 작성 요령입니다. 모델이 업데이트되면 결과가 달라질 수 있습니다.</p>
            </>
          ) : (
            <div className="notice notice-warn small">{sup.reason}</div>
          )}
        </section>
      </div>

      {/* ───── 결과 ───── */}
      <div id="prompt-result">{sel && <ResultPanel key={sel.id + sel.versions.length} row={sel} connections={connections} onChange={upsert} toast={setToast} onDelete={() => { setList((l) => l.filter((x) => x.id !== sel.id)); setSelId(null); }} />}</div>

      {/* ───── 보관함 ───── */}
      <section className="card">
        <div className="card-head">
          <h2>프롬프트 보관함 ({list.length})</h2>
          <div className="row" style={{ gap: 4 }}>
            <button className={`btn btn-sm ${filter === "all" ? "btn-primary" : ""}`} onClick={() => setFilter("all")}>전체</button>
            {TARGETS.map((t) => <button key={t.id} className={`btn btn-sm ${filter === t.id ? "btn-primary" : ""}`} onClick={() => setFilter(t.id)}>{t.label}</button>)}
          </div>
        </div>
        <div className="list">
          {list.filter((p) => filter === "all" || p.target === filter).map((p) => (
            <button key={p.id} className="list-item" style={{ background: p.id === selId ? "var(--accent-soft)" : "none", border: 0, borderTop: "1px solid var(--line)", textAlign: "left", cursor: "pointer", width: "100%" }} onClick={() => { setSelId(p.id); document.getElementById("prompt-result")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="badge badge-accent">{TARGET_LABEL[p.target]}</span>
              <span className="badge">{kindLabel(p.kind, p.media)}</span>
              <span className="ellipsis small" style={{ flex: 1 }}>{p.title}</span>
              <span className="tiny muted">v{p.versions.length} · {fmtDate(p.updated_at)}</span>
            </button>
          ))}
          {!list.length && <div className="empty">아직 저장된 프롬프트가 없습니다.</div>}
        </div>
      </section>
      {toast}
    </div>
  );
}

function ResultPanel({ row, connections, onChange, toast, onDelete }: { row: PromptRow; connections: Conn[]; onChange: (r: PromptRow) => void; toast: (s: string) => void; onDelete: () => void }) {
  const cur = row.current!;
  const last = row.versions[row.versions.length - 1];
  const [prompt, setPrompt] = useState(cur.prompt);
  const [negative, setNegative] = useState(cur.negative);
  const [feedback, setFeedback] = useState("");
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [diffOf, setDiffOf] = useState<number | null>(null);
  const dirty = prompt !== cur.prompt || negative !== cur.negative;
  const guide = useMemo(() => getGuide(row.target, row.kind, row.media), [row]);

  const copy = async (t: string, what: string) => {
    await navigator.clipboard.writeText(t);
    toast(`${what} 복사됨`);
  };
  async function act(payload: Record<string, unknown>, msg: string) {
    setBusy(true);
    setErr("");
    try {
      onChange(await api<PromptRow>(`/api/prompts/${row.id}`, "POST", payload));
      toast(msg);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const diffVer = row.versions.find((v) => v.n === diffOf);

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <div className="row">
          <span className="badge badge-accent">{TARGET_LABEL[row.target]}</span>
          <span className="badge">{kindLabel(row.kind, row.media)}</span>
          <h2 className="ellipsis" style={{ maxWidth: 360 }}>{row.title}</h2>
        </div>
        <span className="tiny muted">
          v{last.n} · {last.source === "ai" ? `${last.provider}/${last.model}` : last.source === "template" ? "템플릿(AI 아님)" : "직접 수정"}
        </span>
      </div>
      <div className="card-pad stack">
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>원래 프롬프트 보기</summary>
          <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{row.input}{row.goal && `\n\n원하는 결과: ${row.goal}`}</div>
        </details>

        <div className="field">
          <div className="row between">
            <span className="label">최종 프롬프트 {guide?.language === "en" && "(영어)"}</span>
            <button className="btn btn-sm btn-primary" onClick={() => copy(prompt, "프롬프트")}>복사</button>
          </div>
          <textarea className="textarea mono" style={{ minHeight: 160, fontSize: 13 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="최종 프롬프트" />
        </div>
        {cur.promptKo && (
          <div className="card card-pad small" style={{ background: "var(--panel-2)", whiteSpace: "pre-wrap" }}>
            <div className="label">한국어 해석</div>
            {cur.promptKo}
          </div>
        )}
        {guide?.negative && (
          <div className="field">
            <div className="row between">
              <span className="label">제외 프롬프트 (Negative)</span>
              <button className="btn btn-sm" onClick={() => copy(negative, "제외 프롬프트")} disabled={!negative}>복사</button>
            </div>
            <textarea className="textarea mono" style={{ minHeight: 56, fontSize: 13 }} value={negative} onChange={(e) => setNegative(e.target.value)} aria-label="제외 프롬프트" />
          </div>
        )}
        {dirty && (
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act({ action: "save", result: { ...cur, prompt, negative } }, "직접 수정한 내용을 새 버전으로 저장했습니다.")}>직접 수정 저장</button>
            <button className="btn btn-sm" onClick={() => { setPrompt(cur.prompt); setNegative(cur.negative); }}>되돌리기</button>
          </div>
        )}

        <div className="grid grid-3">
          <InfoList title="바꾼 점" items={cur.changes} />
          <InfoList title="더 정확해지려면 정할 것" items={cur.questions} empty="추가로 정할 것 없음" />
          <InfoList title="생성 화면 설정 추천" items={cur.settings} empty="-" />
        </div>

        <div className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 8 }}>
          <span className="label" style={{ margin: 0 }}>추가 수정 요청</span>
          <textarea className="textarea" style={{ minHeight: 64 }} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="예: 더 따뜻한 색감, 카메라는 고정, 손은 나오지 않게 / 위 질문 답변: 세로 9:16, 8초" />
          <div className="row">
            <AiPicker value={ai} onChange={setAi} connections={connections} />
            <button className="btn btn-primary" disabled={busy || !feedback.trim()} onClick={async () => { await act({ action: "refine", feedback, ...(ai ?? {}) }, "수정 요청을 반영했습니다."); setFeedback(""); }}>
              {busy ? <span className="spinner" /> : "다시 다듬기"}
            </button>
          </div>
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}

        <div>
          <div className="label">버전 기록</div>
          <div className="list card">
            {[...row.versions].reverse().map((v) => (
              <div key={v.n} className="list-item" style={{ flexWrap: "wrap" }}>
                <span className="badge">v{v.n}</span>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div className="small ellipsis">{v.feedback || "처음 다듬기"}</div>
                  <div className="tiny muted">{v.source === "ai" ? `${v.provider}/${v.model}` : v.source === "template" ? "템플릿(AI 아님)" : "직접 수정"} · {fmtDate(v.created_at)}</div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => setDiffOf(v.n)}>현재와 비교</button>
                  {v.n !== last.n && <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "restore", n: v.n }, `v${v.n}을 복원했습니다.`)}>복원</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-sm btn-danger" onClick={async () => { if (!confirm("이 프롬프트와 모든 버전을 삭제할까요?")) return; await api(`/api/prompts/${row.id}`, "DELETE"); onDelete(); }}>삭제</button>
        </div>
      </div>
      {diffVer && (
        <Modal title={`v${diffVer.n} → 현재`} onClose={() => setDiffOf(null)}>
          <Diff before={diffVer.result.prompt} after={cur.prompt} />
        </Modal>
      )}
    </section>
  );
}

function InfoList({ title, items, empty = "-" }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="card card-pad" style={{ minWidth: 0 }}>
      <div className="label">{title}</div>
      {items.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{items.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}</ul> : <span className="small muted">{empty}</span>}
    </div>
  );
}
