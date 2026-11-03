"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, KIND_LABEL, LUNAR_YEARS, seedsFor, type SeasonEvent } from "@/lib/seasons";
import type { SeasonKeyword } from "@/lib/marketing";
import { AiPicker, api, useToast } from "@/components/client-utils";

type BlogLite = { id: string; name: string; color: string; category: string };
type Conn = { provider: string; connected: boolean };
type Stat = { keyword: string; pc: number; mobile: number; total: number; lt10: boolean; compIdx: string; collected_at: string };
const fmtCount = (s?: Stat | null) => (!s ? "-" : s.total === 0 && s.lt10 ? "10 미만" : s.total.toLocaleString() + (s.lt10 ? "+" : ""));

const dayDiff = (a: string, b: string) => Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const range = (e: SeasonEvent) => (e.start === e.end ? md(e.start) : `${md(e.start)} ~ ${md(e.end)}`);

function phase(e: SeasonEvent, today: string): { label: string; cls: string; order: number } {
  const prep = addDays(e.start, -e.leadDays);
  if (today > e.end) return { label: "지남", cls: "", order: 4 };
  if (today >= e.start) return { label: "진행 중", cls: "badge-ok", order: 1 };
  if (today >= prep) return { label: `준비할 때 · D-${dayDiff(e.start, today)}`, cls: "badge-warn", order: 0 };
  return { label: `준비 시작까지 ${dayDiff(prep, today)}일`, cls: "", order: 2 };
}

