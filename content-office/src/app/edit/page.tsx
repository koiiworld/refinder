import TrashableList from "@/components/TrashableList";
import { listEdits } from "@/lib/edit";
import { listVideos } from "@/lib/videos";
import { fmtDate } from "@/components/ui";
import NewEdit from "./NewEdit";

export const dynamic = "force-dynamic";

export default async function EditList() {
  const [list, videos] = await Promise.all([listEdits(), listVideos()]);
  const ready = videos.filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, duration: v.duration, thumb: !!v.thumb_path }));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🎞 영상 편집</h1>
          <p className="sub">캡컷처럼 자르기·분할·합치기, 여러 트랙(오버레이·오디오·텍스트), 배속·역재생, 자동 자막, 전환·필터, 줌 키프레임, 비율·배경을 편집하고 720p~4K로 내보내요. 내보내기·자동 자막·역재생은 맥에서 해요.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <NewEdit videos={ready} />
        <TrashableList
          title="편집 프로젝트"
          items={list.map((e) => ({
            id: e.id, href: `/edit/${e.id}`, title: e.title,
            thumb: e.doc.clips[0] && !e.doc.clips[0].src.startsWith("img_") ? `/api/videos/${e.doc.clips[0].src}/file?kind=thumb` : null,
            sub: `클립 ${e.doc.clips.length}개 · ${e.doc.ratio} · ${fmtDate(e.updated_at)}${e.message ? ` · ${e.message}` : ""}`,
            badge: e.output_video_id ? "내보냄" : e.status === "error" ? "확인 필요" : undefined,
            badgeClass: e.output_video_id ? "badge-ok" : "badge-bad",
          }))}
        />
      </div>
    </div>
  );
}
