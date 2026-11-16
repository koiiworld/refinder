"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";

type Hit = { id: string; title: string; creator: string; license: "cc0" | "by"; licenseVersion: string; licenseUrl: string; source: string; preview: string; duration: number | null; page: string; credit: string };
export type PickedMusic = { videoId: string; credit: string; license: "cc0" | "by"; title: string; duration: number | null };

const LIC: Record<"cc0" | "by", string> = { cc0: "CC0 (조건 없이 사용)", by: "CC BY (출처만 적으면 상업 사용 가능)" };
const fmt = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/**
 * 🔍 무료 음원 찾기 (릴스 편집·영상 편집 공용)
 * - CC0·CC BY 만 검색 · ▶ 미리 듣기 · 가져오기 → 앱 저장소에 넣고 onPick
 * dark = 캡컷형 편집기 모양
 */
export default function MusicSearch({ onPick, dark = false }: { onPick: (m: PickedMusic) => void; dark?: boolean }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"music" | "sfx">("music");
  const [lic, setLic] = useState<"all" | "cc0" | "by">("all");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  async function search(p = 1) {
    if (!q.trim()) return;
    setBusy("search"); setErr("");
    try {
      const r = await api<{ hits: Hit[]; pages: number }>(`/api/music/search?q=${encodeURIComponent(q.trim())}&kind=${kind}&license=${lic}&page=${p}`);
      setHits((old) => (p === 1 ? r.hits : [...(old ?? []), ...r.hits])); setPage(p); setPages(r.pages);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  function preview(h: Hit) {
    if (playing === h.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    const a = new Audio(h.preview);
    a.volume = 0.8; a.onended = () => setPlaying(null);
    void a.play().catch(() => setErr("미리 듣기를 못 했어요. 잠시 뒤 다시 눌러 주세요."));
    audio.current = a; setPlaying(h.id);
  }
  async function take(h: Hit) {
    audio.current?.pause(); setPlaying(null);
    setBusy(h.id); setErr("");
    try { onPick(await api<PickedMusic>("/api/music/import", "POST", { id: h.id })); }
    catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  const btn = dark ? "cut-btn" : "btn btn-sm";
  const chips = dark ? "cut-chips" : "seg";
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input className={dark ? "cut-input" : "input"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void search(1); }} placeholder={kind === "music" ? "영어로 찾으면 더 많아요 (예: piano, lofi, happy, acoustic)" : "예: rain, applause, click, whoosh"} aria-label="음원 찾기" />
        <button className={btn} disabled={busy === "search" || !q.trim()} onClick={() => void search(1)}>{busy === "search" ? "찾는 중…" : "🔍 찾기"}</button>
      </div>
      <div className={chips} style={{ flexWrap: "wrap" }}>
        {([["music", "🎵 배경음악"], ["sfx", "🔔 효과음"]] as const).map(([k, l]) => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => { setKind(k); setHits(null); }}>{l}</button>)}
      </div>
      <div className={chips} style={{ flexWrap: "wrap" }}>
        {([["all", "CC0 + CC BY 모두"], ["cc0", LIC.cc0], ["by", LIC.by]] as const).map(([k, l]) => <button key={k} type="button" className={lic === k ? "on" : ""} onClick={() => { setLic(k); setHits(null); }}>{l}</button>)}
      </div>
      {err && <p className={dark ? "cut-note bad" : "notice notice-bad small"} style={{ margin: 0 }}>{err}</p>}
      {hits && (
        <div className="stack" style={{ gap: 4, maxHeight: 280, overflowY: "auto" }}>
          {!hits.length && <span className={dark ? "cut-hint" : "tiny muted"}>찾은 음원이 없어요. 영어로 바꿔 찾아보세요.</span>}
          {hits.map((h) => (
            <div key={h.id} className="row" style={{ gap: 6, flexWrap: "nowrap", padding: "6px 8px", borderRadius: 8, background: dark ? "#2a2a30" : "var(--accent-soft)" }}>
              <button type="button" className={btn} style={{ padding: "4px 8px" }} onClick={() => preview(h)} aria-label={`${h.title} 미리 듣기`}>{playing === h.id ? "■" : "▶"}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 700, fontSize: 13 }} title={h.title}>{h.title}</div>
                <div className={dark ? "cut-hint" : "tiny muted"} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.creator} · {fmt(h.duration)} · <b style={{ color: h.license === "cc0" ? "#22a06b" : "#d97706" }}>{LIC[h.license]}</b>
                </div>
              </div>
              <button type="button" className={dark ? "cut-btn primary" : "btn btn-sm btn-primary"} disabled={!!busy} onClick={() => void take(h)}>{busy === h.id ? "넣는 중…" : "가져오기"}</button>
            </div>
          ))}
          {page < pages && <button className={btn} disabled={!!busy} onClick={() => void search(page + 1)}>더 보기</button>}
        </div>
      )}
      <span className={dark ? "cut-hint" : "tiny muted"}>Openverse 공개 검색 (음악: Jamendo · 효과음: Freesound). 릴스에 써도 되는 CC0·CC BY 만 보여요. CC BY 는 캡션에 출처를 적어야 해서, 가져오면 출처 문구를 만들어 드려요.</span>
    </div>
  );
}
