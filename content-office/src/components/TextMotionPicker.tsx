"use client";

import { TEXT_IN, TEXT_LOOP, TEXT_OUT, type ReelTextStyle } from "@/remotion/types";

/** 글자 움직임 고르기 (릴스 편집·영상 편집 공용): 등장 · 계속 · 사라질 때 + ▶ 효과 보기 */
export default function TextMotionPicker({ s, onStyle, onPreview, chip = "seg" }: { s: ReelTextStyle; onStyle: (p: Partial<ReelTextStyle>) => void; onPreview?: () => void; chip?: "seg" | "cut-chips" }) {
  const row = (label: string, list: [string, string][], cur: string, set: (v: string) => void) => (
    <div className="stack" style={{ gap: 3 }}>
      <span className="tiny muted">{label}</span>
      <div className={chip} style={{ flexWrap: "wrap" }}>
        {list.map(([v, l]) => <button key={v} type="button" className={cur === v ? "on" : ""} onClick={() => set(v)}>{l}</button>)}
      </div>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 6 }}>
      {row("✨ 나타날 때", TEXT_IN, s.anim ?? "none", (v) => onStyle({ anim: v as ReelTextStyle["anim"] }))}
      {row("🔁 떠 있는 동안", TEXT_LOOP, s.loop ?? "none", (v) => onStyle({ loop: v as ReelTextStyle["loop"] }))}
      {row("👋 사라질 때", TEXT_OUT, s.out ?? "none", (v) => onStyle({ out: v as ReelTextStyle["out"] }))}
      {onPreview && <button type="button" className={chip === "seg" ? "btn btn-sm" : "cut-btn"} style={{ alignSelf: "flex-start" }} onClick={onPreview}>▶ 이 글자 효과 보기</button>}
    </div>
  );
}
