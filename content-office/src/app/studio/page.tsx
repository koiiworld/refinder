import TrashableList from "@/components/TrashableList";
import { listStudio, STUDIO_STYLES } from "@/lib/studio";
import { IMAGE_MODELS } from "@/lib/image-models";
import { fmtDate } from "@/components/ui";
import NewStudio from "./NewStudio";
import NewSeries from "./NewSeries";
import { listSeries } from "@/lib/series";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { planning: "기획 중", planned: "기획 완료", rendering: "합치는 중", done: "완성", error: "오류" };

export default async function Studio({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const sp = await searchParams;
  const list = await listStudio();
  const series = await listSeries().catch(() => []);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🎬 영상 제작 스튜디오</h1>
          <p className="sub">만들고 싶은 쇼츠·릴스를 적으면 AI가 기획하고, 캐릭터 → 장면 이미지 → 장면 영상 → 합치기 순서로 만들어요. 이미지·영상은 버튼을 눌러야 만들어져요(비용 발생).</p>
        </div>
      </div>
      <NewSeries styles={STUDIO_STYLES.map((s) => ({ id: s.id, label: s.label }))} list={series.map((x) => ({ id: x.id, title: x.title, count: x.episodes.length, made: x.episodes.filter((e) => e.studioId).length }))} />
      <NewStudio defaultPrompt={sp.prompt ?? ""} styles={STUDIO_STYLES.map((s) => ({ id: s.id, label: s.label }))} imageModels={IMAGE_MODELS.filter((m) => m.provider !== "higgsfield").map((m) => ({ id: m.id, label: m.label, note: m.note }))} />
      <TrashableList
        title="만든 영상 프로젝트"
        items={list.map((s) => ({
          id: s.id, href: `/studio/${s.id}`, title: s.title,
          thumb: s.character?.image?.url ?? null,
          sub: `장면 ${s.scenes.length}개 · ${STATUS[s.status] ?? s.status} · ${fmtDate(s.updated_at)}`,
          badge: s.status === "done" ? "완성" : s.status === "error" ? "오류" : undefined,
          badgeClass: s.status === "done" ? "badge-ok" : "badge-bad",
        }))}
      />
    </div>
  );
}
