import { notFound } from "next/navigation";
import { getVideo, listVideos } from "@/lib/videos";
import VideoEditor from "./VideoEditor";

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
      </div>
      <VideoEditor initial={JSON.parse(JSON.stringify(v))} edits={JSON.parse(JSON.stringify(children))} />
    </div>
  );
}
