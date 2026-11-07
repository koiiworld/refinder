"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";
import type { Diagnosis, DiagnoseState } from "@/lib/diagnose";

const ICON = { ok: "✅", warn: "⚠️", bad: "❌", skip: "➖" } as const;

/** 네이버 홈피드(홈판) 체크포인트 — 네이버 공식 기준이 아니라 운영자들 사이에서 공통으로 말하는 요소 */
const HOMEFEED = [
  ["대표 사진(썸네일)", "선명하고 밝은 실사 사진, 글자는 적게. 첫인상이 클릭률을 결정해요."],
  ["제목", "구체적인 이득 + 약간의 호기심 (예: '이렇게 하니 ○○이 안 터졌어요'). 과장 낚시는 바로 나가는 독자가 많아져 손해."],
  ["첫 화면", "완성 사진·핵심 답을 맨 위에. 스크롤과 체류시간이 늘어요."],
  ["주제 일관성", "한 블로그는 한 분야로. 분야가 섞이면 추천 대상이 흐려져요."],
  ["발행 리듬", "주 2~3회 이상 꾸준히. 오래 쉬면 다시 노출되는 데 시간이 걸려요."],
  ["초기 반응", "발행 직후 공감·댓글·이웃 방문. 이웃과 소통하는 블로그가 유리하다는 의견이 많아요."],
  ["AI 티 줄이기", "같은 문장 틀 반복·과한 요약체 피하기. 직접 찍은 사진·구체적 수치·상황 묘사를 넣기."],
  ["모바일 가독성", "짧은 문단, 소제목, 목록·표. 대부분 폰으로 봐요."],
] as const;

