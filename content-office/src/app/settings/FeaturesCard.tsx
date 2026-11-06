"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { MENU_GROUPS, MENU_TOP } from "@/lib/menu";

/** 기능 켜기·끄기: 그룹 전체(예: 인스타 전체) 또는 페이지 하나(예: 블로그 진단) — 끄면 메뉴·현황에서 숨김, 데이터는 그대로 */
export default function FeaturesCard({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [off, setOff] = useState(initial);
  const [msg, setMsg] = useState("");
  async function toggle(key: string) {
    const next = off.includes(key) ? off.filter((x) => x !== key) : [...off, key];
    setOff(next);
    try {
      setOff((await api<{ off: string[] }>("/api/settings/features", "POST", { off: next })).off);
      setMsg("저장했어요.");
      setTimeout(() => setMsg(""), 1500);
      router.refresh();
    } catch (e) {
      setOff(off);
      setMsg((e as Error).message);
    }
  }
  const Switch = ({ k, label, disabled }: { k: string; label: string; disabled?: boolean }) => {
    const on = !off.includes(k);
    return (
      <button type="button" role="switch" aria-checked={on && !disabled} aria-label={`${label} ${on ? "켜짐" : "꺼짐"}`} className={`switch${on && !disabled ? " on" : ""}`} disabled={disabled} onClick={() => toggle(k)}>
        <span />
      </button>
    );
  };
  return (
    <section id="features" className="card">
      <div className="card-head"><h2>기능 켜기·끄기</h2>{msg && <span className="badge badge-ok">{msg}</span>}</div>
      <p className="tiny muted card-pad" style={{ paddingBottom: 0 }}>끈 기능은 메뉴와 전체 작업 현황에서 숨겨져요. 만들어 둔 글·캐러셀·영상은 지워지지 않고, 다시 켜면 그대로 보여요.</p>
      <div className="list">
        <div className="list-item row between" style={{ flexWrap: "nowrap" }}>
          <span className="strong small">{MENU_TOP.label}</span>
          <Switch k={MENU_TOP.href} label={MENU_TOP.label} />
        </div>
        {MENU_GROUPS.map((g) => {
          const gOff = off.includes(`g:${g.id}`);
          return (
            <div key={g.id} className="list-item" style={{ display: "block" }}>
              <div className="row between" style={{ flexWrap: "nowrap" }}>
                <span className="strong small">{g.label} <span className="tiny muted">전체</span></span>
                <Switch k={`g:${g.id}`} label={`${g.label} 전체`} />
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 8, paddingLeft: 14, borderLeft: "2px solid var(--line)", opacity: gOff ? 0.5 : 1 }}>
                {g.items.map((it) => (
                  <div key={it.href} className="row between" style={{ flexWrap: "nowrap" }}>
                    <span className="small">{it.label} <span className="tiny muted">{it.sub}</span></span>
                    <Switch k={it.href} label={`${g.label} ${it.label}`} disabled={gOff} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
