import { notFound } from "next/navigation";
import { postBundle } from "@/lib/post-bundle";
import { ensureWorker } from "@/lib/jobs";
import { hfConnected } from "@/lib/higgsfield";
import PostView from "./PostView";
import { getKit, listSouls } from "@/lib/image-refs";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  ensureWorker();
  const b = await postBundle((await params).id);
  if (!b) notFound();
  const [kit, souls] = await Promise.all([getKit(b.project.blog_id), listSouls().catch(() => [])]);
  return <PostView initial={JSON.parse(JSON.stringify(b))} higgsfield={hfConnected()} kit={kit} souls={souls.filter((x) => x.status === "completed").map((x) => ({ id: x.id, name: x.name, version: x.version }))} />;
}
