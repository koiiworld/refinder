import { notFound } from "next/navigation";
import { getEdit } from "@/lib/edit";
import { listVideos } from "@/lib/videos";
import { q } from "@/lib/db";
import CutEditor from "./CutEditor";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const e = await getEdit((await params).id);
  if (!e) notFound();
  const videos = (await listVideos()).filter((v) => v.status === "ready").map((v) => ({ id: v.id, title: v.title, duration: v.duration, thumb: !!v.thumb_path, kind: v.kind as string }));
  // 이 편집에 쓴 사진도 목록에
  const imgIds = [...e.doc.clips, ...e.doc.overlays].map((c) => c.src).filter((s) => s.startsWith("img_"));
  const imgs = imgIds.length ? await q<{ id: string; prompt: string }>("SELECT id, prompt FROM generated_images WHERE id = ANY($1)", [imgIds]) : [];
  const media = [...imgs.map((i) => ({ id: i.id, title: i.prompt || "사진", duration: 3, thumb: false, kind: "image" })), ...videos];
  const { doc, ...info } = e;
  return <CutEditor initial={JSON.parse(JSON.stringify(info))} initialDoc={JSON.parse(JSON.stringify(doc))} media={media} />;
}
