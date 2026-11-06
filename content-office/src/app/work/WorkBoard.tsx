"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/client-utils";
import { fmtDate, Steps } from "@/components/ui";
import PostedButton from "@/components/PostedButton";
import type { WorkCol, WorkItem, WorkType } from "@/lib/work";

type Props = { items: WorkItem[]; cols: { id: WorkCol; label: string }[]; types: Record<WorkType, { label: string; icon: string }>; blogs: { id: string; name: string }[] };

const COL_HINT: Record<WorkCol, string> = {
  plan: "제목·기획을 고르는 단계",
  make: "AI가 만들거나 내가 만드는 중",
  review: "검수·확인·손볼 곳",
  ready: "올리기만 하면 돼요",
  done: "최근 30일 안에 올린 것",
};

function Badge({ it }: { it: WorkItem }) {
  const tone = it.error ? "badge-bad" : it.col === "done" ? "badge-ok" : it.col === "ready" ? "badge-accent" : it.stuck ? "badge-warn" : "";
  return (
    <span className={`badge ${tone}`}>
      {it.running && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />}
      {it.badge}
    </span>
  );
}

/** 상세 한 줄: 지금 진행 현황처럼 단계 막대까지 */
function Detail({ it, types }: { it: WorkItem; types: Props["types"] }) {
  return (
    <div className="stack" style={{ gap: 8, minWidth: 0 }}>
      <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={it.href} className="strong ellipsis" style={{ display: "block" }}>{types[it.type].icon} {it.title}</Link>
          <div className="row tiny muted" style={{ gap: 6 }}>
            {it.color && <span className="blog-dot" style={{ background: it.color }} />}
            <span>{types[it.type].label} · {it.sub}</span>
            <span>· {fmtDate(it.updated_at)}</span>
            {it.due && <span>· 📅 {it.due}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 4, flexShrink: 0, justifyContent: "flex-end" }}>
          {it.stuck && !it.error && <span className="badge badge-warn" title="3일 넘게 그대로예요">⏸ 멈춤</span>}
          <Badge it={it} />
        </div>
      </div>
      {it.note && <div className="tiny" style={{ color: it.error ? "var(--bad)" : "var(--muted)" }}>{it.note}</div>}
      <Steps names={it.steps} current={it.current} error={it.error} />
      {it.type !== "blog" && (it.col === "ready" || it.col === "done") && (
        <div className="row" style={{ gap: 6 }}>
          <PostedButton type={it.type} id={it.id} postedAt={it.postedAt} />
        </div>
      )}
    </div>
  );
}

export default function WorkBoard({ items, cols, types, blogs }: Props) {
  const [type, setType] = useState<WorkType | "all">("all");
  const [blog, setBlog] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [open, setOpen] = useState<WorkItem | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("work-view");
      if (v === "list" || v === "board") setView(v);
    } catch {}
  }, []);
  const pickView = (v: "board" | "list") => {
    setView(v);
    try { localStorage.setItem("work-view", v); } catch {}
  };

  const shown = useMemo(() => items.filter((i) => (type === "all" || i.type === type) && (!blog || i.blogId === blog)), [items, type, blog]);
  const byCol = (c: WorkCol) => shown.filter((i) => i.col === c);
  const weekAgo = Date.now() - 7 * 86400_000;
  const sum = {
    week: shown.filter((i) => i.col === "done" && new Date(i.updated_at).getTime() >= weekAgo).length,
    doing: shown.filter((i) => i.col !== "done").length,
    ready: byCol("ready").length,
    stuck: shown.filter((i) => i.stuck).length,
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="work-sum">
        <div className="card card-pad"><div className="tiny muted">이번 주 완료</div><b>{sum.week}</b></div>
        <div className="card card-pad"><div className="tiny muted">진행 중</div><b>{sum.doing}</b></div>
        <div className="card card-pad"><div className="tiny muted">발행 대기</div><b>{sum.ready}</b></div>
        <div className="card card-pad" style={sum.stuck ? { borderColor: "var(--bad)" } : undefined}><div className="tiny muted">⚠️ 막힌 것</div><b style={sum.stuck ? { color: "var(--bad)" } : undefined}>{sum.stuck}</b></div>
      </div>

      <div className="row between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          {(["all", "blog", "carousel", "studio", "video"] as const).map((t) => (
            <button key={t} className={`btn btn-sm ${type === t ? "btn-primary" : ""}`} onClick={() => setType(t)} aria-pressed={type === t}>
              {t === "all" ? "전체" : `${types[t].icon} ${types[t].label}`}
            </button>
          ))}
          <select className="input" style={{ width: 170 }} value={blog} onChange={(e) => setBlog(e.target.value)} aria-label="블로그">
            <option value="">모든 블로그</option>
            {blogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn btn-sm ${view === "board" ? "btn-primary" : ""}`} onClick={() => pickView("board")}>칸반</button>
          <button className={`btn btn-sm ${view === "list" ? "btn-primary" : ""}`} onClick={() => pickView("list")}>목록</button>
        </div>
      </div>

      {view === "board" && (
        <div className="kanban" aria-label="칸반 보드">
          {cols.map((c) => (
            <section key={c.id} className="kanban-col">
              <div className="kanban-head">
                <b className="small">{c.label}</b> <span className="badge">{byCol(c.id).length}</span>
                <div className="tiny muted">{COL_HINT[c.id]}</div>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {byCol(c.id).map((it) => (
                  <button key={it.key} className={`kanban-card${it.stuck ? " stuck" : ""}${it.error ? " err" : ""}`} onClick={() => setOpen(it)}>
                    <span className="small strong kanban-title">{types[it.type].icon} {it.title}</span>
                    <span className="row tiny muted" style={{ gap: 4 }}>
                      {it.color && <span className="blog-dot" style={{ background: it.color }} />}
                      <span className="ellipsis">{it.sub}</span>
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <Badge it={it} />
                      {it.due && <span className="tiny muted">📅 {it.due.slice(5)}</span>}
                    </span>
                  </button>
                ))}
                {!byCol(c.id).length && <div className="tiny muted" style={{ padding: 8 }}>없음</div>}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 아래: 지금 진행 현황처럼 단계 막대가 있는 상세 목록 */}
      {cols.map((c) => {
        const list = byCol(c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="card">
            <div className="card-head"><h2 style={{ fontSize: 15 }}>{c.label} ({list.length}) <span className="tiny muted">· {COL_HINT[c.id]}</span></h2></div>
            <div className="list">
              {list.map((it) => (
                <div key={it.key} className="list-item" style={{ display: "block", background: it.stuck ? "var(--bad-soft)" : undefined }}>
                  <Detail it={it} types={types} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!shown.length && <div className="card empty">아직 진행 중인 작업이 없어요. 블로그 업로드·캐러셀·영상 스튜디오에서 새로 시작해 보세요.</div>}

      {open && (
        <Modal title={`${types[open.type].icon} ${open.title}`} onClose={() => setOpen(null)}>
          <div className="stack" style={{ gap: 12 }}>
            <Detail it={open} types={types} />
            <Link className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} href={open.href}>열기 →</Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
