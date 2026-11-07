"use client";

import Link from "next/link";
import { useState } from "react";
import { api, Modal } from "@/components/client-utils";
import type { ChecklistItem, Routine, Run } from "@/lib/routines";

type RunRow = Run & { name: string; time: string; completion: string; checklist: ChecklistItem[]; blog_id: string | null; link: string; category: string };
type Tab = "today" | "all" | "log";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const STATUS: Record<string, [string, string]> = { pending: ["예정", ""], in_progress: ["진행 중", "badge-warn"], done: ["완료", "badge-ok"], missed: ["미수집", "badge-bad"] };
const KIND: Record<ChecklistItem["kind"], string> = { capture: "캡처 등록", views: "조회수 순위 캡처 (AI가 읽어 저장)", check: "확인 체크" };

export function scheduleText(r: Pick<Routine, "schedule" | "time">) {
  const s = r.schedule;
  const when = s.type === "weekly" ? `매주 ${(s.days ?? []).map((d) => DOW[d]).join("·")}` : s.type === "monthly" ? `매월 ${s.day}일` : "매일";
  return `${when} ${r.time}`;
}

const PRESETS: { label: string; v: Partial<Routine> }[] = [
  { label: "네이버 인기 글 순위 캡처", v: { name: "네이버 인기 글 순위 캡처", category: "blog", time: "09:00", completion: "checklist", schedule: { type: "daily", baseOffset: -1 }, link: "https://creator-advisor.naver.com", checklist: [{ id: "", label: "조회수 순위 TOP 10 캡처 등록", kind: "views", required: true }, { id: "", label: "반응 순위 TOP 10 캡처 등록", kind: "capture", required: true }, { id: "", label: "분석 결과 확인 및 저장", kind: "check", required: true }] } },
  { label: "티스토리 인기 글 캡처", v: { name: "티스토리 인기 글 캡처", category: "blog", time: "09:10", completion: "checklist", schedule: { type: "daily", baseOffset: -1 }, checklist: [{ id: "", label: "조회수 순위 캡처 등록", kind: "views", required: true }] } },
  { label: "블로그 유입 지표 확인", v: { name: "블로그 유입 지표 확인", category: "blog", time: "18:00", completion: "button", schedule: { type: "daily" }, link: "/", checklist: [{ id: "", label: "방문·유입 현황 점검", kind: "check", required: false }] } },
];

