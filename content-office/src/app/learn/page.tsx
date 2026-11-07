import Link from "next/link";
import { LEARN_CATEGORIES } from "@/lib/carousel-design-types";
export const dynamic = "force-dynamic";
export default function Learn() {
  return <div className="page stack"><div className="page-head"><div><h1>📚 AI 학습지</h1><p className="sub">마음에 드는 자료를 모으면, AI가 배운 원리를 다음 작업에 참고해요.</p></div></div>
    <div className="notice small">모델을 재훈련하지 않아요. 저장한 원칙과 취향을 참고하며, 이번 요청과 블로그별 설정을 우선해요. 후킹 문구는 과장 없이 구체적으로 써요.</div>
    <Link className="btn" href="/learn/tasks">📋 과제물 · 학습 후 할 일과 다음 방향</Link>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:16}}>{LEARN_CATEGORIES.map(c=><Link key={c.id} className="card card-pad stack" href={`/learn/${c.id}`}><h2>{c.label} 학습</h2><p className="small muted">{c.description}</p><span>자료 넣기 →</span></Link>)}</div>
  </div>;
}
