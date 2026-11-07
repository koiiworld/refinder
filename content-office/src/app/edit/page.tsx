import Link from "next/link";
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
        <section className="card">
          <div className="card-head"><h2 style={{ fontSize: 15 }}>편집 프로젝트 ({list.length})</h2></div>
          <div className="list">
            {!list.length && <div className="list-item small muted">아직 없어요.</div>}
            {list.map((e) => (
              <Link key={e.id} href={`/edit/${e.id}`} className="list-item" style={{ gap: 10, flexWrap: "nowrap" }}>
                {e.doc.clips[0] && !e.doc.clips[0].src.startsWith("img_") ? <img src={`/api/videos/${e.doc.clips[0].src}/file?kind=thumb`} alt="" style={{ width: 40, height: 56, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ width: 40 }}>🎞</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong ellipsis">{e.title}</div>
                  <div className="tiny muted">클립 {e.doc.clips.length}개 · {e.doc.ratio} · {fmtDate(e.updated_at)}{e.message ? ` · ${e.message}` : ""}</div>
                </div>
                {e.output_video_id && <span className="badge badge-ok">내보냄</span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
