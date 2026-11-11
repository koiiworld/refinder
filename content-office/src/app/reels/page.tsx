import TrashableList from "@/components/TrashableList";
import { listReels } from "@/lib/reels";
import { getVideo } from "@/lib/videos";
import { fmtDate } from "@/components/ui";
import NewReel from "./NewReel";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { analyzing: "초안 만드는 중", ready: "편집 중", rendering: "내보내는 중", error: "확인 필요" };

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const reels = await listReels();
  const fv = sp.from ? await getVideo(sp.from).catch(() => null) : null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>✂️ 릴스 편집</h1>
          <p className="sub">새 프로젝트를 열고 영상·사진·음악을 올려 메인에 이어 붙이고, 글자·위에 얹기·소리를 타임라인에서 고친 뒤 &apos;영상 뽑기&apos;를 눌러요. (영상 뽑기는 맥에서 만들어요)</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <NewReel fromVideo={fv ? { id: fv.id, title: fv.title } : null} />
        <TrashableList
          title="만든 릴스"
          items={reels.map((r) => ({
            id: r.id, href: `/reels/${r.id}`, title: r.title || "릴스",
            thumb: r.base_video_id && r.thumb ? `/api/videos/${r.base_video_id}/file?kind=thumb` : null,
            sub: `${r.doc?.scenes?.length ?? 0}장면 · 자막 ${r.doc?.texts?.length ?? 0}개 · ${fmtDate(r.updated_at)}${r.message ? ` · ${r.message}` : ""}`,
            badge: r.status === "ready" && r.output_video_id ? "내보냄" : STATUS[r.status] ?? r.status,
            badgeClass: r.status === "error" ? "badge-bad" : r.output_video_id ? "badge-ok" : "",
          }))}
        />
      </div>
    </div>
  );
}
