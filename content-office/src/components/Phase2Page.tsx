import Link from "next/link";

export default function Phase2Page({ title, desc, items, now }: { title: string; desc: string; items: string[]; now: string[] }) {
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>{title} <span className="badge">2차 개발 예정</span></h1>
          <p className="sub">{desc}</p>
        </div>
      </div>
      <div className="notice notice-warn" style={{ marginBottom: 16 }}>
        이 화면은 아직 구현되지 않았습니다. 아래는 기획안의 기능 목록이며, 실제로 작동하는 기능이 아닙니다.
      </div>
      <div className="grid grid-2">
        <section className="card card-pad stack phase2">
          <h2 style={{ fontSize: 15 }}>예정 기능</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
            {items.map((i) => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
          </ul>
        </section>
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 15 }}>지금 할 수 있는 방법</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
            {now.map((i) => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
          </ul>
          <Link href="/projects" className="btn btn-sm" style={{ alignSelf: "flex-start" }}>프로젝트로 이동</Link>
        </section>
      </div>
    </div>
  );
}
