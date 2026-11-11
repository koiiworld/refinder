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
          <p className="sub">왼쪽 내 파일에서 영상·사진·음악을 올려 메인에 이어 붙이고, 글자·위에 얹기·소리를 타임라인에서 고쳐요. 고친 내용은 자동 저장되고, 영상 뽑기는 맥에서 만들어져요.</p>
        </div>
      </div>
      <ReelEditor initial={JSON.parse(JSON.stringify(info))} initialDoc={JSON.parse(JSON.stringify(doc))} files={files} />
    </div>
  );
}