export default function DiagnoseView({ blogs, blogId, initial, initialState }: { blogs: { id: string; name: string; platform: string; url: string; color: string }[]; blogId: string; initial: Diagnosis | null; initialState: DiagnoseState }) {
  const [d, setD] = useState<Diagnosis | null>(initial);
  const [busy, setBusy] = useState(initialState?.status === "running");
  const [err, setErr] = useState(initialState?.status === "error" ? initialState.error ?? "" : "");
  // 점검표 한 줄만 다시 진단 (수치만 다시 잼, AI 안 씀 · 무료)
  const [rechecking, setRechecking] = useState<string | null>(null);
  async function recheck(label: string) {
    setRechecking(label);
    setErr("");
    try {
      const r = await api<{ check: Diagnosis["checks"][number]; at: string }>("/api/diagnose", "POST", { blogId, recheck: label });
      setD((cur) => (cur ? { ...cur, checks: cur.checks.map((c) => (c.label === label ? r.check : c)), rechecked: { ...((cur as Diagnosis & { rechecked?: Record<string, string> }).rechecked ?? {}), [label]: r.at } } as Diagnosis : cur));
    } catch (e) {
      setErr((e as Error).message);
    }
    setRechecking(null);
  }
  // 💡 점검표 줄별 고치는 법 · 📈 유입 전략 · 이번 주 할 일(문구 고치기·할 일로 보내기)
  const [openFix, setOpenFix] = useState<string | null>(null);
  const fixOf = (label: string) => d?.ai?.fixes?.find((f) => f.check === label) ?? d?.ai?.fixes?.find((f) => label.includes(f.check) || f.check.includes(label));
  const [growthSel, setGrowthSel] = useState<number[]>([]);
  const [next, setNext] = useState<string[]>(d?.ai?.next ?? []);
  const [nextSel, setNextSel] = useState<number[]>([]);
  useEffect(() => { setNext(d?.ai?.next ?? []); setNextSel([]); setGrowthSel([]); }, [d?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveNextList(list: string[] | React.FocusEvent = next) {
    const arr = Array.isArray(list) ? list : next;
    try {
      await api("/api/diagnose", "POST", { blogId, next: arr.filter((x) => x.trim()) });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const [send, setSend] = useState<string[] | null>(null);
  const openSend = (items: string[]) => setSend(items.filter(Boolean));
  const recheckedAt = (label: string) => (d as (Diagnosis & { rechecked?: Record<string, string> }) | null)?.rechecked?.[label];
  // 진행 중이면 3초마다 확인 (다른 화면에 갔다 와도 서버에서 계속 진행)
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      try {
        const x = await api<{ last: Diagnosis | null; state: DiagnoseState }>(`/api/diagnose?blogId=${blogId}`);
        if (x.state?.status === "running") return;
        if (x.state?.status === "error") setErr(x.state.error ?? "진단에 실패했어요.");
        else if (x.last) setD(x.last);
        setBusy(false);
      } catch {
        /* 다음에 다시 */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [busy, blogId]);
  const blog = blogs.find((b) => b.id === blogId)!;

  async function run() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/diagnose", "POST", { blogId });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }


  return (
    <div className="stack" style={{ gap: 16 }}>
      <nav className="trend-tabs" aria-label="블로그">
        {blogs.map((b) => (
          <Link key={b.id} href={`/diagnose?blog=${b.id}`} scroll={false} className={`trend-tab ${b.id === blogId ? "on" : ""}`}>
            <span className="dot" style={{ background: b.color }} /> {b.name}
          </Link>
        ))}
      </nav>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between">
          <div className="small">{d ? <>마지막 진단 {fmtDate(d.at)} · 최근 글 {d.posts}개 분석</> : "아직 진단한 적이 없어요."}</div>
          <button className="btn btn-primary" disabled={busy || !blog.url} onClick={run}>{busy ? <><span className="spinner" /> 진단 중… 다른 화면에 가도 계속돼요</> : d ? "🔄 전체 다시 진단하기" : "🩺 진단 시작"}</button>
        </div>
        {!blog.url && <div className="notice notice-warn small">블로그 설정에서 블로그 주소를 넣어야 진단할 수 있어요.</div>}
        {err && <div className="notice notice-bad small">{err}</div>}
      </section>

      {d && (
        <>
          {d.ai?.summary && (
            <section className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row between">
                <h2 style={{ fontSize: 15, margin: 0 }}>종합 진단</h2>
                {d.ai.score != null && <span className="badge badge-accent">점수 {d.ai.score}/100</span>}
              </div>
              <p className="small" style={{ margin: 0 }}>{d.ai.summary}</p>
              {!!d.ai.good?.length && <div className="small">👍 {d.ai.good.join(" · ")}</div>}
              <div className="tiny muted">{d.ai.provider}/{d.ai.model}</div>
            </section>
          )}

          {!!d.ai?.problems?.length && (
            <section className="card">
              <div className="card-head"><h2 style={{ fontSize: 15 }}>고칠 점 (중요한 순서)</h2></div>
              <div className="card-pad stack" style={{ gap: 10 }}>
                {d.ai.problems.map((p, i) => (
                  <div key={i} className="card card-pad stack" style={{ gap: 4, padding: 10 }}>
                    <b className="small">{i + 1}. {p.title}</b>
                    <div className="tiny muted">{p.why}</div>
                    <div className="small" style={{ color: "var(--ok)" }}>→ {p.fix}</div>
                    {!!p.steps?.length && <ol className="small" style={{ margin: "2px 0 0", paddingLeft: 20 }}>{p.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>}
                    {p.example && <Example text={p.example} />}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2 style={{ fontSize: 15 }}>점검표 (앱이 직접 잰 수치)</h2></div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="tbl">
                  <tbody>
                    {d.checks.map((c, i) => {
                      const fx = c.status === "warn" || c.status === "bad" ? fixOf(c.label) : undefined;
                      return (
                      <Fragment key={i}>
                      <tr>
                        <td style={{ width: 28 }}>{ICON[c.status]}</td>
                        <td className="small" style={{ whiteSpace: "nowrap" }}><b>{c.label}</b></td>
                        <td className="small">
                          {c.detail}
                          {recheckedAt(c.label) && <span className="tiny muted"> · {new Date(recheckedAt(c.label)!).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 다시 잼</span>}
                        </td>
                        <td style={{ width: 1, whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className="btn btn-sm btn-ghost" disabled={busy || !!rechecking} onClick={() => recheck(c.label)} title="이 항목만 수치를 다시 재요 (AI 안 씀 · 무료)">
                            {rechecking === c.label ? <><span className="spinner" /> 재는 중…</> : "🔄 다시 진단하기"}
                          </button>
                          {fx && <button className="btn btn-sm btn-ghost" onClick={() => setOpenFix(openFix === c.label ? null : c.label)} aria-expanded={openFix === c.label}>💡 고치는 법</button>}
                        </td>
                      </tr>
                      {fx && openFix === c.label && (
                        <tr>
                          <td />
                          <td colSpan={3}>
                            <div className="stack" style={{ gap: 4, padding: "4px 0 8px" }}>
                              <div className="small">{fx.how}</div>
                              {!!fx.steps?.length && <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{fx.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>}
                              {fx.examples?.map((ex, k) => <Example key={k} text={ex} />)}
                              <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => openSend([fx.how])}>📋 할 일로 보내기</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d.notes.map((n, i) => <div key={i} className="tiny muted" style={{ marginTop: 6 }}>{n}</div>)}
            </div>
          </section>

          {!!d.ai?.growth?.length && (
            <section className="card">
              <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ fontSize: 15 }}>📈 조회수·유입 늘리기 (이 블로그 맞춤)</h2>
                {growthSel.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => openSend(growthSel.map((k) => d.ai!.growth![k].title))}>선택한 {growthSel.length}개 할 일로 보내기</button>}
              </div>
              <div className="card-pad stack" style={{ gap: 10 }}>
                {d.ai.growth.map((g, i) => (
                  <div key={i} className="card card-pad stack" style={{ gap: 4, padding: 10 }}>
                    <label className="row" style={{ gap: 6, flexWrap: "nowrap", cursor: "pointer" }}>
                      <input type="checkbox" checked={growthSel.includes(i)} onChange={() => setGrowthSel((s0) => (s0.includes(i) ? s0.filter((x) => x !== i) : [...s0, i]))} aria-label={`${g.title} 선택`} />
                      <b className="small">{g.title}</b>
                    </label>
                    <div className="tiny muted">{g.why}</div>
                    {!!g.steps?.length && <ol className="small" style={{ margin: "2px 0 0", paddingLeft: 20 }}>{g.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>}
                    {g.example && <Example text={g.example} />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(!!d.ai?.titleTips?.length || !!d.ai?.next?.length) && (
            <div className="dash-2col">
              {!!d.ai?.titleTips?.length && (
                <section className="card">
                  <div className="card-head"><h2 style={{ fontSize: 15 }}>제목 개선 팁</h2></div>
                  <div className="card-pad stack" style={{ gap: 6 }}>{d.ai.titleTips.map((t, i) => <div key={i} className="small">• {t}</div>)}</div>
                </section>
              )}
              {!!d.ai?.next?.length && (
                <section className="card">
                  <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: 15 }}>이번 주 할 일</h2>
                    {nextSel.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => openSend(nextSel.map((k) => next[k]).filter((x) => x?.trim()))}>선택한 {nextSel.length}개 할 일로 보내기</button>}
                  </div>
                  <div className="card-pad stack" style={{ gap: 6 }}>
                    {next.map((t, i) => (
                      <div key={i} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <input type="checkbox" checked={nextSel.includes(i)} onChange={() => setNextSel((s0) => (s0.includes(i) ? s0.filter((x) => x !== i) : [...s0, i]))} aria-label={`할 일 ${i + 1} 선택`} />
                        <input className="input" style={{ fontSize: 13 }} value={t} onChange={(e) => setNext((n) => n.map((x, k) => (k === i ? e.target.value : x)))} onBlur={saveNextList} aria-label={`할 일 ${i + 1} 문구`} />
                        <button className="btn btn-sm btn-ghost" aria-label={`할 일 ${i + 1} 빼기`} onClick={() => { const n = next.filter((_, k) => k !== i); setNext(n); setNextSel([]); void saveNextList(n); }}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setNext((n) => [...n, ""])}>＋ 할 일 추가</button>
                    <span className="tiny muted">문구를 고치면 자동 저장돼요. 체크한 것을 할 일 목록으로 보낼 수 있어요.</span>
                  </div>
                </section>
              )}
            </div>
          )}

          {!!d.metrics.indexed?.length && (
            <section className="card">
              <div className="card-head"><h2 style={{ fontSize: 15 }}>제목 검색 노출 검사</h2></div>
              <div className="card-pad stack" style={{ gap: 4 }}>
                <p className="tiny muted" style={{ marginTop: 0 }}>최근 글 제목 그대로 네이버 블로그 검색을 해서 내 글이 상위 30위 안에 나오는지 본 결과예요. &apos;30위 밖&apos;은 검색 반영이 늦거나 같은 제목 경쟁이 심할 때도 생겨요. 실제 색인 상태는 이 검사로 알 수 없고, 네이버 서치어드바이저 같은 곳에서 따로 확인해야 해요.</p>
                {d.metrics.indexed.map((x, i) => (
                  <div key={i} className="small row" style={{ flexWrap: "nowrap", gap: 8 }}>
                    <span>{x.found ? "✅" : "❌"}</span>
                    <a href={x.url} target="_blank" rel="noreferrer" className="ellipsis" style={{ flex: 1 }}>{x.title}</a>
                    <span className="tiny muted">{x.found ? `${x.rank}위` : "30위 밖"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {send && <SendTodos items={send} blogs={blogs} blogId={blogId} onClose={() => setSend(null)} onDone={() => { setNextSel([]); setGrowthSel([]); }} />}

      {blog.platform === "naver" && (
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>네이버 홈판(홈피드) 체크포인트</h2></div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            <p className="tiny muted" style={{ margin: 0 }}>네이버는 홈피드 기준을 공개하지 않아요. 아래는 블로거들 사이에서 공통으로 이야기되는 요소예요.</p>
            {HOMEFEED.map(([t, desc]) => (
              <label key={t} className="small row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <input type="checkbox" style={{ marginTop: 3 }} />
                <span><b>{t}</b> — <span className="muted">{desc}</span></span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** "기존 → 개선" 예시 한 줄 (복사 버튼) */
function Example({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [a, b] = text.includes("→") ? text.split("→").map((x) => x.trim()) : ["", text];
  return (
    <div className="small row" style={{ gap: 6, flexWrap: "wrap", background: "var(--panel-2)", borderRadius: 8, padding: "6px 8px" }}>
      {a && <span className="muted" style={{ textDecoration: "line-through" }}>{a}</span>}
      {a && <span>→</span>}
      <b>{b}</b>
      <button className="btn btn-sm btn-ghost" onClick={async () => { await navigator.clipboard.writeText(b).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "복사됨" : "복사"}</button>
    </div>
  );
}

const TODO_CATS = [
  { id: "blog", label: "📝 블로그" },
  { id: "insta", label: "📱 인스타" },
  { id: "youtube", label: "🎬 유튜브" },
  { id: "personal", label: "🙋 개인일정" },
];
const kstDay = (off = 0) => new Date(Date.now() + 9 * 3600 * 1000 + off * 86400000).toISOString().slice(0, 10);

/** 📋 할 일로 보내기: 할 일 쓰듯 날짜·시간·업무·블로그·메모·알림을 정하고 보냄 */
function SendTodos({ items, blogs, blogId, onClose, onDone }: { items: string[]; blogs: { id: string; name: string }[]; blogId: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState(() => items.map((title, i) => ({ on: true, title, date: kstDay(i), time: "" })));
  const [cat, setCat] = useState("blog");
  const [blog, setBlog] = useState(blogId);
  const [memo, setMemo] = useState("🩺 블로그 진단에서 보낸 할 일");
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = rows.filter((r) => r.on && r.title.trim());
  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      for (const r of pick) {
        await api("/api/todos", "POST", { title: r.title.trim(), due_date: r.date, due_time: r.time || null, category: cat, blog_id: cat === "personal" ? null : blog || null, memo, notify: notify && !!r.time });
      }
      setMsg({ ok: true, text: `${pick.length}개를 할 일 목록에 넣었어요.` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="할 일로 보내기" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ fontSize: 16 }}>📋 할 일로 보내기</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal-body stack" style={{ gap: 10 }}>
          {rows.map((r, i) => (
            <div key={i} className="card card-pad stack" style={{ gap: 6, padding: 8 }}>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <input type="checkbox" checked={r.on} onChange={() => setRows((x) => x.map((y, k) => (k === i ? { ...y, on: !y.on } : y)))} aria-label={`${i + 1}번 보내기`} />
                <input className="input" value={r.title} onChange={(e) => setRows((x) => x.map((y, k) => (k === i ? { ...y, title: e.target.value } : y)))} aria-label={`${i + 1}번 할 일`} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="tiny muted">날짜</span>
                <input className="input" type="date" style={{ width: 150 }} value={r.date} onChange={(e) => setRows((x) => x.map((y, k) => (k === i ? { ...y, date: e.target.value } : y)))} aria-label={`${i + 1}번 날짜`} />
                <span className="tiny muted">시간</span>
                <input className="input" type="time" style={{ width: 120 }} value={r.time} onChange={(e) => setRows((x) => x.map((y, k) => (k === i ? { ...y, time: e.target.value } : y)))} aria-label={`${i + 1}번 시간`} />
              </div>
            </div>
          ))}
          <div className="row" style={{ gap: 6 }}>
            <span className="small">업무</span>
            <select className="input" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="업무 종류">
              {TODO_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {cat !== "personal" && (
              <>
                <span className="small">블로그</span>
                <select className="input" style={{ width: "auto" }} value={blog} onChange={(e) => setBlog(e.target.value)} aria-label="블로그">
                  {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </>
            )}
          </div>
          <textarea className="textarea" style={{ minHeight: 50, fontSize: 13 }} value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="메모" />
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> 🔔 시간을 정한 할 일은 그 시각에 텔레그램 알림</label>
          {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`}>{msg.text} {msg.ok && <Link href="/todos" style={{ color: "var(--accent)" }}>할 일 보기</Link>}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>{msg?.ok ? "닫기" : "취소"}</button>
          {!msg?.ok && <button className="btn btn-primary" disabled={busy || !pick.length} onClick={go}>{busy ? <span className="spinner" /> : `${pick.length}개 보내기`}</button>}
        </div>
      </div>
    </div>
  );
}
