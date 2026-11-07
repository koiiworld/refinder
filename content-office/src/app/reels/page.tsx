import TrashableList from "@/components/TrashableList";
import { listReels } from "@/lib/reels";
import { listVideos } from "@/lib/videos";
import { fmtDate } from "@/components/ui";
import NewReel from "./NewReel";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { analyzing: "초안 만드는 중", ready: "편집 중", rendering: "내보내는 중", error: "확인 필요" };

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const [reels, videos] = await Promise.all([listReels(), listVideos()]);
  const ready = videos.filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, duration: v.duration, thumb: !!v.thumb_path, kind: v.kind }));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>✂️ 릴스 편집</h1>
          <p className="sub">영상 하나를 고르면 맥이 말을 받아써서 문장마다 장면·자막으로 나눠 줘요. 그다음 캡컷처럼 자막·배경·장면을 고치고 내보내세요. (받아쓰기·내보내기는 맥에서, 무료)</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <NewReel videos={ready} defaultId={sp.from} />
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
