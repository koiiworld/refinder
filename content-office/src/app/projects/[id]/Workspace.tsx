"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProjectBundle } from "@/lib/bundle";
import type { Plan, ReviewResult, Version } from "@/lib/types";
import { stageDef } from "@/lib/stages";
import { BlogTag, fmtDate, fmtUsd, Pipeline, StageBadge } from "@/components/ui";
import { AiPicker, api, Diff, htmlToText, Modal, useToast } from "@/components/client-utils";
import DocEditor from "@/components/DocEditor";
import PlanEditor from "@/components/PlanEditor";

type Tab = "flow" | "plan" | "editor" | "review" | "versions" | "sources" | "history" | "export";

function defaultTab(stage: string): Tab {
  if (stage === "plan_approval") return "plan";
  if (["draft_approval", "images", "image_approval"].includes(stage)) return "editor";
  if (["carousel", "final_approval", "done"].includes(stage)) return "export";
  return "flow";
}

export default function Workspace({ initial }: { initial: ProjectBundle }) {
  const router = useRouter();
  const [b, setB] = useState<ProjectBundle>(initial);
  const [tab, setTab] = useState<Tab>(defaultTab(initial.project.stage));
  const [toast, setToast] = useToast();
  const p = b.project;
  const running = p.status === "running" || b.jobs.length > 0;

  const refresh = useCallback(async () => {
    try {
      setB(await api<ProjectBundle>(`/api/projects/${p.id}`));
    } catch {
      /* 네트워크 오류 시 다음 폴링에서 재시도 */
    }
  }, [p.id]);

  // AI 작업 중에는 2초마다 상태 갱신
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [running, refresh]);

  // 단계가 바뀌면 적절한 탭으로 이동
  const [lastStage, setLastStage] = useState(p.stage);
  useEffect(() => {
    if (p.stage !== lastStage) {
      setLastStage(p.stage);
      setTab(defaultTab(p.stage));
      router.refresh();
    }
  }, [p.stage, lastStage, router]);

  async function act(payload: Record<string, unknown>, msg?: string) {
    try {
      setB(await api<ProjectBundle>(`/api/projects/${p.id}/actions`, "POST", payload));
      if (msg) setToast(msg);
      router.refresh();
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  }

  const doc = b.document;
  const pending = doc?.pending_proposal_id;
  const tabs: [Tab, string][] = [
    ["flow", "진행·승인"],
    ["plan", "기획안"],
    ["editor", "원고 편집"],
    ["review", `AI 검수${b.reviews.length ? ` (${b.reviews.length})` : ""}`],
    ["versions", "버전"],
    ["sources", `출처 (${p.sources.length})`],
    ["history", "기록"],
    ["export", "발행 패키지"],
  ];

  return (
    <div className="page">
      <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
        <div className="row small muted">
          <Link href="/projects">프로젝트</Link> /
          {b.blog && <BlogTag name={b.blog.name} color={b.blog.color} />}
        </div>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <h1 style={{ fontSize: 20, flex: "1 1 300px" }} className="wrap-any">{doc?.title || p.plan?.selectedTitle || p.title}</h1>
          <div className="row">
            {p.needs_rereview && <span className="badge badge-bad">승인 후 변경됨 · 재검수 필요</span>}
            <StageBadge stage={p.stage} status={p.status} />
          </div>
        </div>
        <Pipeline stage={p.stage} status={p.status} />
      </div>

      <StagePanel b={b} act={act} goTab={setTab} />

      {pending && (
        <ProposalBanner projectId={p.id} proposalId={pending} currentHtml={doc?.content_html ?? ""} act={act} />
      )}

      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "flow" && <FlowTab b={b} />}
      {tab === "plan" &&
        (p.plan ? (
          <PlanEditor
            plan={p.plan}
            readOnly={running || p.stage === "done"}
            onSave={async (plan: Plan) => {
              setB(await api<ProjectBundle>(`/api/projects/${p.id}/plan`, "PUT", { plan }));
              setToast("기획안을 새 버전으로 저장했습니다.");
            }}
          />
        ) : (
          <div className="card empty">아직 기획안이 없습니다. 주제를 승인하면 기획 담당 AI가 작성합니다.</div>
        ))}
      {tab === "editor" &&
        (doc || p.plan ? (
          <DocEditor
            key={p.id}
            projectId={p.id}
            serverDoc={doc}
            locked={running || p.stage === "done"}
            lockedReason={p.stage === "done" ? "최종 승인된 원고입니다. 수정하려면 최종 승인 전 단계에서 작업하세요." : "AI 작업 중에는 편집이 잠깁니다. 완료되면 자동으로 풀립니다."}
            connections={b.connections}
            onSaved={({ needsRereview }) => {
              if (needsRereview !== p.needs_rereview) void refresh();
              else if (!needsRereview) void refresh();
            }}
          />
        ) : (
          <div className="card empty">기획안 승인 후 원고가 작성됩니다.</div>
        ))}
      {tab === "review" && <ReviewTab b={b} act={act} />}
      {tab === "versions" && <VersionsTab b={b} act={act} />}
      {tab === "sources" && <SourcesTab b={b} setB={setB} toast={setToast} />}
      {tab === "history" && <HistoryTab b={b} />}
      {tab === "export" && <ExportTab b={b} />}

      <div className="row" style={{ marginTop: 32, justifyContent: "flex-end" }}>
        <button
          className="btn btn-sm btn-danger"
          onClick={async () => {
            if (!confirm("이 프로젝트와 모든 버전·기록을 삭제할까요? 삭제 전에 '발행 패키지' 탭에서 JSON으로 내보낼 수 있습니다.")) return;
            await api(`/api/projects/${p.id}`, "DELETE");
            router.push("/projects");
            router.refresh();
          }}
        >
          프로젝트 삭제
        </button>
      </div>
      {toast}
    </div>
  );
}

