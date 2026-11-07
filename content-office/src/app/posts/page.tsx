import Link from "next/link";
import { q } from "@/lib/db";
import { ensureWorker } from "@/lib/jobs";

import { placeholderNumbers, readiness } from "@/lib/readiness";

import AutoRefresh from "./AutoRefresh";
import { listBlogs } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import { naverAdConnected } from "@/lib/searchad";
import { naverConnected } from "@/lib/research";
import { youtubeConnected } from "@/lib/youtube";
import KeywordStep from "../new/KeywordStep";
import PostGroups, { type PostRow } from "./PostGroups";

export const dynamic = "force-dynamic";

type Row = PostRow;

export default async function Posts({ searchParams }: { searchParams: Promise<{ new?: string; hint?: string; blog?: string }> }) {
  const sp = await searchParams;
  ensureWorker();
  const raw = await q<Row & { review: Parameters<typeof readiness>[0]["review"]; package: { images?: { url?: string | null; manual?: boolean }[] } | null; html: string | null; plan: { outline?: { approved?: boolean } } | null }>(
    `SELECT p.id, p.title, p.topic, p.stage, p.status, p.status_message, p.updated_at, p.needs_rereview, p.review, p.package, p.plan, d.content_html AS html, b.name AS blog_name, b.color AS blog_color
     FROM projects p JOIN blogs b ON b.id=p.blog_id LEFT JOIN documents d ON d.project_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 300`,
  );
  // 발행 준비 판정은 항상 지금 원고 기준
  const rows: Row[] = raw.map(({ review, package: pkg, html, plan, ...r }) => {
    const rd = readiness({ stage: r.stage, status: r.status, needsRereview: r.needs_rereview, review, images: pkg?.images ?? [], placeholders: placeholderNumbers(html ?? ""), outlinePending: !!plan?.outline && !plan.outline.approved });
    return { ...r, ready: { state: rd.state, score: rd.score, openIssues: rd.openIssues, reasons: rd.reasons } };
  });
  const groups: [string, Row[]][] = [
    ["③ 제목을 골라 주세요 — 고른 뒤 '글 쓰기'를 눌러야 작성이 시작됩니다", rows.filter((r) => r.stage === "titles" && r.status === "waiting")],
    ["⑦ 발행 준비 완료 — 확인하고 발행하세요", rows.filter((r) => r.stage === "ready" && r.status !== "error" && ["ready", "manual"].includes(r.ready!.state))],
    ["⑥ 손볼 곳이 있어요 — 재검수·수정·이미지", rows.filter((r) => r.stage === "ready" && r.status !== "error" && !["ready", "manual"].includes(r.ready!.state))],
    ["AI가 작업 중", rows.filter((r) => ["titles", "writing", "reviewing"].includes(r.stage) && r.status === "running")],
    ["오류 — 다시 실행이 필요해요", rows.filter((r) => r.status === "error")],
    ["발행 완료", rows.filter((r) => r.stage === "published")],
    ["이전 방식으로 만든 글", rows.filter((r) => !["titles", "writing", "reviewing", "ready", "published"].includes(r.stage) && r.status !== "error")],
  ];
  const working = groups[3][1].length > 0;
  const blogs = await listBlogs();
  const openNew = !!(sp.new || sp.hint || sp.blog) || !rows.length;

  return (
    <div className="page">
      {working && <AutoRefresh seconds={4} />}
      <div className="page-head">
        <div>
          <h1>블로그 업로드</h1>
          <p className="sub">① 키워드 추천 → ② 고르기로 새 글을 시작하고, 아래에서 ③ 제목 → ④ 글 → ⑥ 검수 → ⑦ 발행까지 진행 상황을 봐요. 화면을 닫아도 AI 작업은 계속됩니다.</p>
        </div>
        <div className="row">
          <Link href="/trash" className="btn">🗑 휴지통</Link>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <details id="new" className="new-post" open={openNew}>
          <summary className="card card-head">
            <h2 style={{ fontSize: 15 }}><span className="cost-arrow">▸</span> ✏️ 새 글 만들기 <span className="small muted">① 키워드 추천 · ② 선택</span></h2>
          </summary>
          <div style={{ marginTop: 12 }}>
            <KeywordStep
              blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color, category: b.category }))}
              sources={{ ai: connectionStatus().some((c) => c.connected && !c.media), naverAd: naverAdConnected(), datalab: naverConnected(), youtube: youtubeConnected() }}
            />
          </div>
        </details>
        <PostGroups groups={groups} />
        {!rows.length && (
          <div className="card empty">
            아직 만든 글이 없습니다. 위 &apos;새 글 만들기&apos;에서 키워드를 골라 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
