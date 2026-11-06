import Link from "next/link";
import { listStudio, STUDIO_STYLES } from "@/lib/studio";
import { IMAGE_MODELS } from "@/lib/image-models";
import { fmtDate } from "@/components/ui";
import NewStudio from "./NewStudio";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { planning: "기획 중", planned: "기획 완료", rendering: "합치는 중", done: "완성", error: "오류" };

export default async function Studio() {
  const list = await listStudio();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🎬 영상 제작 스튜디오</h1>
          <p className="sub">만들고 싶은 쇼츠·릴스를 적으면 AI가 기획하고, 캐릭터 → 장면 이미지 → 장면 영상 → 합치기 순서로 만들어요. 이미지·영상은 버튼을 눌러야 만들어져요(비용 발생).</p>
        </div>
      </div>
      <NewStudio styles={STUDIO_STYLES.map((s) => ({ id: s.id, label: s.label }))} imageModels={IMAGE_MODELS.filter((m) => m.provider !== "higgsfield").map((m) => ({ id: m.id, label: m.label, note: m.note }))} />
      <section className="card">
        <div className="card-head"><h2 style={{ fontSize: 15 }}>만든 영상 프로젝트 ({list.length})</h2></div>
        <div className="card-pad stack" style={{ gap: 6 }}>
          {!list.length && <p className="small muted" style={{ margin: 0 }}>아직 없어요.</p>}
          {list.map((s) => (
            <Link key={s.id} href={`/studio/${s.id}`} className="row between card card-pad" style={{ padding: 10, flexWrap: "nowrap" }}>
              <span className="small ellipsis" style={{ flex: 1 }}><b>{s.title}</b> <span className="tiny muted">· 장면 {s.scenes.length}개 · {STATUS[s.status] ?? s.status}</span></span>
              <span className="tiny muted">{fmtDate(s.updated_at)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