/** 재알림 횟수만큼 시각 칸 (모자라면 앞 시각 +2시간으로 채움, 넘치면 자름) */
function fitTimes(times: string[], n: number, first: string) {
  const out = times.filter((x) => /^\d{2}:\d{2}$/.test(x)).slice(0, n);
  while (out.length < n) {
    const prev = out[out.length - 1] ?? first;
    const [h, m] = prev.split(":").map(Number);
    out.push(`${String(Math.min(23, h + 2)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
}

const EMPTY: Partial<Routine> = { name: "", category: "blog", blog_id: null, link: "", schedule: { type: "daily", days: [1], day: 1, baseOffset: 0 }, time: "09:00", deadline: "23:59", notify: true, remind: { mode: "interval", minutes: 120, times: ["11:00", "18:00"], max: 2 }, completion: "button", checklist: [], skip_holidays: false, paused: false, priority: "normal" };

export default function RoutineBoard({ initialRoutines, initialToday, blogs, cats, telegram }: { initialRoutines: Routine[]; initialToday: RunRow[]; blogs: { id: string; name: string }[]; cats: { id: string; label: string }[]; telegram: boolean }) {
  const [tab, setTab] = useState<Tab>("today");
  const [routines, setRoutines] = useState(initialRoutines);
  const [today, setToday] = useState(initialToday);
  const [edit, setEdit] = useState<Partial<Routine> | null>(null);
  const [log, setLog] = useState<RunRow[] | null>(null);
  const [filter, setFilter] = useState({ from: "", to: "", status: "" });
  const [err, setErr] = useState("");

  async function reload() {
    const r = await api<{ routines: Routine[]; today: RunRow[] }>("/api/routines");
    setRoutines(r.routines);
    setToday(r.today);
  }
  async function loadLog(f = filter) {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setLog(await api<RunRow[]>(`/api/routines/runs?${p}`));
  }
  const done = today.filter((r) => r.status === "done").length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div className="seg" role="tablist">
          {([["today", "오늘의 루틴"], ["all", "전체 루틴"], ["log", "실행 기록"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); if (k === "log" && !log) void loadLog(); }}>{l}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setErr(""); setEdit({ ...EMPTY }); }}>+ 새 루틴</button>
      </div>
      {!telegram && <div className="notice small">텔레그램이 연결되지 않아 알림은 가지 않아요. <Link href="/settings#notify" style={{ color: "var(--accent)" }}>설정 → 알림 설정</Link></div>}

      {tab === "today" && (
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>오늘의 업무</h2><span className="badge">{done}/{today.length} 완료</span></div>
          <div className="progress-bar"><span style={{ width: `${today.length ? (done / today.length) * 100 : 0}%` }} /></div>
          <div className="list">
            {!today.length && <div className="list-item small muted">오늘 할 루틴이 없어요. &apos;+ 새 루틴&apos;으로 반복 업무를 등록하세요.</div>}
            {today.map((r) => {
              const req = r.checklist.filter((c) => c.required);
              const n = req.filter((c) => r.items.find((i) => i.id === c.id)?.done).length;
              return (
                <Link key={r.id} href={`/routines/run/${r.id}`} className="list-item routine-row">
                  <span className={`routine-dot ${r.status}`}>{r.status === "done" ? "✓" : ""}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong small">{r.name}</div>
                    <div className="tiny muted">🕘 {r.time}{req.length ? ` · ${n}/${req.length}` : ""}{r.base_date !== r.run_date ? ` · 기준일 ${r.base_date}` : ""}</div>
                  </div>
                  <span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}{r.status === "in_progress" && req.length ? ` · ${n}/${req.length}` : ""}</span>
                  <span className="tiny" style={{ color: "var(--accent)" }}>{r.status === "done" ? "보기" : r.checklist.some((c) => c.kind !== "check") ? "캡처 등록 →" : "업무 열기 →"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {tab === "all" && (
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>등록된 반복 업무 ({routines.length})</h2></div>
          <div className="list">
            {!routines.length && <div className="list-item small muted">아직 없어요.</div>}
            {routines.map((r) => (
              <div key={r.id} className="list-item routine-row" style={{ opacity: r.paused ? 0.55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong small">{r.name} {r.priority === "high" && <span className="badge badge-bad">중요</span>}</div>
                  <div className="tiny muted">🕘 {scheduleText(r)} · 마감 {r.deadline} · {cats.find((c) => c.id === r.category)?.label}{r.blog_id ? ` · ${blogs.find((b) => b.id === r.blog_id)?.name ?? ""}` : ""} · {r.notify ? "🔔 알림" : "알림 끔"}{r.checklist.length ? ` · 체크 ${r.checklist.length}개` : ""}</div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={async () => { await api(`/api/routines/${r.id}`, "PUT", { paused: !r.paused }); await reload(); }}>{r.paused ? "▶ 다시 켜기" : "⏸ 일시정지"}</button>
                <button className="btn btn-sm" onClick={() => { setErr(""); setEdit(r); }}>수정</button>
                <button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm(`'${r.name}' 루틴을 휴지통으로 옮길까요? (30일 안에 실행 기록까지 되살릴 수 있어요)`)) { await api(`/api/routines/${r.id}`, "DELETE"); await reload(); } }}>🗑</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "log" && (
        <section className="card">
          <div className="card-head" style={{ flexWrap: "wrap", gap: 6 }}>
            <h2 style={{ fontSize: 15 }}>실행 기록</h2>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} aria-label="시작일" />
              <input className="input" type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} aria-label="끝일" />
              <select className="select" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="상태">
                <option value="">모든 상태</option>
                {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => loadLog()}>보기</button>
            </div>
          </div>
          <div className="list">
            {log === null && <div className="list-item small muted"><span className="spinner" /></div>}
            {log?.length === 0 && <div className="list-item small muted">기록이 없어요.</div>}
            {log?.map((r) => (
              <Link key={r.id} href={`/routines/run/${r.id}`} className="list-item routine-row">
                <span className="tiny mono" style={{ width: 86 }}>{r.run_date}</span>
                <div style={{ flex: 1, minWidth: 0 }}><span className="small">{r.name}</span> <span className="tiny muted">기준일 {r.base_date}</span></div>
                <span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {edit && (
        <Modal title={edit.id ? "루틴 수정" : "새 루틴 등록"} onClose={() => setEdit(null)}>
          <RoutineForm v={edit} setV={setEdit} blogs={blogs} cats={cats} err={err} onSave={async () => {
            setErr("");
            try {
              if (edit.id) await api(`/api/routines/${edit.id}`, "PUT", edit);
              else await api("/api/routines", "POST", edit);
              setEdit(null);
              await reload();
            } catch (e) {
              setErr((e as Error).message);
            }
          }} />
        </Modal>
      )}
    </div>
  );
}

function RoutineForm({ v, setV, blogs, cats, err, onSave }: { v: Partial<Routine>; setV: (v: Partial<Routine>) => void; blogs: { id: string; name: string }[]; cats: { id: string; label: string }[]; err: string; onSave: () => void }) {
  const sc = v.schedule ?? { type: "daily" };
  const rm = v.remind ?? { mode: "none" };
  const list = v.checklist ?? [];
  const set = (p: Partial<Routine>) => setV({ ...v, ...p });
  return (
    <div className="stack routine-form" style={{ gap: 12 }}>
      {!v.id && (
        <div className="row" style={{ gap: 6 }}>
          <span className="tiny muted">예시로 채우기</span>
          {PRESETS.map((p) => <button key={p.label} className="chip" onClick={() => setV({ ...v, ...p.v, checklist: (p.v.checklist ?? []).map((c) => ({ ...c })) })}>{p.label}</button>)}
        </div>
      )}
      <label className="field"><span className="label">루틴 이름</span><input className="input" value={v.name ?? ""} placeholder="알고키친 인기 글 순위 캡처" onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="todo-fields">
        <label className="small stack" style={{ gap: 2 }}>업무 분류
          <select className="select" value={v.category ?? "blog"} onChange={(e) => set({ category: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        </label>
        <label className="small stack" style={{ gap: 2 }}>담당 블로그
          <select className="select" value={v.blog_id ?? ""} onChange={(e) => set({ blog_id: e.target.value || null })}><option value="">없음</option>{blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label className="small stack" style={{ gap: 2, gridColumn: "span 2" }}>바로가기 (캡처할 화면 주소)
          <input className="input" value={v.link ?? ""} placeholder="https://creator-advisor.naver.com" onChange={(e) => set({ link: e.target.value })} />
        </label>
      </div>
      <div className="field">
        <span className="label">반복 주기</span>
        <div className="seg">
          {([["daily", "매일"], ["weekly", "매주 특정 요일"], ["monthly", "매월 (날짜 지정)"]] as const).map(([k, l]) => <button key={k} className={sc.type === k ? "on" : ""} onClick={() => set({ schedule: { ...sc, type: k } })}>{l}</button>)}
        </div>
        {sc.type === "weekly" && <div className="row" style={{ gap: 4, marginTop: 6 }}>{DOW.map((d, i) => <button key={d} className={`chip${(sc.days ?? []).includes(i) ? " on" : ""}`} onClick={() => set({ schedule: { ...sc, days: (sc.days ?? []).includes(i) ? (sc.days ?? []).filter((x) => x !== i) : [...(sc.days ?? []), i] } })}>{d}</button>)}</div>}
        {sc.type === "monthly" && <label className="small row" style={{ gap: 6, marginTop: 6 }}>매월 <input className="input" type="number" min={1} max={31} style={{ width: 70 }} value={sc.day ?? 1} onChange={(e) => set({ schedule: { ...sc, day: Number(e.target.value) } })} />일 <span className="tiny muted">(그 날이 없는 달은 건너뜀)</span></label>}
      </div>
      <div className="todo-fields">
        <label className="small stack" style={{ gap: 2 }}>첫 알림 (한국 시간)<input className="input" type="time" value={v.time ?? "09:00"} onChange={(e) => set({ time: e.target.value })} /></label>
        <label className="small stack" style={{ gap: 2 }}>마감<input className="input" type="time" value={v.deadline ?? "23:59"} onChange={(e) => set({ deadline: e.target.value })} /></label>
        <label className="small stack" style={{ gap: 2 }}>자료 기준일
          <select className="select" value={sc.baseOffset === -1 ? "-1" : "0"} onChange={(e) => set({ schedule: { ...sc, baseOffset: Number(e.target.value) } })}><option value="0">실행일 당일</option><option value="-1">전날 (어제 통계)</option></select>
        </label>
        <label className="small stack" style={{ gap: 2 }}>중요도
          <select className="select" value={v.priority ?? "normal"} onChange={(e) => set({ priority: e.target.value })}><option value="high">중요</option><option value="normal">보통</option><option value="low">낮음</option></select>
        </label>
      </div>
      <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={v.notify !== false} onChange={(e) => set({ notify: e.target.checked })} /> <b>텔레그램 알림 사용</b></label>
        {v.notify !== false && (
          <>
            <span className="tiny muted">미완료 시 재알림</span>
            <div className="seg" style={{ flexWrap: "wrap" }}>
              {([[30, "30분"], [60, "1시간"], [120, "2시간"]] as const).map(([m, l]) => <button key={m} className={rm.mode === "interval" && rm.minutes === m ? "on" : ""} onClick={() => set({ remind: { ...rm, mode: "interval", minutes: m } })}>{l} 간격</button>)}
              <button className={rm.mode === "times" ? "on" : ""} onClick={() => set({ remind: { ...rm, mode: "times", times: fitTimes(rm.times?.length ? rm.times : ["11:00", "18:00"], rm.max ?? 2, v.time ?? "09:00") } })}>정한 시각</button>
              <button className={rm.mode === "none" ? "on" : ""} onClick={() => set({ remind: { ...rm, mode: "none" } })}>재알림 없음</button>
            </div>
            {rm.mode !== "none" && (
              <label className="small row" style={{ gap: 6 }}>
                {rm.mode === "times" ? "재알림" : "최대"}
                <select className="select" style={{ width: 80 }} value={rm.max ?? 2} onChange={(e) => set({ remind: { ...rm, max: Number(e.target.value), times: fitTimes(rm.times ?? [], Number(e.target.value), v.time ?? "09:00") } })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}회</option>)}</select>
                <span className="tiny muted">마감 전까지만</span>
              </label>
            )}
            {rm.mode === "times" && (
              <div className="row" style={{ gap: 6 }}>
                {fitTimes(rm.times ?? [], rm.max ?? 2, v.time ?? "09:00").map((tm, k, arr) => (
                  <label key={k} className="tiny stack" style={{ gap: 2 }}>{k + 1}회차
                    <input className="input" type="time" style={{ width: 120 }} value={tm} onChange={(e) => set({ remind: { ...rm, times: arr.map((x, j) => (j === k ? e.target.value : x)) } })} aria-label={`재알림 ${k + 1}회차 시각`} />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <span className="label">완료 인정 기준</span>
        <div className="seg" style={{ flexWrap: "wrap" }}>
          {([["button", "완료 버튼 클릭"], ["checklist", "필수 항목(캡처) 모두 완료"], ["system", "시스템이 작업 결과 확인"]] as const).map(([k, l]) => <button key={k} className={v.completion === k ? "on" : ""} onClick={() => set({ completion: k })}>{l}</button>)}
        </div>
        <span className="tiny muted">{v.completion === "system" ? "고른 블로그의 기준일 조회수 순위 캡처가 저장됐는지 시스템이 확인해요 (대시보드 인기 글 TOP 10 기록)." : v.completion === "checklist" ? "필수 항목이 모두 체크·등록되면 자동으로 완료돼요. 텔레그램 '완료 처리'를 눌러도 남은 항목이 있으면 안내만 해요." : "텔레그램이나 화면에서 '완료 처리'를 누르면 끝나요."}</span>
        <span className="label" style={{ marginTop: 4 }}>체크리스트 {v.completion === "checklist" ? "(필수 제출 자료)" : "(선택)"}</span>
        {list.map((c, i) => (
          <div key={i} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input className="input" value={c.label} placeholder="조회수 순위 TOP 10 캡처 등록" onChange={(e) => set({ checklist: list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} aria-label={`항목 ${i + 1}`} />
            <select className="select" style={{ width: 190 }} value={c.kind} onChange={(e) => set({ checklist: list.map((x, k) => (k === i ? { ...x, kind: e.target.value as ChecklistItem["kind"] } : x)) })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="tiny row" style={{ gap: 3, flexShrink: 0 }}><input type="checkbox" checked={c.required} onChange={(e) => set({ checklist: list.map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)) })} />필수</label>
            <button className="btn btn-sm btn-ghost" onClick={() => set({ checklist: list.filter((_, k) => k !== i) })}>×</button>
          </div>
        ))}
        <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ checklist: [...list, { id: "", label: "", kind: "capture", required: true }] })}>+ 항목 추가</button>
      </div>
      <div className="stack" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!v.skip_holidays} onChange={(e) => set({ skip_holidays: e.target.checked })} /> 휴무일 제외 (주말·공휴일엔 만들지 않음)</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!v.paused} onChange={(e) => set({ paused: e.target.checked })} /> 일시정지</label>
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-primary" onClick={onSave}>루틴 저장</button>
      </div>
    </div>
  );
}