export default function MarketingCalendar({ blogs, today, connections, naverAd }: { blogs: BlogLite[]; today: string; connections: Conn[]; naverAd: boolean }) {
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [blogId, setBlogId] = useState(blogs[0]?.id ?? "");
  const [events, setEvents] = useState<SeasonEvent[]>([]);
  const [keywords, setKeywords] = useState<SeasonKeyword[]>([]);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const blog = blogs.find((b) => b.id === blogId) ?? null;

  const load = useCallback(async () => {
    const d = await api<{ events: SeasonEvent[]; keywords: SeasonKeyword[] }>(`/api/marketing?year=${year}&blogId=${blogId}`);
    setEvents(d.events);
    setKeywords(d.keywords);
  }, [year, blogId]);
  useEffect(() => void load(), [load]);

  // 지금 준비할 시즌: 준비 기간이거나 진행 중, 그다음 가까운 것
  const upcoming = useMemo(
    () =>
      events
        .map((e) => ({ e, p: phase(e, today) }))
        .filter((x) => x.p.order < 4)
        .sort((a, b) => a.p.order - b.p.order || (a.e.start < b.e.start ? -1 : 1))
        .slice(0, 6),
    [events, today],
  );
  useEffect(() => {
    if (!selKey && upcoming[0]) setSelKey(upcoming[0].e.key);
  }, [upcoming, selKey]);
  const sel = events.find((e) => e.key === selKey) ?? null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between">
        <div className="row">
          {blogs.map((b) => (
            <button key={b.id} className={`btn btn-sm ${blogId === b.id ? "btn-primary" : ""}`} onClick={() => setBlogId(b.id)}>
              <span className="blog-dot" style={{ background: b.color }} /> {b.name}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => { setYear(year - 1); setSelKey(null); }}>◀</button>
          <span className="strong">{year}년</span>
          <button className="btn btn-sm" onClick={() => { setYear(year + 1); setSelKey(null); }}>▶</button>
        </div>
      </div>
      {!LUNAR_YEARS.includes(year) && <div className="notice notice-warn small">{year}년은 설날·추석 날짜가 아직 입력되지 않았습니다 (현재 {LUNAR_YEARS.join("·")}년 지원). 필요하면 '직접 추가'로 넣으세요.</div>}

      {year === Number(today.slice(0, 4)) && (
        <section className="card">
          <div className="card-head"><h2>지금 준비할 시즌</h2><span className="tiny muted">오늘 {today}</span></div>
          <div className="list">
            {upcoming.map(({ e, p }) => (
              <button key={e.key} className="list-item" onClick={() => setSelKey(e.key)} style={{ border: 0, borderTop: "1px solid var(--line)", background: selKey === e.key ? "var(--accent-soft)" : "none", textAlign: "left", width: "100%", cursor: "pointer" }}>
                <span className={`badge ${p.cls}`}>{p.label}</span>
                <span className="strong small" style={{ flex: 1 }}>{e.name}</span>
                <span className="tiny muted">{range(e)} · 준비 D-{e.leadDays}</span>
              </button>
            ))}
            {!upcoming.length && <div className="empty small">남은 시즌이 없습니다.</div>}
          </div>
        </section>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* 연간 달력 */}
        <section className="card">
          <div className="card-head"><h2>{year}년 시즌 달력</h2></div>
          <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const mm = String(m).padStart(2, "0");
              const list = events.filter((e) => e.start.slice(5, 7) === mm);
              const cur = year === Number(today.slice(0, 4)) && today.slice(5, 7) === mm;
              return (
                <div key={m} className="card" style={{ padding: 8, minWidth: 0, borderColor: cur ? "var(--accent)" : undefined }}>
                  <div className="small strong" style={{ marginBottom: 4 }}>{m}월</div>
                  {list.map((e) => (
                    <button key={e.key} onClick={() => setSelKey(e.key)} className="cal-ev" style={{ width: "100%", textAlign: "left", cursor: "pointer", border: 0, borderLeft: `3px solid ${e.custom ? "var(--warn)" : e.kind === "commerce" ? "var(--bad)" : e.kind === "holiday" ? "var(--accent)" : "var(--ok)"}`, background: selKey === e.key ? "var(--accent-soft)" : "var(--panel-2)" }}>
                      {md(e.start)} {e.name}
                    </button>
                  ))}
                  {!list.length && <span className="tiny muted">-</span>}
                </div>
              );
            })}
          </div>
          <div className="card-pad row tiny muted" style={{ paddingTop: 0 }}>
            <span style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 4 }}>명절·기념일</span>
            <span style={{ borderLeft: "3px solid var(--bad)", paddingLeft: 4 }}>쇼핑</span>
            <span style={{ borderLeft: "3px solid var(--ok)", paddingLeft: 4 }}>계절·생활·학사</span>
            <span style={{ borderLeft: "3px solid var(--warn)", paddingLeft: 4 }}>직접 추가</span>
          </div>
        </section>

        {/* 선택한 이벤트 */}
        <div className="stack" style={{ gap: 16 }}>
          {sel && blog ? (
            <EventPanel key={sel.key + blogId + year} naverAd={naverAd} ev={sel} blog={blog} year={year} today={today} keywords={keywords.filter((k) => k.event_key === sel.key)} connections={connections} reload={load} toast={setToast} />
          ) : (
            <div className="card empty">달력에서 이벤트를 선택하세요.</div>
          )}
          <AddEvent blogs={blogs} year={year} onDone={() => { void load(); setToast("이벤트를 추가했습니다."); }} />
        </div>
      </div>
      {toast}
    </div>
  );
}

