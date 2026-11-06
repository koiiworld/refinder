import { listBlogs } from "@/lib/repo";
import { ensureRuns, listRoutines, listRuns, ROUTINE_CATS } from "@/lib/routines";
import { kstToday, telegramConnected } from "@/lib/todos";
import RoutineBoard from "./RoutineBoard";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  await ensureRuns().catch(() => {});
  const [routines, today, blogs] = await Promise.all([listRoutines(), listRuns({ from: kstToday(), to: kstToday() }), listBlogs()]);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>🔁 루틴 관리</h1>
          <p className="sub">매일·매주·매월 하는 반복 업무를 한 번 등록하면, 그날 할 일을 자동으로 만들고 정한 시각에 텔레그램으로 알려 줘요. 완료할 때까지 설정대로 다시 알려요. (브라우저를 닫아도 서버가 보내요)</p>
        </div>
      </div>
      <RoutineBoard initialRoutines={JSON.parse(JSON.stringify(routines))} initialToday={JSON.parse(JSON.stringify(today))} blogs={blogs.map((b) => ({ id: b.id, name: b.name }))} cats={ROUTINE_CATS.map((c) => ({ id: c.id, label: c.label }))} telegram={telegramConnected()} />
    </div>
  );
}
