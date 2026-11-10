import { getVoice, listIgRuns } from "@/lib/ig-ops";
import IgOps from "./IgOps";

export const dynamic = "force-dynamic";

export default async function InstagramOpsPage() {
  const [runs, voice] = await Promise.all([listIgRuns(), getVoice()]);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div>
          <h1>📱 인스타 운영</h1>
          <p className="sub">릴스 대본 · 댓글 답글 · 프로필 점수 · 주간 계획 · 잘 된 영상 찾기. 버튼을 누를 때만 AI를 써요(예상 비용 먼저 확인). 게시·답글 달기는 직접 해요.</p>
        </div>
      </div>
      <IgOps initialRuns={JSON.parse(JSON.stringify(runs))} initialVoice={voice} />
      <p className="tiny muted" style={{ marginTop: 24 }}>참고: instagram-agent-skill (MIT, © 2026 Jake Schincariol)의 후킹 공식·프로필 채점표·주간 계획·댓글 분류 방식을 한국어로 옮겼어요.</p>
    </div>
  );
}
