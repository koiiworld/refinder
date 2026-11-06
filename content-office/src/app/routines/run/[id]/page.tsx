import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoutine, getRun } from "@/lib/routines";
import RunView from "./RunView";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = await getRun((await params).id);
  const routine = run ? await getRoutine(run.routine_id) : null;
  if (!run || !routine) notFound();
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <Link href="/routines" className="small" style={{ color: "var(--accent)" }}>← 루틴 관리</Link>
          <h1>📋 {routine.name}</h1>
        </div>
      </div>
      <RunView initial={JSON.parse(JSON.stringify(run))} routine={JSON.parse(JSON.stringify(routine))} />
    </div>
  );
}