function EventPanel({ ev, blog, year, today, keywords, connections, reload, toast, naverAd }: { naverAd: boolean; ev: SeasonEvent; blog: BlogLite; year: number; today: string; keywords: SeasonKeyword[]; connections: Conn[]; reload: () => Promise<void>; toast: (s: string) => void }) {
  const seeds = seedsFor(ev, blog.category);
  const [pickSeeds, setPickSeeds] = useState<string[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = phase(ev, today);
  const anyAi = connections.some((c) => c.connected);
  const prep = addDays(ev.start, -ev.leadDays);
  const [stats, setStats] = useState<Record<string, Stat | null>>({});
  const [statBusy, setStatBusy] = useState(false);
  const allKw = Array.from(new Set([...seeds, ...keywords.map((k) => k.keyword)]));
  // 저장된 검색량(최근 조회값)만 먼저 불러오기 — API 호출 없음
  useEffect(() => {
    if (!allKw.length) return;
    api<{ stats: Record<string, Stat> }>("/api/research/keywords", "POST", { keywords: allKw, cacheOnly: true }).then((r) => setStats((s) => ({ ...s, ...r.stats }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKw.join("|")]);
  async function fetchStats() {
    setStatBusy(true);
    setErr("");
    try {
      const r = await api<{ stats: Record<string, Stat | null> }>("/api/research/keywords", "POST", { keywords: allKw });
      setStats((s) => ({ ...s, ...r.stats }));
      toast("네이버 검색광고 검색량을 불러왔습니다.");
    } catch (e) {
      setErr((e as Error).message);
    }
    setStatBusy(false);
  }

  async function post(payload: Record<string, unknown>, msg: (r: Record<string, number>) => string) {
    setBusy(true);
    setErr("");
    try {
      const r = await api<Record<string, number>>("/api/marketing/keywords", "POST", { blogId: blog.id, year, eventKey: ev.key, ...payload });
      toast(msg(r));
      setPick([]);
      setPickSeeds([]);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <div>
          <h2>{ev.name}</h2>
          <div className="tiny muted">{ev.start}{ev.end !== ev.start && ` ~ ${ev.end}`} · {KIND_LABEL[ev.kind]} · 준비 시작 권장 {prep} (D-{ev.leadDays})</div>
        </div>
        <span className={`badge ${p.cls}`}>{p.label}</span>
      </div>
      <div className="card-pad stack">
        {ev.tentative && <div className="notice notice-warn small">⚠ {ev.tentative}</div>}
        {ev.note && <p className="small">{ev.note}</p>}

        <div>
          <div className="row between">
            <div className="label" style={{ margin: 0 }}>출발 키워드 · {blog.name} 분야 기준</div>
            {naverAd ? (
              <button className="btn btn-sm" disabled={statBusy || !allKw.length} onClick={fetchStats}>{statBusy ? <span className="spinner" /> : "월간 검색량 조회"}</button>
            ) : (
              <span className="tiny muted">검색량: 네이버 검색광고 연결 시 표시</span>
            )}
          </div>
          <div className="row">
            {seeds.map((s) => (
              <button key={s} className={`btn btn-sm ${pickSeeds.includes(s) ? "btn-primary" : ""}`} onClick={() => toggle(pickSeeds, s, setPickSeeds)}>
                {s}{s in stats && <span className="tiny" style={{ marginLeft: 4, opacity: 0.75 }}>{fmtCount(stats[s])}</span>}
              </button>
            ))}
            {!seeds.length && <span className="small muted">이 분야용 출발 키워드가 없습니다. AI 도출을 이용하세요.</span>}
          </div>
          {!!pickSeeds.length && (
            <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => post({ action: "to-ideas", seeds: pickSeeds }, (r) => `${r.created}개를 글감 보관함에 보냈습니다.`)}>
              선택한 {pickSeeds.length}개 글감으로 보내기
            </button>
          )}
        </div>

        <div className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 8 }}>
          <span className="label" style={{ margin: 0 }}>AI 시즌 키워드 도출</span>
          {!anyAi && <span className="small" style={{ color: "var(--warn)" }}>AI가 연결되지 않아 사용할 수 없습니다.</span>}
          <input className="input" placeholder="추가 방향 (예: 초보자용, 1~2만원대 선물, 아이 3~5세)" value={hint} onChange={(e) => setHint(e.target.value)} />
          <div className="row">
            <AiPicker value={ai} onChange={setAi} connections={connections} />
            <button className="btn btn-primary" disabled={busy || !anyAi} onClick={() => post({ action: "derive", hint, ...(ai ?? {}) }, (r) => `키워드 ${r.added}개를 도출했습니다.`)}>
              {busy ? <span className="spinner" /> : keywords.some((k) => k.source === "ai") ? "더 도출하기" : "키워드 도출"}
            </button>
          </div>
          <span className="tiny muted">블로그 분야·문체와 출발 키워드를 바탕으로 롱테일 키워드, 검색 의도, 글 방향, 발행 시점을 제안합니다. 검색량은 '월간 검색량 조회'로 네이버 실제 데이터를 붙입니다.</span>
        </div>
        {err && <div className="notice notice-bad small">{err}</div>}

        {!!keywords.length && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>도출된 키워드 ({keywords.length})</span>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={() => setPick(pick.length ? [] : keywords.filter((k) => !k.idea_id).map((k) => k.id))}>{pick.length ? "선택 해제" : "모두 선택"}</button>
                <button className="btn btn-sm btn-primary" disabled={busy || !pick.length} onClick={() => post({ action: "to-ideas", ids: pick }, (r) => `${r.created}개를 글감 보관함에 보냈습니다.`)}>글감으로 보내기</button>
                <button className="btn btn-sm btn-danger" disabled={busy || !pick.length} onClick={() => post({ action: "delete", ids: pick }, () => "삭제했습니다.")}>삭제</button>
              </div>
            </div>
            <div className="list card">
              {keywords.map((k) => (
                <label key={k.id} className="list-item" style={{ alignItems: "flex-start", cursor: k.idea_id ? "default" : "pointer" }}>
                  <input type="checkbox" disabled={!!k.idea_id} checked={pick.includes(k.id)} onChange={() => toggle(pick, k.id, setPick)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row">
                      <span className="strong small">{k.keyword}</span>
                      {k.intent && <span className="badge">{k.intent}</span>}
                      {k.keyword in stats && <span className="badge badge-accent" title={stats[k.keyword] ? `PC ${stats[k.keyword]!.pc} · 모바일 ${stats[k.keyword]!.mobile} · 경쟁 ${stats[k.keyword]!.compIdx} · 조회 ${stats[k.keyword]!.collected_at.slice(0, 10)}` : "네이버에 검색 데이터 없음"}>월 {fmtCount(stats[k.keyword])}</span>}
                      {k.source === "seed" && <span className="badge">출발 키워드</span>}
                      {k.idea_id && <span className="badge badge-ok">글감 보관함에 있음</span>}
                    </div>
                    {k.angle && <div className="small muted">{k.angle}</div>}
                    {k.timing && <div className="tiny muted">발행: {k.timing}</div>}
                  </div>
                </label>
              ))}
            </div>
            <Link href="/research" className="small" style={{ color: "var(--accent)" }}>글감 보관함(연구소)에서 주제 승인하기 →</Link>
          </div>
        )}
        {ev.custom && ev.customId && (
          <button className="btn btn-sm btn-ghost btn-danger" style={{ alignSelf: "flex-end" }} onClick={async () => { if (!confirm("이 이벤트를 삭제할까요?")) return; await api(`/api/marketing/events/${ev.customId}`, "DELETE"); await reload(); }}>
            이벤트 삭제
          </button>
        )}
      </div>
    </section>
  );
}

function AddEvent({ blogs, year, onDone }: { blogs: BlogLite[]; year: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", start: `${year}-`, end: "", leadDays: 21, blogId: "", keywords: "", note: "" });
  const [err, setErr] = useState("");
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>+ 이벤트 직접 추가 (브랜드 세일, 지역 축제, 블로그 기념일 등)</button>;
  return (
    <section className="card card-pad stack">
      <h3 style={{ fontSize: 15 }}>이벤트 직접 추가</h3>
      <input className="input" placeholder="이벤트 이름 *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="row">
        <label className="small">시작 <input type="date" className="input" style={{ width: 160 }} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label className="small">종료 <input type="date" className="input" style={{ width: 160 }} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label className="small">준비 시작 D- <input type="number" min={0} max={180} className="input" style={{ width: 80 }} value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: Number(e.target.value) })} /></label>
      </div>
      <select className="select" value={f.blogId} onChange={(e) => setF({ ...f, blogId: e.target.value })}>
        <option value="">모든 블로그</option>
        {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}만</option>)}
      </select>
      <input className="input" placeholder="출발 키워드 (쉼표 구분)" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
      <input className="input" placeholder="메모 (선택)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      {err && <div className="notice notice-bad small">{err}</div>}
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={async () => {
            setErr("");
            try {
              await api("/api/marketing/events", "POST", { ...f, end: f.end || f.start, keywords: f.keywords.split(",") });
              setOpen(false);
              setF({ name: "", start: `${year}-`, end: "", leadDays: 21, blogId: "", keywords: "", note: "" });
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          추가
        </button>
        <button className="btn" onClick={() => setOpen(false)}>취소</button>
      </div>
    </section>
  );
}
