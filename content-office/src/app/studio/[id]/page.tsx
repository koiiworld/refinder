import { notFound } from "next/navigation";
import { getStudio, STUDIO_STYLES } from "@/lib/studio";
import { IMAGE_MODELS } from "@/lib/image-models";
import StudioEditor from "./StudioEditor";

import PostedButton from "@/components/PostedButton";
import TrashButton from "@/components/TrashButton";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getStudio((await params).id);
  if (!s) notFound();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <a href="/studio" className="small" style={{ color: "var(--accent)" }}>← 영상 스튜디오</a>
          <h1>🎬 {s.title}</h1>
          <p className="sub">{s.plan?.concept}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <TrashButton id={s.id} back="/studio" />
          <PostedButton type="studio" id={s.id} postedAt={(s as { posted_at?: string | null }).posted_at ?? null} />
        </div>
      </div>
      <StudioEditor initial={JSON.parse(JSON.stringify(s))} styles={STUDIO_STYLES.map((x) => ({ id: x.id, label: x.label }))} imageModels={IMAGE_MODELS.filter((m) => m.provider !== "higgsfield").map((m) => ({ id: m.id, label: m.label }))} />
    </div>
  );
}
