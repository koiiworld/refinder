"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, Modal } from "@/components/client-utils";
import type { CalCat, CalEvent } from "@/lib/calendar";

const COLOR: Record<CalCat, string> = { season: "var(--series-1)", official: "var(--series-2)", irregular: "var(--bad)", publish: "var(--ok)", todo: "#8b5cf6" };
/** 연간 시즌 행사는 행사마다 다른 색 (같은 행사는 어느 달에서나 같은 색) */
const EVENT_PALETTE = ["#2563eb", "#0891b2", "#db2777", "#a16207", "#4f46e5", "#0d9488", "#9d174d", "#475569", "#0369a1", "#b45309"];
function evColor(e: CalEvent) {
  if (e.cat !== "season") return COLOR[e.cat];
  let h = 0;
  for (const ch of e.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EVENT_PALETTE[h % EVENT_PALETTE.length];
}
/** 명절은 기간 내내 글자로 표시 */
const isHoliday = (e: CalEvent) => /설날|설 연휴|추석|연휴|명절/.test(e.title);
/** 이 날 칸에 글자로 쓸지(시작·끝·하루짜리), 점만 찍을지 */
function markOf(e: CalEvent, d: string): { text: string } | null {
  if (e.start === e.end || isHoliday(e)) return { text: e.title };
  if (d === e.start) return { text: `${e.title} 시작` };
  if (d === e.end) return { text: `${e.title} 끝` };
  return null;
}
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarView({ ym, today, events, labels, blogs }: { ym: string; today: string; events: CalEvent[]; labels: Record<CalCat, string>; blogs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [show, setShow] = useState<Record<CalCat, boolean>>({ season: true, official: true, irregular: true, publish: true, todo: true });
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [blogId, setBlogId] = useState("");
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ title: "", start: `${ym}-01`, end: "", kind: "irregular", link: "" });
  const [err, setErr] = useState("");

  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => {
    const d = i - first + 1;
    return d >= 1 && d <= days ? `${ym}-${String(d).padStart(2, "0")}` : null;
  });
  const shown = events.filter((e) => show[e.cat]);
  const on = (d: string) => shown.filter((e) => e.start <= d && e.end >= d);
  const list = useMemo(() => (day ? on(day) : shown), [day, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 아이디어로 저장 → 아이디어 노트에서 바로 열기 */
  async function saveIdea(ev: CalEvent, seed?: string) {
    setBusy(seed ?? "all");
    try {
      const memo = seed ? `${ev.title} → ${seed} 글감` : `${ev.title} (${md(ev.start)}${ev.end !== ev.start ? `~${md(ev.end)}` : ""}) 글감`;
      const r = await api<{ id: string }>("/api/ideas", "POST", { memo, blog_id: blogId || null, link: ev.link, source: `calendar:${ev.id}` });
      router.push(`/ideas?open=${r.id}`);
    } catch (e) {
      alert((e as Error).message);
      setBusy("");
    }
  }
  async function addEvent() {
    setErr("");
    try {
      await api("/api/calendar", "POST", { ...nf, end: nf.end || nf.start });
      setAdding(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <Link href={`/calendar?m=${shiftMonth(ym, -1)}`} scroll={false} className="btn btn-sm" aria-label="이전 달">◀</Link>
          <b style={{ fontSize: 18, minWidth: 110, textAlign: "center" }}>{y}년 {m}월</b>
          <Link href={`/calendar?m=${shiftMonth(ym, 1)}`} scroll={false} className="btn btn-sm" aria-label="다음 달">▶</Link>
          {ym !== today.slice(0, 7) && <Link href="/calendar" scroll={false} className="btn btn-sm btn-ghost">오늘</Link>}
        </div>
        <button className="btn btn-sm" onClick={() => setAdding(!adding)}>{adding ? "닫기" : "+ 행사 직접 추가"}</button>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {(Object.keys(labels) as CalCat[]).map((c) => (
          <button key={c} className={`btn btn-sm ${show[c] ? "" : "btn-ghost"}`} style={{ opacity: show[c] ? 1 : 0.5 }} onClick={() => setShow({ ...show, [c]: !show[c] })} aria-pressed={show[c]}>
            <span className="dot" style={{ background: c === "season" ? `conic-gradient(${EVENT_PALETTE.slice(0, 4).join(",")})` : COLOR[c] }} /> {labels[c]}
          </button>
        ))}
      </div>

      {adding && (
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <b className="small">행사 직접 추가 (비정기 행사·공식 박람회 등)</b>
          <input className="input" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder="행사 이름 (예: 서울 리빙페어, 팝업스토어 오픈)" aria-label="행사 이름" />
          <div className="todo-fields">
            <label className="small stack" style={{ gap: 2 }}>시작<input className="input" type="date" value={nf.start} onChange={(e) => setNf({ ...nf, start: e.target.value })} /></label>
            <label className="small stack" style={{ gap: 2 }}>끝 (선택)<input className="input" type="date" value={nf.end} onChange={(e) => setNf({ ...nf, end: e.target.value })} /></label>
            <label className="small stack" style={{ gap: 2 }}>종류
              <select className="input" value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value })}>
                <option value="irregular">비정기 행사</option>
                <option value="official">공식 일정 확인된 행사</option>
              </select>
            </label>
            <label className="small stack" style={{ gap: 2 }}>참고 링크<input className="input" value={nf.link} onChange={(e) => setNf({ ...nf, link: e.target.value })} placeholder="https://" inputMode="url" /></label>
          </div>
          {err && <div className="notice notice-bad small">{err}</div>}
          <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!nf.title.trim()} onClick={addEvent}>추가</button>
        </section>
      )}

      <section className="card cal-grid" aria-label={`${y}년 ${m}월 달력`}>
        {WEEK.map((w, i) => <div key={w} className="cal-head" style={{ color: i === 0 ? "var(--bad)" : i === 6 ? "var(--series-2)" : undefined }}>{w}</div>)}
        {cells.map((d, i) =>
          d ? (
            <button key={d} className={`cal-cell ${d === today ? "today" : ""} ${d === day ? "sel" : ""}`} onClick={() => setDay(d === day ? null : d)} aria-label={`${md(d)} 일정 ${on(d).length}개`}>
              <span className="cal-num" style={{ color: i % 7 === 0 || on(d).some((e) => e.cat === "official" && /공휴|날|절|설날|추석|크리스마스/.test(e.title)) ? "var(--bad)" : undefined }}>{Number(d.slice(8))}</span>
              {(() => {
                const evs = on(d);
                const named = evs.filter((e) => markOf(e, d));
                const dots = evs.filter((e) => !markOf(e, d));
                return (
                  <span className="cal-marks">
                    {!!dots.length && (
                      <span className="cal-dots">
                        {dots.map((e) => <span key={e.id} className="cal-dot" style={{ background: evColor(e) }} title={e.title} />)}
                      </span>
                    )}
                    {named.slice(0, 3).map((e) => <span key={e.id} className="cal-mark" style={{ background: evColor(e), opacity: e.done ? 0.45 : 1, textDecoration: e.done ? "line-through" : undefined }}>{markOf(e, d)!.text}</span>)}
                    {named.length > 3 && <span className="tiny muted">+{named.length - 3}</span>}
                  </span>
                );
              })()}
            </button>
          ) : (
            <div key={i} className="cal-cell empty" />
          ),
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 style={{ fontSize: 15 }}>{day ? `${md(day)} 일정` : `${m}월 일정`} ({list.length})</h2>
          {day && <button className="btn btn-sm btn-ghost" onClick={() => setDay(null)}>달 전체 보기</button>}
        </div>
        <div className="list">
          {!list.length && <div className="list-item small muted">일정이 없어요.</div>}
          {list.map((e) => (
            <button key={e.id} className="list-item" style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer", gap: 10, flexWrap: "nowrap" }} onClick={() => setOpen(e)}>
              <span className="dot" style={{ background: evColor(e), flexShrink: 0 }} />
              <span className="small" style={{ flexShrink: 0, width: 78 }}>{md(e.start)}{e.end !== e.start ? `~${md(e.end)}` : ""}</span>
              <span className="small ellipsis" style={{ flex: 1 }}><b>{e.title}</b> <span className="tiny muted">· {labels[e.cat]}{e.sub ? ` · ${e.sub}` : ""}</span></span>
            </button>
          ))}
        </div>
      </section>

      {open && (
        <Modal title={open.title} onClose={() => { setOpen(null); setBusy(""); }}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="small"><span className="dot" style={{ background: evColor(open) }} /> {labels[open.cat]}{open.sub ? ` · ${open.sub}` : ""}</div>
            <div className="small"><b>날짜</b> · {open.start}{open.end !== open.start ? ` ~ ${open.end}` : ""}</div>
            {open.note && <div className="tiny muted">{open.note}</div>}
            {open.link && <a className="small" href={open.link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>🔗 참고 링크 열기</a>}
            {open.todoId ? (
              <Link className="btn btn-sm" href={`/todos?tab=${open.done ? "done" : open.start > today ? "upcoming" : "today"}`}>✅ 할 일에서 보기·고치기</Link>
            ) : open.postId ? (
              <Link className="btn btn-sm" href={`/posts/${open.postId}`}>📄 글 열기</Link>
            ) : (
              <>
                <label className="small row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  어느 블로그 글감?
                  <select className="input" style={{ maxWidth: 220 }} value={blogId} onChange={(e) => setBlogId(e.target.value)} aria-label="블로그">
                    <option value="">정하지 않음</option>
                    {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                {!!open.seeds.length && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="tiny muted">이 시즌 글감 (누르면 그 글감으로 아이디어 저장)</span>
                    <div className="row" style={{ gap: 6 }}>
                      {open.seeds.map((s) => (
                        <button key={s} className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => saveIdea(open, s)}>{busy === s ? <span className="spinner" /> : `💡 ${s}`}</button>
                      ))}
                    </div>
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={() => saveIdea(open)}>{busy === "all" ? <span className="spinner" /> : "💡 아이디어로 저장"}</button>
              </>
            )}
            {open.custom && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={async () => { if (confirm("이 행사를 지울까요?")) { await api("/api/calendar", "POST", { remove: open.id.replace(/^custom:/, "") }); setOpen(null); router.refresh(); } }}>🗑 이 행사 지우기</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
