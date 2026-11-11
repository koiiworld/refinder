"use client";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import type { Carousel, Slide } from "@/lib/carousel";
import { CARD_MOTIONS } from "@/lib/carousel-video-types";

const FAILED = ["failed", "nsfw", "canceled", "error"];

/** 🎬 카드 사진 → AI 영상 (음식이 실제로 움직임: 끓기·김·면 들어올리기…) — 버튼·비용 확인 후에만 */
export default function CardVideoBox({ carouselId, index, slide, slides, disabled, onCarousel, onZoom }: { carouselId: string; index: number; slide: Slide; slides: Slide[]; disabled: boolean; onCarousel: (c: Carousel) => void; onZoom?: () => void }) {
  const v = slide.video;
  const [open, setOpen] = useState(false);
  const [motions, setMotions] = useState<string[]>(["boil", "steam"]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const working = !!v && !v.url && !FAILED.includes(v.status);
  if (slide.image == null && !v) return null;

  async function start() {
    setBusy(true); setErr("");
    try {
      const est = await api<{ usd: number | null; seconds: number; model: string }>(`/api/carousels/${carouselId}`, "POST", { action: "card_video_estimate", index, motions });
      const picked = CARD_MOTIONS.filter((m) => motions.includes(m.id)).map((m) => m.label).join(", ");
      if (!confirm(`${index + 1}장 사진을 AI 영상으로 만들까요?\n움직임: ${[picked, custom.trim()].filter(Boolean).join(" · ") || "자연스러운 움직임"}\n${est.model} · ${est.seconds}초\n예상 비용: ${est.usd == null ? "계산할 수 없어요" : fmtUsd(est.usd)} (추정치)\n1~3분 걸려요.`)) return;
      onCarousel(await api<Carousel>(`/api/carousels/${carouselId}`, "POST", { action: "card_video", index, motions, custom, slides, confirm: true }));
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  async function remove() {
    if (!confirm(`${index + 1}장의 AI 영상을 뺄까요? (사진 카드로 돌아가요. 다시 만들면 비용이 다시 들어요)`)) return;
    try { onCarousel(await api<Carousel>(`/api/carousels/${carouselId}`, "POST", { action: "card_video_remove", index })); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="stack" style={{ gap: 6, padding: 8, border: "1px dashed var(--line)", borderRadius: 8 }}>
      {v?.url ? (
        <>
          <div className="row between" style={{ gap: 6 }}><span className="small">🎬 AI 영상 · {v.prompt || "움직임"}</span><button className="btn btn-sm btn-ghost" disabled={disabled} onClick={() => void remove()}>영상 빼기</button></div>
          <video src={`/api/carousels/${carouselId}/video/${v.jobId}`} muted loop autoPlay playsInline title="누르면 글자와 함께 크게 봐요" onClick={onZoom} style={{ width: "100%", borderRadius: 6, background: "#000", cursor: onZoom ? "zoom-in" : undefined }} onError={() => setErr("영상 주소가 만료됐을 수 있어요. '영상 빼기' 후 다시 만들어 주세요.")} />
          <span className="tiny muted">'🎞 모션 캐러셀'에서 영상을 만들면 이 영상 위에 글자를 얹어 내보내요.</span>
        </>
      ) : working ? (
        <div className="row" style={{ gap: 6 }}><span className="spinner" /><span className="small">🎬 AI 영상 만드는 중… (1~3분, 자동으로 확인해요)</span></div>
      ) : (
        <>
          {v && FAILED.includes(v.status) && <div className="row between"><span className="small notice notice-bad" style={{ margin: 0 }}>AI 영상 실패: {v.error || v.status}</span><button className="btn btn-sm btn-ghost" onClick={() => void remove()}>지우기</button></div>}
          {!open ? (
            <button className="btn btn-sm" disabled={disabled || busy || slide.image == null} onClick={() => setOpen(true)}>🎬 AI로 음식 움직이게 (약 $0.5)</button>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <span className="tiny muted">사진 속 음식이 실제로 움직이는 5초 영상을 만들어요. 움직임을 골라 주세요 (여러 개 가능).</span>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {CARD_MOTIONS.map((m) => {
                  const on = motions.includes(m.id);
                  return <button key={m.id} type="button" className={`btn btn-sm ${on ? "btn-primary" : ""}`} aria-pressed={on} onClick={() => setMotions(on ? motions.filter((x) => x !== m.id) : [...motions, m.id].slice(0, 4))}>{m.label}</button>;
                })}
              </div>
              <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="직접 적기 (선택) 예: 국자로 국물을 한 번 떠올리기" aria-label={`${index + 1}장 움직임 직접 적기`} />
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-primary" disabled={disabled || busy || (!motions.length && !custom.trim())} onClick={() => void start()}>{busy ? <span className="spinner" /> : "🎬 만들기 (비용 확인)"}</button>
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setOpen(false)}>닫기</button>
              </div>
            </div>
          )}
        </>
      )}
      {err && <p className="small notice notice-bad" role="alert" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}
