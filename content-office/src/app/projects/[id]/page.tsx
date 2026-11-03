import { notFound } from "next/navigation";
import { projectBundle } from "@/lib/bundle";
import { ensureWorker } from "@/lib/jobs";
import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  ensureWorker();
  const bundle = await projectBundle((await params).id);
  if (!bundle) notFound();
  return <Workspace initial={JSON.parse(JSON.stringify(bundle))} />;
}
