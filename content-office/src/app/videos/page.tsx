import { listVideos } from "@/lib/videos";
import { storageKind } from "@/lib/video-store";
import VideoFactory from "./VideoFactory";

export const dynamic = "force-dynamic";

export default async function Videos() {
  const videos = await listVideos();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🎬 영상공장</h1>
          <p className="sub">영상 링크를 넣으면 바로 받아서 저장소에 보관해요. 화면에 박힌 자막은 AI가 위치를 찾아 지워요. 받은 영상은 눌러서 바로 편집할 수 있어요.</p>
        </div>
        <a href="/studio" className="btn btn-sm">🎬 영상 제작 스튜디오</a>
      </div>
      <VideoFactory initial={JSON.parse(JSON.stringify(videos))} storage={storageKind()} />
    </div>
  );
}
