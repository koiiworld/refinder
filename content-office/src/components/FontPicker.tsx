"use client";

import { useEffect, useRef, useState } from "react";
import { fontFamily, REEL_FONTS } from "@/remotion/types";

/** 공용: 무료 한글 글꼴 38종 고르기(팝업 미리보기) · HEX 색 입력 — 릴스 편집·썸네일 공장 */
export const GLOWS: [string, string][] = [["#ff5fa2", "핑크"], ["#ff2d55", "빨강"], ["#ff9f0a", "주황"], ["#ffd60a", "노랑"], ["#30d158", "초록"], ["#64d2ff", "하늘"], ["#7b93ff", "파랑"], ["#bf5af2", "보라"], ["#ffffff", "흰빛"], ["#000000", "검은 그림자"]];

/** 색 고르기 + HEX 직접 입력 (#fff, fff, #ffcc00 모두 됨) */
export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [txt, setTxt] = useState(value.toUpperCase());
  useEffect(() => { setTxt(value.toUpperCase()); }, [value]);
  const commit = (v: string) => {
    let h = v.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
    if (/^[0-9a-f]{6}$/i.test(h)) onChange(`#${h.toLowerCase()}`);
    else setTxt(value.toUpperCase());
  };
  return (
    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} 고르기`} />
      <input className="input mono" style={{ width: 92, padding: "2px 6px" }} value={txt} onChange={(e) => { setTxt(e.target.value); if (/^#?([0-9a-f]{6})$/i.test(e.target.value.trim())) commit(e.target.value); }} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} placeholder="#FFFFFF" aria-label={`${label} HEX`} />
    </div>
  );
}

/** 글꼴 고르기: 열면 목록의 이름이 각 글꼴 모양으로 보임 (구글 폰트에서 이름 글자만 받아 가볍게) */
export function FontPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const cur = REEL_FONTS.find((f) => f.id === value) ?? REEL_FONTS[0];
  useEffect(() => {
    // 미리보기용 글꼴: 모든 글꼴 이름 글자만 담은 아주 작은 파일
    if (document.getElementById("reel-font-preview")) return;
    const text = Array.from(new Set(Array.from(REEL_FONTS.map((f) => f.label).join("") + "가나다라 AaBb123"))).join("");
    const l = document.createElement("link");
    l.id = "reel-font-preview"; l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?${REEL_FONTS.map((f) => `family=${encodeURIComponent(f.family)}`).join("&")}&text=${encodeURIComponent(text)}&display=swap`;
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  const list = REEL_FONTS.filter((f) => !q.trim() || f.label.includes(q.trim()) || f.family.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div ref={box} style={{ position: "relative", flex: 1 }}>
      <button type="button" className="input" style={{ textAlign: "left", fontFamily: `'${cur.family}', ${fontFamily(cur.id)}`, fontSize: 18, cursor: "pointer" }} onClick={() => setOpen((o) => !o)} aria-label="글꼴" aria-expanded={open}>{cur.label} ▾</button>
      {open && (
        <div className="reel-font-pop" role="listbox" style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, marginTop: 4, maxHeight: 360, overflowY: "auto", background: "var(--panel, #1f1e27)", border: "1px solid var(--border, #333)", borderRadius: 10, padding: 6, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`글꼴 ${REEL_FONTS.length}개 중 찾기`} aria-label="글꼴 찾기" style={{ marginBottom: 6 }} />
          {list.map((f) => (
            <button key={f.id} type="button" role="option" aria-selected={f.id === value} onClick={() => { onPick(f.id); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 8, border: 0, cursor: "pointer", background: f.id === value ? "var(--accent-soft)" : "transparent", color: "inherit", fontFamily: `'${f.family}', sans-serif`, fontSize: 20, lineHeight: 1.3 }}>
              {f.label}
            </button>
          ))}
          <p className="tiny muted" style={{ margin: "6px 4px 0", fontFamily: "inherit" }}>모두 무료(OFL) 글꼴이라 영상에 써도 돼요. 처음 고른 글꼴은 받는 데 몇 초 걸려요.</p>
        </div>
      )}
    </div>
  );
}

