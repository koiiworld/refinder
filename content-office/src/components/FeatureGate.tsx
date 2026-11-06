"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isOffPath } from "@/lib/menu";

/** 설정에서 끈 기능의 페이지로 들어오면 내용 대신 안내 (데이터는 그대로 남아 있음) */
export default function FeatureGate({ off, children }: { off: string[]; children: React.ReactNode }) {
  const path = usePathname();
  if (!isOffPath(off, path)) return <>{children}</>;
  return (
    <div className="page">
      <div className="card empty stack" style={{ gap: 10, alignItems: "center" }}>
        <b>이 기능은 꺼져 있어요</b>
        <span className="small muted">설정 &gt; 기능 켜기·끄기에서 다시 켜면 만들어 둔 내용이 그대로 보여요.</span>
        <Link className="btn btn-primary btn-sm" href="/settings#features">설정에서 켜기</Link>
      </div>
    </div>
  );
}
