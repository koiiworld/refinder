import { notFound } from "next/navigation";
import { postBundle } from "@/lib/post-bundle";
import { ensureWorker } from "@/lib/jobs";
import { hfConnected } from "@/lib/higgsfield";
import PostView from "./PostView";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  ensureWorker();
  const b = await postBundle((await params).id);
  if (!b) notFound();
  return <PostView initial={JSON.parse(JSON.stringify(b))} higgsfield={hfConnected()} />;
}
