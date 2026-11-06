"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

type Brand = { name: string; mark: string; color: string };
const PRESETS = ["AI", "📝", "🚀", "🌱", "⭐", "🍳", "💡", "🔥"];

/** 왼쪽 위 로고 아이콘·이름 바꾸기 */
export default function BrandCard({ initial }: { initial: Brand }) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const [msg, setMsg] = useState("");
  async function save(payload: Record<string, unknown>) {
    const r = await api<Brand>("/api/settings/brand", "POST", payload);
    setB(r);
    setMsg("저장했어요.");
    setTimeout(() => setMsg(""), 1500);
    router.refresh();
  }
  return (
    <section className="card">
      <div className="card-head"><h2>로고 · 이름</h2>{msg && <span className="badge badge-ok">{msg}</span>}</div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="tiny muted">미리보기</span>
          <span className="brand" style={{ padding: 0 }}>
            <span className="brand-mark" style={b.color ? { background: b.color, color: "#fff" } : undefined}>{b.mark || "AI"}</span> {b.name || "콘텐츠 오피스"}
          </span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <label className="small stack" style={{ gap: 2 }}>아이콘 (글자 2자·이모지 1개)
            <input className="input" style={{ width: 110 }} value={b.mark} onChange={(e) => setB({ ...b, mark: Array.from(e.target.value).slice(0, 2).join("") })} aria-label="아이콘" />
          </label>
          <label className="small stack" style={{ gap: 2, flex: "1 1 180px" }}>이름 (20자까지)
            <input className="input" maxLength={20} value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} aria-label="이름" />
          </label>
          <label className="small stack" style={{ gap: 2 }}>아이콘 색
            <input type="color" className="input" style={{ width: 60, padding: 2 }} value={b.color || "#3355ff"} onChange={(e) => setB({ ...b, color: e.target.value })} aria-label="아이콘 색" />
          </label>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {PRESETS.map((p) => <button key={p} className="btn btn-sm btn-ghost" onClick={() => setB({ ...b, mark: p })}>{p}</button>)}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={() => save(b)}>저장</button>
          <button className="btn btn-sm btn-ghost" onClick={() => save({ reset: true })}>처음대로</button>
        </div>
      </div>
    </section>
  );
}