// ───────────────────────── 단계 패널 (승인·수정 요청·재실행) ─────────────────────────

function StagePanel({ b, act, goTab }: { b: ProjectBundle; act: (p: Record<string, unknown>, msg?: string) => Promise<boolean>; goTab: (t: Tab) => void }) {
  const p = b.project;
  const def = stageDef(p.stage);
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<null | "changes" | "reject" | "rerun">(null);
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const job = b.jobs[0];

  const run = async (payload: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const ok = await act({ ...payload, ...(ai ?? {}) }, msg);
    setBusy(false);
    if (ok) {
      setMode(null);
      setComment("");
      setAi(null);
    }
  };

  const rerunStep = (() => {
    if (["planning", "plan_approval", "topic_approval"].includes(p.stage)) return p.stage === "topic_approval" ? null : "plan";
    if (["drafting"].includes(p.stage)) return "draft";
    if (["reviewing", "draft_approval"].includes(p.stage)) return "review";
    if (p.stage === "packaging") return "package";
    return null;
  })();

  const directEdit: Record<string, Tab> = { plan_approval: "plan", draft_approval: "editor", image_approval: "editor", images: "editor", final_approval: "export" };

  return (
    <section className="card" aria-label="현재 단계">
      <div className="card-pad stack">
        <div className="row between">
          <div>
            <div className="small muted">현재 단계</div>
            <div className="strong" style={{ fontSize: 16 }}>
              {def.label} {def.phase === 2 && <span className="badge">2차 기능 · 현재 수동</span>}
            </div>
          </div>
          {running(p, b) && (
            <span className="row small" style={{ color: "var(--accent)" }}>
              <span className="spinner" /> {job ? `${jobName(job.type)} ${job.status === "queued" ? "대기 중" : "실행 중"} (시도 ${job.attempts}/${job.max_attempts})` : "처리 중"}
            </span>
          )}
        </div>
        <p className="small muted">{def.help}</p>
        {p.status_message && (
          <div className={`notice small ${p.status === "error" ? "notice-bad" : "notice-warn"}`}>{p.status_message}</div>
        )}
        {p.needs_rereview && p.stage !== "draft_approval" && (
          <div className="notice notice-warn small">원고 승인 이후 본문이 수정되었습니다. 'AI 검수' 탭에서 재검수하거나, 최종 승인 시 변경 내용을 확인했다고 표시하세요.</div>
        )}

        {/* 실행 중 */}
        {running(p, b) && (
          <div className="row">
            <button className="btn btn-sm" onClick={() => act({ action: "cancel_jobs" }, "대기 중인 작업을 취소했습니다.")}>대기 작업 취소</button>
          </div>
        )}

        {/* 오류 */}
        {p.status === "error" && rerunStep && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="small strong">작업 재실행</span>
            <AiPicker value={ai} onChange={setAi} connections={b.connections} />
            <div className="row">
              <button className="btn btn-primary" disabled={busy} onClick={() => run({ action: "rerun", step: rerunStep }, "작업을 다시 실행합니다.")}>재실행</button>
              <Link className="btn" href="/settings">AI 연결 설정</Link>
            </div>
          </div>
        )}

        {/* 승인 게이트 */}
        {def.kind === "gate" && !running(p, b) && p.status !== "error" && (
          <div className="stack" style={{ gap: 10 }}>
            {p.stage === "final_approval" && p.needs_rereview && (
              <label className="check small">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> 승인 이후 변경 내용을 직접 확인했습니다 (재검수 없이 승인)
              </label>
            )}
            {p.stage === "final_approval" && (
              <div className="notice small">최종 승인해도 외부 블로그에 자동 발행되지 않습니다. 발행 패키지를 내려받아 직접 게시하세요. (티스토리 Open API 종료, 네이버 블로그 글쓰기 공식 API 미제공)</div>
            )}
            <div className="row">
              <button
                className="btn btn-ok"
                disabled={busy || (p.stage === "final_approval" && p.needs_rereview && !ack)}
                onClick={() => run({ action: "approve", comment, acknowledgeChanges: ack }, "승인했습니다. 다음 작업이 자동으로 시작됩니다.")}
              >
                ✓ 승인{nextHint(p.stage)}
              </button>
              <button className={`btn ${mode === "changes" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "changes" ? null : "changes")}>수정 요청</button>
              {directEdit[p.stage] && <button className="btn" onClick={() => goTab(directEdit[p.stage])}>직접 수정</button>}
              {p.stage === "draft_approval" && (
                <button className={`btn ${mode === "rerun" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "rerun" ? null : "rerun")}>다른 AI로 재검수</button>
              )}
              {p.stage === "plan_approval" && (
                <button className={`btn ${mode === "rerun" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "rerun" ? null : "rerun")}>기획 재실행</button>
              )}
              <button className="btn btn-danger" onClick={() => setMode(mode === "reject" ? null : "reject")}>반려</button>
              <button className="btn btn-ghost" onClick={() => goTab("versions")}>이전 버전 복원</button>
            </div>

            {mode === "changes" && (
              <div className="stack" style={{ gap: 8 }}>
                <textarea className="textarea" placeholder={changesPlaceholder(p.stage)} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
                {["plan_approval", "draft_approval"].includes(p.stage) && (
                  <div className="row small"><span className="muted">수정할 AI:</span><AiPicker value={ai} onChange={setAi} connections={b.connections} /></div>
                )}
                {p.stage === "draft_approval" && (
                  <p className="tiny muted">원고를 직접 고친 상태라면 AI 결과는 덮어쓰지 않고 '제안'으로 보관되어 비교 후 적용할 수 있습니다.</p>
                )}
                <div className="row">
                  <button className="btn btn-primary" disabled={busy || !comment.trim()} onClick={() => run({ action: "request_changes", comment }, "수정 요청을 전달했습니다.")}>수정 요청 보내기</button>
                </div>
              </div>
            )}
            {mode === "rerun" && (
              <div className="stack" style={{ gap: 8 }}>
                <AiPicker value={ai} onChange={setAi} connections={b.connections} />
                <div className="row">
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => run({ action: p.stage === "draft_approval" ? "rereview" : "rerun", step: "plan" }, "작업을 실행합니다.")}
                  >
                    실행
                  </button>
                </div>
              </div>
            )}
            {mode === "reject" && (
              <div className="stack" style={{ gap: 8 }}>
                <textarea className="textarea" placeholder="반려 사유 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="row">
                  <button className="btn btn-danger" disabled={busy} onClick={() => run({ action: "reject", comment }, "반려했습니다.")}>반려 확정</button>
                </div>
              </div>
            )}
            {mode === null && (
              <input className="input" placeholder="승인 메모 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
            )}
          </div>
        )}

        {/* 수동 단계 (2차 기능) */}
        {def.kind === "manual" && !running(p, b) && (
          <div className="row">
            {p.stage === "images" && (
              <>
                <button className="btn" onClick={() => goTab("editor")}>에디터에서 이미지 넣기</button>
                <button className="btn btn-primary" onClick={() => act({ action: "complete_stage" }, "이미지 승인 단계로 이동합니다.")}>이미지 작업 완료 → 승인 요청</button>
              </>
            )}
            {p.stage === "carousel" && (
              <>
                <Link className="btn" href="/studio/carousel">캐러셀 제작실 (2차 예정)</Link>
                <button className="btn btn-primary" onClick={() => act({ action: "complete_stage" }, "최종 승인 단계로 이동합니다.")}>캐러셀 건너뛰기 → 최종 승인</button>
              </>
            )}
          </div>
        )}

        {p.stage === "done" && (
          <div className="row">
            <span className="notice notice-ok small">최종 승인 완료 · 발행 패키지를 내려받아 블로그에 게시하세요.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function running(p: ProjectBundle["project"], b: ProjectBundle) {
  return p.status === "running" || b.jobs.length > 0;
}

function jobName(t: string) {
  return ({ plan: "기획안 작성", draft: "원고 작성", review: "AI 교차 검수", package: "발행 패키지 생성" } as Record<string, string>)[t] ?? t;
}

function nextHint(stage: string) {
  return (
    {
      topic_approval: " → 기획안 자동 작성",
      plan_approval: " → 원고 자동 작성·검수",
      draft_approval: " → 이미지 단계",
      image_approval: " → 발행 패키지 생성",
      final_approval: " (발행 준비 완료)",
    } as Record<string, string>
  )[stage] ?? "";
}

function changesPlaceholder(stage: string) {
  return (
    {
      topic_approval: "주제에 대한 수정 사항 (요청사항에 추가됩니다)",
      plan_approval: "예: 제목에 '2026'을 넣고, 목차에 가격 비교 섹션 추가해줘",
      draft_approval: "예: 도입부를 더 짧게, 장단점 표를 추가해줘",
      image_approval: "이미지 관련 수정 사항",
      final_approval: "수정할 내용 (원고 승인 단계로 돌아갑니다)",
    } as Record<string, string>
  )[stage];
}

// ───────────────────────── AI 제안 원고 (사용자 수정 보호) ─────────────────────────

function ProposalBanner({ projectId, proposalId, currentHtml, act }: { projectId: string; proposalId: string; currentHtml: string; act: (p: Record<string, unknown>, msg?: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Version | null>(null);
  return (
    <div className="notice notice-warn" style={{ marginTop: 12 }}>
      <div className="row between">
        <span className="small">
          <b>사용자 수정 보호:</b> 직접 수정한 원고가 있어 AI가 새로 쓴 원고를 덮어쓰지 않고 '제안'으로 보관했습니다.
        </span>
        <div className="row">
          <button
            className="btn btn-sm"
            onClick={async () => {
              setV(await api<Version>(`/api/projects/${projectId}/versions/${proposalId}`));
              setOpen(true);
            }}
          >
            비교하기
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => act({ action: "apply_proposal" }, "AI 제안을 적용했습니다. (이전 원고는 버전으로 백업)")}>AI 제안 적용</button>
          <button className="btn btn-sm" onClick={() => act({ action: "discard_proposal" }, "내 원고를 유지합니다.")}>내 원고 유지</button>
        </div>
      </div>
      {open && v && (
        <Modal title="현재 원고 ↔ AI 제안 비교" onClose={() => setOpen(false)}>
          <Diff before={htmlToText(currentHtml)} after={htmlToText(v.content)} />
        </Modal>
      )}
    </div>
  );
}

// ───────────────────────── 탭들 ─────────────────────────

function FlowTab({ b }: { b: ProjectBundle }) {
  const p = b.project;
  const [brief, setBrief] = useState(p.brief);
  const [date, setDate] = useState(p.scheduled_date ?? "");
  const [title, setTitle] = useState(p.title);
  const [saved, setSaved] = useState("");
  const save = async (patch: Record<string, unknown>) => {
    await api(`/api/projects/${p.id}`, "PATCH", patch);
    setSaved("저장됨");
    setTimeout(() => setSaved(""), 1500);
  };
  return (
    <div className="grid grid-2">
      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>프로젝트 정보 {saved && <span className="badge badge-ok">{saved}</span>}</h3>
        <div className="field">
          <label className="label">주제 / 가제목</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== p.title && save({ title })} />
        </div>
        <div className="field">
          <label className="label">AI 요청사항</label>
          <textarea className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} onBlur={() => brief !== p.brief && save({ brief })} />
        </div>
        <div className="field">
          <label className="label">발행 예정일</label>
          <input
            type="date"
            className="input"
            style={{ maxWidth: 220 }}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              void save({ scheduledDate: e.target.value || null });
            }}
          />
        </div>
      </section>
      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>이 블로그의 AI 역할 배정</h3>
        <dl className="kv">
          {Object.entries(b.blog?.ai_roles ?? {}).map(([role, a]) => (
            <div key={role} style={{ display: "contents" }}>
              <dt>{({ planner: "기획", writer: "원고 작성", reviewer: "교차 검수", editor: "부분 수정", ideas: "글감 추천" } as Record<string, string>)[role] ?? role}</dt>
              <dd>
                {a.provider}/{a.model}{" "}
                {a.provider !== "template" && !b.connections.find((c) => c.provider === a.provider)?.connected && <span className="badge badge-warn">미연결 → 템플릿 대체</span>}
              </dd>
            </div>
          ))}
        </dl>
        {b.blog && <Link className="small" style={{ color: "var(--accent)" }} href={`/blogs/${b.blog.id}`}>블로그 설정에서 변경 →</Link>}
      </section>
      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head"><h3>승인 기록</h3></div>
        <ApprovalList approvals={b.approvals as ApprovalRow[]} />
      </section>
    </div>
  );
}

type ApprovalRow = { id: string; stage: string; decision: string; comment: string; created_at: string };

function ApprovalList({ approvals }: { approvals: ApprovalRow[] }) {
  const label: Record<string, [string, string]> = {
    approved: ["승인", "badge-ok"],
    changes_requested: ["수정 요청", "badge-warn"],
    rejected: ["반려", "badge-bad"],
    skipped: ["수동 완료", ""],
  };
  if (!approvals.length) return <div className="empty">아직 승인 기록이 없습니다.</div>;
  return (
    <div className="list">
      {approvals.map((a) => (
        <div key={a.id} className="list-item" style={{ alignItems: "flex-start" }}>
          <span className={`badge ${label[a.decision]?.[1] ?? ""}`}>{label[a.decision]?.[0] ?? a.decision}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="small strong">{stageDef(a.stage).label}</div>
            {a.comment && <div className="small muted wrap-any">{a.comment}</div>}
          </div>
          <span className="tiny muted">{fmtDate(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewTab({ b, act }: { b: ProjectBundle; act: (p: Record<string, unknown>, msg?: string) => Promise<boolean> }) {
  const reviews = b.reviews as { id: string; result: ReviewResult; created_at: string }[];
  const [sel, setSel] = useState(0);
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const r = reviews[sel]?.result;
  const hasDoc = !!b.document?.content_html;
  const busy = b.project.status === "running" || b.jobs.length > 0;
  const sev: Record<string, string> = { high: "badge-bad", medium: "badge-warn", low: "" };
  const fc: Record<string, [string, string]> = {
    consistent_with_sources: ["출처와 일치", "badge-ok"],
    needs_verification: ["확인 필요", "badge-warn"],
    likely_incorrect: ["오류 가능성", "badge-bad"],
  };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="strong">다른 AI로 재검수</div>
        <p className="small muted">현재 원고(직접 수정 포함)를 선택한 AI가 다시 검수합니다. 검수 결과는 승인 기록과 별도로 저장됩니다.</p>
        <div className="row">
          <AiPicker value={ai} onChange={setAi} connections={b.connections} />
          <button className="btn btn-primary" disabled={!hasDoc || busy} onClick={() => act({ action: "rereview", ...(ai ?? {}) }, "재검수를 시작했습니다.")}>
            재검수 실행
          </button>
        </div>
      </section>
      {!r ? (
        <div className="card empty">검수 결과가 없습니다.</div>
      ) : (
        <>
          {reviews.length > 1 && (
            <div className="row">
              {reviews.map((x, i) => (
                <button key={x.id} className={`btn btn-sm ${i === sel ? "btn-primary" : ""}`} onClick={() => setSel(i)}>
                  {fmtDate(x.created_at)} · {x.result.provider}
                </button>
              ))}
            </div>
          )}
          <section className="card card-pad stack">
            <div className="row between">
              <div className="strong">검수 요약 · {r.provider}/{r.model}</div>
              {r.score !== null && <span className="badge badge-accent">품질 점수 {r.score}/100 (AI 평가)</span>}
            </div>
            <p className="small" style={{ whiteSpace: "pre-wrap" }}>{r.summary}</p>
          </section>
          <section className="card">
            <div className="card-head"><h3>지적 사항 ({r.issues.length})</h3></div>
            <div className="list">
              {r.issues.map((it, i) => (
                <div key={i} className="list-item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                  <div className="row">
                    <span className={`badge ${sev[it.severity] ?? ""}`}>{it.severity}</span>
                    <span className="badge">{it.type}</span>
                  </div>
                  {it.quote && <blockquote className="small muted" style={{ margin: 0, borderLeft: "3px solid var(--line)", paddingLeft: 8 }}>“{it.quote}”</blockquote>}
                  <div className="small">{it.comment}</div>
                  {it.suggestion && <div className="small" style={{ color: "var(--ok)" }}>→ {it.suggestion}</div>}
                </div>
              ))}
              {!r.issues.length && <div className="empty">지적 사항 없음</div>}
            </div>
          </section>
          <div className="grid grid-2">
            <section className="card">
              <div className="card-head"><h3>사실관계 확인</h3></div>
              <div className="list">
                {r.factChecks.map((f, i) => (
                  <div key={i} className="list-item" style={{ alignItems: "flex-start" }}>
                    <span className={`badge ${fc[f.status]?.[1] ?? ""}`}>{fc[f.status]?.[0] ?? f.status}</span>
                    <div className="small" style={{ flex: 1 }}>
                      {f.claim}
                      {f.note && <div className="muted tiny">{f.note}</div>}
                    </div>
                  </div>
                ))}
                {!r.factChecks.length && <div className="empty small">항목 없음</div>}
              </div>
              <p className="tiny muted card-pad">AI는 웹 검색 없이 제공된 출처와 대조만 합니다. '확인 필요' 항목은 직접 확인하세요.</p>
            </section>
            <section className="card">
              <div className="card-head"><h3>블로그 검수 규칙</h3></div>
              <div className="list">
                {r.ruleChecks.map((c, i) => (
                  <div key={i} className="list-item" style={{ alignItems: "flex-start" }}>
                    <span className={`badge ${c.passed ? "badge-ok" : "badge-warn"}`}>{c.passed ? "통과" : "확인"}</span>
                    <div className="small" style={{ flex: 1 }}>
                      {c.rule}
                      {c.note && <div className="muted tiny">{c.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function VersionsTab({ b, act }: { b: ProjectBundle; act: (p: Record<string, unknown>, msg?: string) => Promise<boolean> }) {
  const versions = b.versions as (Omit<Version, "content"> & { size: number })[];
  const [view, setView] = useState<{ v: Version; mode: "view" | "diff" } | null>(null);
  const busy = b.project.status === "running" || b.jobs.length > 0;
  const srcLabel: Record<string, string> = { ai: "AI", user: "사용자", autosave: "자동 저장", restore: "복원", template: "템플릿", ai_edit: "AI 부분수정" };
  const open = async (id: string, mode: "view" | "diff") => setView({ v: await api<Version>(`/api/projects/${b.project.id}/versions/${id}`), mode });

  const current = (v: Version) => (v.kind === "draft" ? htmlToText(b.document?.content_html ?? "") : planText(b.project.plan));
  const text = (v: Version) => (v.kind === "draft" ? htmlToText(v.content) : planText(JSON.parse(v.content)));

  return (
    <div className="grid grid-2">
      {(["draft", "plan"] as const).map((kind) => (
        <section key={kind} className="card">
          <div className="card-head"><h3>{kind === "draft" ? "원고 버전" : "기획안 버전"}</h3></div>
          <div className="list">
            {versions
              .filter((v) => v.kind === kind)
              .map((v) => (
                <div key={v.id} className="list-item" style={{ flexWrap: "wrap" }}>
                  <span className="badge">v{v.number}</span>
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div className="small strong ellipsis">{v.label || v.title}</div>
                    <div className="tiny muted">
                      {srcLabel[v.source] ?? v.source}
                      {v.provider ? ` · ${v.provider}/${v.model}` : ""} · {fmtDate(v.created_at)}
                      {b.project.approved_version_id === v.id && <span className="badge badge-ok" style={{ marginLeft: 4 }}>승인본</span>}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-sm" onClick={() => open(v.id, "view")}>보기</button>
                    <button className="btn btn-sm" onClick={() => open(v.id, "diff")}>현재와 비교</button>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => confirm(`v${v.number}으로 복원할까요? 현재 내용은 버전으로 백업됩니다.`) && act({ action: "restore", versionId: v.id }, `v${v.number} 복원 완료`)}
                    >
                      복원
                    </button>
                  </div>
                </div>
              ))}
            {!versions.some((v) => v.kind === kind) && <div className="empty">버전이 없습니다.</div>}
          </div>
        </section>
      ))}
      {view && (
        <Modal title={`${view.v.kind === "draft" ? "원고" : "기획안"} v${view.v.number} ${view.mode === "diff" ? "↔ 현재" : ""}`} onClose={() => setView(null)}>
          {view.mode === "diff" ? (
            <>
              <p className="tiny muted" style={{ marginBottom: 8 }}>v{view.v.number} → 현재 내용으로 바뀐 부분</p>
              <Diff before={text(view.v)} after={current(view.v)} />
            </>
          ) : view.v.kind === "draft" ? (
            <div className="preview-html" dangerouslySetInnerHTML={{ __html: view.v.content }} />
          ) : (
            <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{text(view.v)}</pre>
          )}
        </Modal>
      )}
    </div>
  );
}

function planText(p: Plan | null) {
  if (!p) return "";
  return [
    `제목: ${p.selectedTitle}`,
    `제목 후보: ${p.titleCandidates.join(" / ")}`,
    `핵심 키워드: ${p.mainKeyword}`,
    `연관 키워드: ${p.subKeywords.join(", ")}`,
    `검색 의도: ${p.searchIntent}`,
    `대상 독자: ${p.targetReader}`,
    `방향: ${p.direction}`,
    `목차:`,
    ...p.outline.map((o, i) => `${i + 1}. ${o.heading}\n${o.points.map((x) => `   - ${x}`).join("\n")}`),
    `이미지 계획:`,
    ...p.imagePlan.map((i) => ` - ${i.position}: ${i.description}`),
  ].join("\n");
}

function SourcesTab({ b, setB, toast }: { b: ProjectBundle; setB: (x: ProjectBundle) => void; toast: (s: string) => void }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="strong">출처·근거 자료 추가</div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "2 1 260px" }} placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input" style={{ flex: "1 1 160px" }} placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            className="btn btn-primary"
            disabled={busy || !url.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                setB(await api<ProjectBundle>(`/api/projects/${b.project.id}`, "PATCH", { addSourceUrl: url.trim(), sourceNote: note }));
                setUrl("");
                setNote("");
              } catch (e) {
                toast((e as Error).message);
              }
              setBusy(false);
            }}
          >
            {busy ? <span className="spinner" /> : "수집·추가"}
          </button>
        </div>
        <p className="tiny muted">서버가 해당 페이지의 제목·설명을 실제로 가져와 수집일과 함께 저장합니다. 기획안 재작성 시 AI에 전달됩니다.</p>
      </section>
      <section className="card">
        <div className="list">
          {b.project.sources.map((s) => (
            <div key={s.url} className="list-item" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={s.url} target="_blank" rel="noreferrer" className="strong small wrap-any" style={{ color: "var(--accent)" }}>{s.title || s.url}</a>
                <div className="tiny muted wrap-any">{s.url}</div>
                {s.description && <div className="small muted">{s.description}</div>}
                {s.note && <div className="small">메모: {s.note}</div>}
                <div className="tiny muted">
                  수집일 {fmtDate(s.collected_at)} · {s.fetched ? "페이지 정보 수집 성공" : "페이지 정보 수집 실패 (URL만 저장)"}
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={async () => setB(await api<ProjectBundle>(`/api/projects/${b.project.id}`, "PATCH", { removeSourceUrl: s.url }))}>삭제</button>
            </div>
          ))}
          {!b.project.sources.length && <div className="empty">등록된 출처가 없습니다.</div>}
        </div>
      </section>
    </div>
  );
}

function HistoryTab({ b }: { b: ProjectBundle }) {
  const events = b.events as { id: string; type: string; message: string; created_at: string }[];
  const runs = b.runs as { id: string; purpose: string; provider: string; model: string; status: string; attempt: number; input_tokens: number; output_tokens: number; cost_usd: number; duration_ms: number; error: string | null; created_at: string }[];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="card-head"><h3>승인 기록 (사용자 결정)</h3></div>
        <ApprovalList approvals={b.approvals as ApprovalRow[]} />
      </section>
      <section className="card">
        <div className="card-head"><h3>AI 실행 이력</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>시각</th><th>작업</th><th>AI</th><th>상태</th><th>시도</th><th>토큰(입/출)</th><th>비용</th><th>소요</th><th>오류</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.purpose}</td>
                  <td>{r.provider}/{r.model}</td>
                  <td>{r.status === "succeeded" ? <span className="badge badge-ok">성공</span> : <span className="badge badge-bad">실패</span>}</td>
                  <td>{r.attempt}</td>
                  <td>{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                  <td>{fmtUsd(r.cost_usd)}</td>
                  <td>{(r.duration_ms / 1000).toFixed(1)}s</td>
                  <td className="wrap small" style={{ color: "var(--bad)" }}>{r.error}</td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={9} className="muted">실행 내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h3>활동 타임라인</h3></div>
        <div className="list">
          {events.map((e) => (
            <div key={e.id} className="list-item">
              <span className="tiny muted" style={{ width: 110, flexShrink: 0 }}>{fmtDate(e.created_at)}</span>
              <span className="small wrap-any">{e.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExportTab({ b }: { b: ProjectBundle }) {
  const p = b.project;
  const pkg = p.package;
  const [copied, setCopied] = useState("");
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };
  const base = `/api/projects/${p.id}/export`;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="strong">내보내기</div>
        <div className="row">
          <a className="btn" href={`${base}?format=html`}>HTML 다운로드</a>
          <a className="btn" href={`${base}?format=md`}>마크다운 다운로드</a>
          <a className="btn" href={`${base}?format=json`}>프로젝트 전체(JSON)</a>
          {b.document?.content_html && <button className="btn" onClick={() => copy(b.document!.content_html, "본문 HTML")}>본문 HTML 복사</button>}
          {copied && <span className="badge badge-ok">{copied} 복사됨</span>}
        </div>
        <p className="tiny muted">
          {pkg ? `발행 패키지 생성: ${fmtDate(pkg.generatedAt)} (이미지 승인 시 자동 생성)` : "발행 패키지는 이미지 승인 후 자동 생성됩니다. 지금 내려받으면 현재 원고 기준으로 만들어집니다."}
        </p>
        <div className="notice small">외부 블로그 자동 발행은 지원하지 않습니다. 티스토리 Open API는 종료되었고 네이버 블로그는 글쓰기 공식 API를 제공하지 않습니다. 패키지를 내려받아 블로그 편집기에 붙여넣어 발행하세요.</div>
      </section>
      {pkg && (
        <>
          <section className="card card-pad stack">
            <dl className="kv">
              <dt>제목</dt>
              <dd>{pkg.title} <button className="btn btn-sm btn-ghost" onClick={() => copy(pkg.title, "제목")}>복사</button></dd>
              <dt>태그</dt>
              <dd>{pkg.tags.map((t) => `#${t}`).join(" ") || "-"} {!!pkg.tags.length && <button className="btn btn-sm btn-ghost" onClick={() => copy(pkg.tags.join(", "), "태그")}>복사</button>}</dd>
              <dt>메타 설명</dt>
              <dd>{pkg.metaDescription}</dd>
              <dt>이미지 확인</dt>
              <dd>{pkg.imageChecklist.length ? pkg.imageChecklist.map((c, i) => <div key={i} className="small">{c}</div>) : "본문 이미지 없음"}</dd>
            </dl>
          </section>
          <section className="card card-pad">
            <div className="label">미리보기</div>
            <h2 style={{ fontSize: 20, margin: "8px 0 12px" }}>{pkg.title}</h2>
            <div className="preview-html" dangerouslySetInnerHTML={{ __html: pkg.html }} />
          </section>
        </>
      )}
    </div>
  );
}
