import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="card empty stack" style={{ alignItems: "center" }}>
        <h1 style={{ fontSize: 18 }}>페이지를 찾을 수 없습니다</h1>
        <Link className="btn" href="/">대시보드로</Link>
      </div>
    </div>
  );
}
