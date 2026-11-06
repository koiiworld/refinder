import Link from "next/link";
import { notFound } from "next/navigation";
import { getReel } from "@/lib/reels";
import { listVideos } from "@/lib/videos";
import ReelEditor from "./ReelEditor";

export const dynamic = "force-dynamic";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getReel((await params).id);
  if (!r) notFound();
  const files = (await listVideos()).filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, kind: v.kind, duration: v.duration, thumb: !!v.thumb_path }));
  const { doc, ...info } = r;
  return (
    <div className="page" style={{ maxWidth: 1500 }}>
      <div className="page-head">
        <div>
          <Link href="/reels" className="small" style={{ color: "var(--accent)" }}>← 릴스 편집</Link>
          <h1>✂️ 릴스 편집기</h1>
          <p className="sub">왼쪽은 원본 가이드, 가운데서 고치고, 오른쪽에서 완성 영상을 봐요. 고친 내용은 자동 저장되고, 내보내기는 맥에서 만들어져요.</p>
        </div>
      </div>
      <ReelEditor initial={JSON.parse(JSON.stringify(info))} initialDoc={JSON.parse(JSON.stringify(doc))} files={files} />
    </div>
  );
}
