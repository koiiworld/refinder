import TrashableList from "@/components/TrashableList";
import { fmtDate } from "@/components/ui";
import { estimateSteps } from "@/lib/estimate";
import { listShoots } from "@/lib/shoots";
import { listStudies } from "@/lib/reel-study";
import { SHOOT_STATUS_LABEL, shootKind } from "@/lib/shoot-types";
import NewShoot from "./NewShoot";

export const dynamic = "force-dynamic";

export default async function ShootsPage() {
  const [list, estimate, face, studies] = await Promise.all([listShoots(), estimateSteps(["shoot_script"]), estimateSteps(["shoot_face", "shoot_view"]), listStudies()]);
  const refs = studies.filter((x) => x.status === "done").slice(0, 40).map((x) => ({ id: x.id, title: (x.title || x.url).slice(0, 40), sub: [x.mine ? "내 릴스" : "", x.analysis?.format ?? x.category].filter(Boolean).join(" · ") }));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📹 현장 숏폼</h1>
          <p className="sub">찍은 영상을 올리면 AI가 영상을 확인하고 컷 편집 대본을 보고해요. 대본을 승인하면 그대로 잘라 붙이고 자막을 얹어 릴스·쇼츠·클립용 세로 영상을 만들어요. 현장 소리는 그대로 두고, 배경음악은 올릴 때 플랫폼에서 넣어요. (영상 확인·만들기는 맥에서 해요)</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <NewShoot estimate={estimate.steps[0] ?? null} faceEstimate={face.steps[0] ?? null} viewEstimate={face.steps[1] ?? null} studies={refs} />
        <TrashableList
          title="촬영 목록"
          items={list.map((s) => ({
            id: s.id, href: `/shoots/${s.id}`, title: s.title || "촬영",
            thumb: s.thumb ? `/api/videos/${s.thumb.split("/")[0]}/file?kind=thumb` : null,
            sub: `${shootKind(s.kind).label} · 클립 ${s.clip_count}개 · ${fmtDate(s.updated_at)}${s.message ? ` · ${s.message}` : ""}`,
            badge: SHOOT_STATUS_LABEL[s.status] ?? s.status,
            badgeClass: s.status === "error" ? "badge-bad" : s.status === "done" ? "badge-ok" : s.status === "review" ? "badge-warn" : "",
          }))}
        />
      </div>
    </div>
  );
}
