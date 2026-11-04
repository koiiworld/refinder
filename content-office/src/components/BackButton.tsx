import Link from "next/link";

/** 상세 화면 왼쪽 위 '뒤로' 버튼 — 항상 해당 목록 화면으로 돌아감 */
export default function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 6, marginBottom: 4 }}>
      ← {label}
    </Link>
  );
}
