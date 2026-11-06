import { listBlogs } from "@/lib/repo";
import { getDiagnoseState, lastDiagnosis } from "@/lib/diagnose";
import DiagnoseView from "./DiagnoseView";

export const dynamic = "force-dynamic";

export default async function Diagnose({ searchParams }: { searchParams: Promise<{ blog?: string }> }) {
  const sp = await searchParams;
  const blogs = (await listBlogs()).map((b) => ({ id: b.id, name: b.name, platform: b.platform, url: b.url, color: b.color }));
  const cur = blogs.find((b) => b.id === sp.blog) ?? blogs[0];
  const last = cur ? await lastDiagnosis(cur.id) : null;
  const state = cur ? await getDiagnoseState(cur.id) : null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🩺 블로그 진단</h1>
          <p className="sub">발행 리듬·제목·검색 누락·키워드 순위·글 구조·방문자를 앱이 직접 재고, AI가 고칠 점을 정리합니다.</p>
        </div>
      </div>
      {cur ? <DiagnoseView key={cur.id} blogs={blogs} blogId={cur.id} initial={last} initialState={state} /> : <p className="muted">블로그를 먼저 추가하세요.</p>}
    </div>
  );
}
