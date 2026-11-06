import { notFound } from "next/navigation";
import { getVideo, listVideos } from "@/lib/videos";
import VideoEditor from "./VideoEditor";

import PostedButton from "@/components/PostedButton";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await getVideo((await params).id);
  if (!v) notFound();
  const children = (await listVideos()).filter((x) => x.parent_id === v.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <a href="/videos" className="small" style={{ color: "var(--accent)" }}>← 영상공장</a>
          <h1 style={{ wordBreak: "break-all" }}>🎬 {v.title}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {v.status === "ready" && <a className="btn btn-sm" href={`/reels?from=${v.id}`}>✂️ 릴스 편집기로</a>}
          <PostedButton type="video" id={v.id} postedAt={(v as { posted_at?: string | null }).posted_at ?? null} />
        </div>
      </div>
      <VideoEditor initial={JSON.parse(JSON.stringify(v))} edits={JSON.parse(JSON.stringify(children))} />
    </div>
  );
}
