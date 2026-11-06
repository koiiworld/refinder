"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import type { Routine, Run } from "@/lib/routines";

const STATUS: Record<string, [string, string]> = { pending: ["예정", ""], in_progress: ["진행 중", "badge-warn"], done: ["완료", "badge-ok"], missed: ["미수집", "badge-bad"] };

export default function RunView({ initial, routine }: { initial: Run; routine: Routine }) {
  const [run, setRun] = useState(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<string | null>(routine.checklist.find((c) => c.kind !== "check" && !initial.items.find((i) => i.id === c.id)?.done)?.id ?? null);
  const req = routine.checklist.filter((c) => c.required);
  const n = req.filter((c) => run.items.find((i) => i.id === c.id)?.done).length;

  async function upload(itemId: string, file: File) {
    setBusy(itemId);
    setMsg(null);
    const fd = new FormData();
    fd.append("itemId", itemId);
    fd.append("file", file);
    try {
      const res = await fetch(`/api/routines/runs/${run.id}`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "등록 실패");
      setRun(d.run);
      const it = d.run.items.find((x: { id: string; note?: string }) => x.id === itemId);
      setMsg({ ok: true, text: `등록했어요.${it?.note ? ` (${it.note})` : ""}${d.run.status === "done" ? " 필수 항목을 모두 채워 완료됐어요 ✅" : ""}` });
      const next = routine.checklist.find((c) => c.kind !== "check" && c.id !== itemId && !d.run.items.find((x: { id: string; done: boolean }) => x.id === c.id)?.done);
      setTarget(next?.id ?? null);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }
  // Ctrl+V 로 캡처 붙여넣기 → 지금 고른 캡처 항목에
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f && target) { e.preventDefault(); void upload(target, f); }
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  });

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await api<{ run: Run; done?: boolean; missing?: string[]; snoozed?: boolean }>(`/api/routines/runs/${run.id}`, "POST", body);
      if (r.run) setRun(r.run);
      if (body.action === "complete") setMsg(r.done ? { ok: true, text: "완료 처리했어요 ✅ 남은 알림은 취소됐어요." } : { ok: false, text: `아직 남았어요: ${r.missing?.join(", ")}` });
      if (body.action === "snooze") setMsg({ ok: !!r.snoozed, text: r.snoozed ? "30분 뒤에 다시 알릴게요." : "마감이 가까워 더 미룰 수 없어요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between">
          <b>{routine.name}</b>
          <span className={`badge ${STATUS[run.status][1]}`}>{STATUS[run.status][0]}</span>
        </div>
        <span className="tiny muted">실행일 {run.run_date} · 자료 기준일 {run.base_date} · 첫 알림 {routine.time} · 마감 {routine.deadline}</span>
        {routine.link && <a className="btn btn-sm" style={{ alignSelf: "flex-start" }} href={routine.link} target={/^https?:/.test(routine.link) ? "_blank" : undefined} rel="noreferrer">↗ 바로가기 (캡처할 화면)</a>}
        {routine.checklist.map((c) => {
          const it = run.items.find((i) => i.id === c.id);
          return (
            <div key={c.id} className={`routine-item${target === c.id ? " target" : ""}`}
              onDragOver={(e) => { if (c.kind !== "check") e.preventDefault(); }}
              onDrop={(e) => { const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/")); if (f && c.kind !== "check") { e.preventDefault(); void upload(c.id, f); } }}>
              <button className={`routine-dot ${it?.done ? "done" : ""}`} aria-label={`${c.label} ${it?.done ? "완료 취소" : "완료"}`} disabled={!!busy || (c.kind !== "check" && !it?.done)} onClick={() => act({ action: "item", itemId: c.id, done: !it?.done }, c.id)} title={c.kind !== "check" && !it?.done ? "캡처를 올리면 체크돼요" : ""}>{it?.done ? "✓" : ""}</button>
              <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <span className="small">{c.label} {c.required ? <span className="tiny muted">필수</span> : null}</span>
                {it?.note && <span className="tiny muted">{it.note}</span>}
                {it?.img && <a href={`/api/routines/capture/${it.img}.jpg`} target="_blank" rel="noreferrer"><img src={`/api/routines/capture/${it.img}.jpg`} alt="캡처" className="routine-cap" /></a>}
                {c.kind !== "check" && (
                  <div className="row" style={{ gap: 6 }}>
                    <label className="btn btn-sm">{busy === c.id ? <span className="spinner" /> : it?.img ? "다시 올리기" : "📸 캡처 올리기"}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(c.id, e.target.files[0])} /></label>
                    <button className={`btn btn-sm btn-ghost${target === c.id ? " on" : ""}`} onClick={() => setTarget(c.id)}>{target === c.id ? "📋 여기에 Ctrl+V" : "붙여넣기 대상으로"}</button>
                    {c.kind === "views" && <span className="tiny muted">AI가 글 제목·조회수를 읽어 그날 기록으로 저장해요 (무료 Gemini)</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {req.length > 0 && (
          <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <b className="small">완료 조건</b>
            <span className="badge">{n}/{req.length}</span>
          </div>
        )}
        <span className="tiny muted">{routine.completion === "checklist" ? "필수 항목이 모두 채워지면 자동으로 완료되고, 그 전까지는 정한 대로 다시 알려요." : routine.completion === "system" ? "기준일 조회수 순위 캡처가 저장됐는지 시스템이 확인해요." : "다 했으면 완료 처리를 누르세요."} 캡처는 끌어다 놓거나 Ctrl+V 로 붙여넣어도 돼요. 마감이 지나도 나중에 올리면 이 기준일에 그대로 기록돼요.</span>
        {msg && <div className={`notice small ${msg.ok ? "" : "notice-bad"}`}>{msg.text}</div>}
        {run.status !== "done" && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act({ action: "complete" }, "complete")}>✅ 완료 처리</button>
            {run.status !== "missed" && <button className="btn btn-sm" disabled={!!busy} onClick={() => act({ action: "snooze" }, "snooze")}>⏰ 30분 뒤 알림</button>}
          </div>
        )}
      </section>
    </div>
  );
}
