import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeries } from "@/lib/series";
import SeriesView from "./SeriesView";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSeries((await params).id);
  if (!s) notFound();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <Link href="/studio" className="small" style={{ color: "var(--accent)" }}>← 영상 스튜디오</Link>
          <h1>📺 {s.title}</h1>
          <p className="sub">화마다 제목·줄거리·장면 프롬프트·유튜브 설명이 있어요. &apos;영상 기획&apos;을 누르면 같은 캐릭터 문장으로 영상 스튜디오 기획이 만들어지고, 거기서 캐릭터·장면 이미지·영상을 만들어요.</p>
        </div>
      </div>
      <SeriesView initial={JSON.parse(JSON.stringify(s))} />
    </div>
  );
}
