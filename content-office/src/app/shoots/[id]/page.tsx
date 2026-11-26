import Link from "next/link";
import { notFound } from "next/navigation";
import { estimateSteps } from "@/lib/estimate";
import { getShoot } from "@/lib/shoots";
import ShootView from "./ShootView";

export const dynamic = "force-dynamic";

export default async function ShootPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getShoot((await params).id);
  if (!s) notFound();
  const estimate = await estimateSteps(["shoot_script"]);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <Link href="/shoots" className="small" style={{ color: "var(--accent)" }}>← 현장 숏폼</Link>
          <h1>📹 {s.title}</h1>
        </div>
      </div>
      <ShootView initial={JSON.parse(JSON.stringify(s))} estimateUsd={estimate.steps[0]?.usd ?? null} />
    </div>
  );
}
