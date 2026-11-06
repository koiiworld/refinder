import { listStudies, STUDY_CATEGORIES } from "@/lib/reel-study";
import StudyBoard from "./StudyBoard";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const list = await listStudies();
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-head">
        <div>
          <h1>🔍 릴스 분석</h1>
          <p className="sub">릴스·쇼츠 링크를 넣으면 맥이 영상을 받아 말을 받아쓰고, 첫 3초와 장면이 바뀔 때마다 사진을 뽑아 AI가 직접 보고 분석해요. 내 릴스는 첫 3초·고칠 점을, 참고 릴스는 잘 된 이유·구조·내 채널 적용 아이디어를 알려 줘요. (무료 Gemini, 맥에서 처리)</p>
        </div>
      </div>
      <StudyBoard initial={JSON.parse(JSON.stringify(list))} categories={STUDY_CATEGORIES} />
    </div>
  );
}
