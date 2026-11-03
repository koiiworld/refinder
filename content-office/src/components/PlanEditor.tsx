"use client";

import { useEffect, useState } from "react";
import type { Plan } from "@/lib/types";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function PlanEditor({
  plan,
  readOnly,
  onSave,
}: {
  plan: Plan;
  readOnly: boolean;
  onSave: (p: Plan) => Promise<void>;
}) {
  const [p, setP] = useState<Plan>(plan);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // 서버의 새 기획안 반영 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!dirty) setP(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  const ro = readOnly;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {p.notes && <div className="notice small" style={{ whiteSpace: "pre-wrap" }}>📝 {p.notes}</div>}

      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>SEO 제목 후보</h3>
        {p.titleCandidates.map((t, i) => (
          <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
            <input type="radio" name="title" checked={p.selectedTitle === t} disabled={ro} onChange={() => set("selectedTitle", t)} aria-label="이 제목 선택" />
            <input
              className="input"
              value={t}
              disabled={ro}
              onChange={(e) => {
                const next = [...p.titleCandidates];
                const wasSel = p.selectedTitle === t;
                next[i] = e.target.value;
                setP((x) => ({ ...x, titleCandidates: next, selectedTitle: wasSel ? e.target.value : x.selectedTitle }));
                setDirty(true);
              }}
            />
            <span className="tiny muted" style={{ width: 36, textAlign: "right" }}>{t.length}자</span>
            {!ro && (
              <button className="btn btn-ghost btn-sm" onClick={() => set("titleCandidates", p.titleCandidates.filter((_, j) => j !== i))} aria-label="삭제">✕</button>
            )}
          </div>
        ))}
        {!ro && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("titleCandidates", [...p.titleCandidates, ""])}>+ 제목 후보</button>
        )}
      </section>

      <section className="card card-pad grid grid-2">
        <div className="field">
          <label className="label">핵심 키워드</label>
          <input className="input" value={p.mainKeyword} disabled={ro} onChange={(e) => set("mainKeyword", e.target.value)} />
        </div>
        <div className="field">
          <label className="label">연관 키워드 (쉼표 구분)</label>
          <input className="input" value={p.subKeywords.join(", ")} disabled={ro} onChange={(e) => set("subKeywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
        </div>
        <div className="field">
          <label className="label">검색 의도</label>
          <textarea className="textarea" value={p.searchIntent} disabled={ro} onChange={(e) => set("searchIntent", e.target.value)} />
        </div>
        <div className="field">
          <label className="label">대상 독자</label>
          <textarea className="textarea" value={p.targetReader} disabled={ro} onChange={(e) => set("targetReader", e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label className="label">콘텐츠 방향 · 차별화</label>
          <textarea className="textarea" value={p.direction} disabled={ro} onChange={(e) => set("direction", e.target.value)} />
        </div>
        <p className="tiny muted" style={{ gridColumn: "1 / -1" }}>※ 검색량·경쟁도 수치는 실제 조회 데이터가 아니면 표시하지 않습니다. 실제 지표는 연구소의 '검색어 트렌드'(네이버 데이터랩 연결 시)에서 확인하세요.</p>
      </section>

      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>목차</h3>
        {p.outline.map((o, i) => (
          <div key={i} className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 8 }}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="badge">{i + 1}</span>
              <input
                className="input"
                value={o.heading}
                disabled={ro}
                aria-label="소제목"
                onChange={(e) => set("outline", p.outline.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))}
              />
              {!ro && (
                <>
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} aria-label="위로" onClick={() => {
                    const n = [...p.outline];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    set("outline", n);
                  }}>↑</button>
                  <button className="btn btn-ghost btn-sm" aria-label="삭제" onClick={() => set("outline", p.outline.filter((_, j) => j !== i))}>✕</button>
                </>
              )}
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 60 }}
              value={o.points.join("\n")}
              disabled={ro}
              aria-label="다룰 내용 (줄바꿈 구분)"
              placeholder="다룰 내용 (줄바꿈으로 구분)"
              onChange={(e) => set("outline", p.outline.map((x, j) => (j === i ? { ...x, points: e.target.value.split("\n") } : x)))}
              onBlur={(e) => set("outline", p.outline.map((x, j) => (j === i ? { ...x, points: lines(e.target.value) } : x)))}
            />
          </div>
        ))}
        {!ro && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("outline", [...p.outline, { heading: "", points: [] }])}>+ 소제목 추가</button>
        )}
      </section>

      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>이미지 제작 계획</h3>
        {p.imagePlan.map((im, i) => (
          <div key={i} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <input className="input" style={{ maxWidth: 160 }} value={im.position} disabled={ro} aria-label="위치" onChange={(e) => set("imagePlan", p.imagePlan.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))} />
            <input className="input" value={im.description} disabled={ro} aria-label="설명" onChange={(e) => set("imagePlan", p.imagePlan.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            {!ro && <button className="btn btn-ghost btn-sm" aria-label="삭제" onClick={() => set("imagePlan", p.imagePlan.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        {!ro && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("imagePlan", [...p.imagePlan, { position: "", description: "" }])}>+ 이미지 컷</button>
        )}
      </section>

      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>활용할 출처·근거 자료</h3>
        {p.sources.length ? (
          p.sources.map((s, i) => (
            <div key={i} className="small wrap-any">
              <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{s.title || s.url}</a>
              {s.note && <span className="muted"> — {s.note}</span>}
            </div>
          ))
        ) : (
          <p className="small muted">기획안에 연결된 출처가 없습니다. '출처' 탭에서 URL을 추가한 뒤 기획안을 다시 작성하면 AI가 활용합니다.</p>
        )}
      </section>

      {!ro && (
        <div className="row" style={{ position: "sticky", bottom: 70, justifyContent: "flex-end" }}>
          {dirty && <span className="small muted">저장하지 않은 변경 있음</span>}
          <button className="btn" disabled={!dirty || busy} onClick={() => { setP(plan); setDirty(false); }}>되돌리기</button>
          <button
            className="btn btn-primary"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ ...p, titleCandidates: p.titleCandidates.filter(Boolean), outline: p.outline.map((o) => ({ ...o, points: o.points.filter((x) => x.trim()) })) });
                setDirty(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <span className="spinner" /> : "기획안 저장 (새 버전)"}
          </button>
        </div>
      )}
    </div>
  );
}
