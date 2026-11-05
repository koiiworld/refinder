import Link from "next/link";
import { q } from "@/lib/db";
import { ensureWorker } from "@/lib/jobs";

import { fmtUsd } from "@/components/ui";
import { todayUsage } from "@/lib/usage";

const AI_NAMES: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", google: "Gemini" };
import AutoRefresh from "./AutoRefresh";
import PostGroups, { type PostRow } from "./PostGroups";

export const dynamic = "force-dynamic";

type Row = PostRow;

export default async function Posts() {
  ensureWorker();
  const rows = await q<Row>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.status_message, p.updated_at, p.needs_rereview, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 300`,
  );
  const groups: [string, Row[]][] = [
    ["③ 제목을 골라 주세요 — 고른 뒤 '글 쓰기'를 눌러야 작성이 시작됩니다", rows.filter((r) => r.stage === "titles" && r.status === "waiting")],
    ["⑦ 발행 대기 — 확인하고 발행하세요", rows.filter((r) => r.stage === "ready" && r.status !== "error")],
    ["AI가 작업 중", rows.filter((r) => ["titles", "writing", "reviewing"].includes(r.stage) && r.status === "running")],
    ["오류 — 다시 실행이 필요해요", rows.filter((r) => r.status === "error")],
    ["발행 완료", rows.filter((r) => r.stage === "published")],
    ["이전 방식으로 만든 글", rows.filter((r) => !["titles", "writing", "reviewing", "ready", "published"].includes(r.stage) && r.status !== "error")],
  ];
  const working = groups[2][1].length > 0;
  const usage = await todayUsage();

  return (
    <div className="page">
      {working && <AutoRefresh seconds={4} />}
      <div className="page-head">
        <div>
          <h1>진행 현황</h1>
          <p className="sub">AI가 ③ 제목 후보를 뽑으면 직접 고르고 '글 쓰기'를 누르세요. 그 뒤 ④ 글 → ⑥ 검수는 자동으로 진행되고, 이 화면을 닫아도 계속됩니다.</p>
        </div>
        <div className="row">
          <Link href="/trash" className="btn">🗑 휴지통</Link>
          <Link href="/new" className="btn btn-primary">+ 키워드 더 고르기</Link>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <details className="card cost-card">
          <summary className="card-head" style={{ flexWrap: "wrap", cursor: "pointer" }}>
            <h2 style={{ fontSize: 15 }}><span className="cost-arrow">▸</span> 오늘 쓴 AI 비용 <span className="small muted">(한국 시간 0시부터 · 눌러서 자세히)</span></h2>
            <span className="badge badge-accent">합계 {fmtUsd(usage.total)}</span>
          </summary>
          {usage.models.length ? (
            <div className="card-pad stack" style={{ gap: 14 }}>
              <div>
                <div className="label">어디에 썼나 (단계별)</div>
                <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                  {usage.steps.map((s) => (
                    <div key={s.step} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                      <div className="row between" style={{ flexWrap: "nowrap" }}>
                        <b className="small">{s.label}</b>
                        <b className="small" style={{ flexShrink: 0 }}>{fmtUsd(s.cost)}</b>
                      </div>
                      {s.models.filter((m) => m.calls > 0).map((m) => (
                        <div key={m.provider + m.model} className="row between tiny muted" style={{ flexWrap: "nowrap" }}>
                          <span className="ellipsis">{AI_NAMES[m.provider] ?? m.provider} {m.model} · {m.calls}회</span>
                          <span style={{ flexShrink: 0 }}>{fmtUsd(m.cost)}</span>
                        </div>
                      ))}
                      {s.failed > 0 && <div className="tiny muted">실패(거절) {s.failed}회 · 비용 없음</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="label">모델별 합계</div>
                <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                  {usage.models.filter((m) => m.calls > 0).map((m) => (
                    <div key={m.provider + m.model} className="list-item row between" style={{ flexWrap: "nowrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="small"><b>{AI_NAMES[m.provider] ?? m.provider}</b> <span className="tiny muted">{m.model}</span></div>
                        <div className="tiny muted">{m.calls}회 · 토큰 입력 {m.inputTokens.toLocaleString()} / 출력 {m.outputTokens.toLocaleString()}</div>
                      </div>
                      <b className="small" style={{ flexShrink: 0 }}>{fmtUsd(m.cost)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="card-pad small muted">오늘은 아직 AI를 쓰지 않았습니다.</p>
          )}
          <p className="card-pad tiny muted">
            토큰 수 × 설정의 단가로 계산한 추정치입니다. 실제 청구액은 각 사 사용량 페이지가 기준이고, Gemini 무료 사용분은 청구되지 않습니다. &apos;실패&apos;는 대부분 크레딧 부족·혼잡으로 거절된 호출이라 비용이 들지 않습니다(답이 중간에 잘린 경우는 쓴 토큰만큼 포함).
            {usage.images > 0 && ` · 오늘 Higgsfield 이미지 생성 ${usage.images}건 (크레딧은 Higgsfield 사이트에서 확인)`}
          </p>
        </details>
        <PostGroups groups={groups} />
        {!rows.length && (
          <div className="card empty">
            아직 만든 글이 없습니다. <Link href="/new" style={{ color: "var(--accent)" }}>글 만들기</Link>에서 키워드를 골라 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
