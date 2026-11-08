import Link from "next/link";
import { LEARN_CATEGORIES } from "@/lib/carousel-design-types";
export const dynamic = "force-dynamic";
export default function Learn() {
  return <div className="page stack"><div className="page-head"><div><h1>📚 AI 학습지</h1><p className="sub">마음에 드는 자료를 모으면, AI가 글의 내용·도구·작업 방법을 배우고 다음 작업에 참고해요.</p></div></div>
    <div className="notice small">모델을 재훈련하지 않아요. 실제로 읽은 본문의 핵심 정보·사용 조건·주의점·적용 방법을 저장해요. 이미지와 도표는 필요할 때 함께 읽어요. 후킹 문구는 과장 없이 구체적으로 써요.</div>
    <Link className="btn" href="/learn/tasks">📋 과제물 · 학습 후 할 일과 다음 방향</Link>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:16}}><Link className="card card-pad stack" href="/learn/radar"><h2>📡 트렌드 레이더</h2><p className="small muted">관심 계정의 새 글을 매주 확인 · 본문 지식 학습 · 주당 $1 (₩1,500) 기본 한도</p><span>계정·일정 등록 →</span></Link>{LEARN_CATEGORIES.map(c=><Link key={c.id} className="card card-pad stack" href={`/learn/${c.id}`}><h2>{c.label} 학습</h2><p className="small muted">{c.description}</p><span>자료 넣기 →</span></Link>)}</div>
  </div>;
}
