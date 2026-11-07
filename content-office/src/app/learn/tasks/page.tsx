import TasksBoard from "./TasksBoard";
export const dynamic = "force-dynamic";
export default function TasksPage(){return <div className="page stack"><div className="page-head"><div><h1>📋 과제물</h1><p className="sub">학습한 자료에서 뽑은 실천 과제예요. 필요한 것만 골라 진행하세요.</p></div></div><TasksBoard/></div>;}
