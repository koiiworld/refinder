"use client";

import { useState } from "react";
import { api } from "@/components/client-utils";
import RefPicker from "@/components/RefPicker";

type Kit = { refs: string[]; style: string; soulId: string | null; on: boolean };

/** 🎨 블로그 이미지 컨셉 키트: 레퍼런스 사진 + 스타일 문구 + 내 캐릭터 → 이미지 만들 때마다 자동으로 붙음 */
export default function KitCard({ blogId, initial, souls }: { blogId: string; initial: Kit; souls: { id: string; name: string; version: string }[] }) {
  const [kit, setKit] = useState(initial);
  const [style, setStyle] = useState(initial.style);
  const [msg, setMsg] = useState("");
  async function save(patch: Partial<Kit>) {
    try {
      setKit(await api<Kit>(`/api/blogs/${blogId}/kit`, "PUT", patch));
      setMsg("저장했어요.");
      setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <section id="kit" className="card">
      <div className="card-head">
        <h2>🎨 이미지 컨셉 키트</h2>
        <div className="row" style={{ gap: 6 }}>
          {msg && <span className="badge badge-ok">{msg}</span>}
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={kit.on} onChange={(e) => save({ on: e.target.checked })} /> 켜기</label>
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <p className="tiny muted">여기 넣은 사진·문구는 이 블로그 글의 이미지를 만들 때마다 자동으로 같이 보내요. 그래서 매번 같은 그림체·색감·캐릭터로 나와요. 레퍼런스 1장당 Gemini 약 $0.001 (₩2), ChatGPT 약 $0.016 (₩24)가 더 들고, Higgsfield는 추가 요금이 없어요.</p>
        <RefPicker ids={kit.refs} max={5} label="레퍼런스 사진" onChange={(ids) => save({ refs: ids })} />
        <label className="field">
          <span className="label">스타일 문구 (한국어 OK)</span>
          <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
            <input className="input" value={style} maxLength={500} placeholder="예: 파스텔 톤 수채화 일러스트, 따뜻한 조명, 둥근 선" onChange={(e) => setStyle(e.target.value)} />
            <button className="btn btn-sm btn-primary" disabled={style === kit.style} onClick={() => save({ style })}>저장</button>
          </div>
        </label>
        <label className="row small" style={{ gap: 6 }}>
          기본 캐릭터 (Higgsfield Soul ID)
          <select className="select" style={{ maxWidth: 240 }} value={kit.soulId ?? ""} onChange={(e) => save({ soulId: e.target.value || null })}>
            <option value="">없음</option>
            {souls.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.version})</option>)}
          </select>
          <a className="tiny" href="/settings#souls" style={{ color: "var(--accent)" }}>캐릭터 만들기</a>
        </label>
      </div>
    </section>
  );
}
