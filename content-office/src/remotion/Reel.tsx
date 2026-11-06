import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "remotion";
import type { ReelBg, ReelProps, ReelText } from "./types";
import { docDuration, sceneStarts } from "./types";

/** 배경 */
function Bg({ bg }: { bg: ReelBg }) {
  if (bg.type === "color") return <AbsoluteFill style={{ background: bg.color }} />;
  if (bg.type === "gradient") return <AbsoluteFill style={{ background: `linear-gradient(${bg.angle}deg, ${bg.colors[0]}, ${bg.colors[1]})` }} />;
  if (bg.type === "aurora") {
    const c = bg.colors;
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 40% at 20% 15%, ${c[0]} 0%, transparent 70%), radial-gradient(55% 45% at 85% 35%, ${c[1] ?? c[0]} 0%, transparent 70%), radial-gradient(70% 50% at 40% 90%, ${c[2] ?? c[0]} 0%, transparent 70%), ${c[3] ?? "#120a1f"}`,
        }}
      />
    );
  }
  return <AbsoluteFill style={{ background: "#000" }} />;
}

/** 한 줄 맞춤: 대충 글자 폭을 계산해 넘치면 글자 크기를 줄임 (한글 1em, 영문·숫자 0.58em) */
export function fittedSize(t: ReelText) {
  if (!t.style.fit) return t.style.size;
  const lines = t.text.split("\n");
  const em = Math.max(...lines.map((l) => Array.from(l).reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.58), 0)), 1);
  const pad = t.style.box ? 0.8 : 0;
  return Math.max(16, Math.min(t.style.size, Math.floor(t.style.width / (em + pad))));
}

export function TextLayer({ t }: { t: ReelText }) {
  const s = t.style;
  const size = fittedSize(t);
  return (
    <div
      style={{
        position: "absolute",
        left: s.x - s.width / 2,
        top: s.y,
        width: s.width,
        transform: `translateY(-50%) rotate(${s.rotate}deg)`,
        textAlign: s.align,
        fontFamily: "ReelFont, 'Noto Sans KR', sans-serif",
        fontWeight: s.bold ? 800 : 500,
        fontSize: size,
        lineHeight: 1.25,
        color: s.color,
        whiteSpace: s.fit ? "pre" : "pre-wrap",
        wordBreak: "keep-all",
      }}
    >
      <span
        style={{
          background: s.box || undefined,
          padding: s.box ? `${size * 0.12}px ${size * 0.35}px` : undefined,
          borderRadius: s.box ? size * 0.2 : undefined,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          WebkitTextStroke: s.stroke && !s.box ? `${Math.max(2, size * 0.06)}px ${s.stroke}` : undefined,
          paintOrder: "stroke fill",
        }}
      >
        {t.text}
      </span>
    </div>
  );
}

export const Reel: React.FC<ReelProps> = ({ doc, srcs, fontUrl }) => {
  const fps = doc.fps;
  const starts = sceneStarts(doc);
  const total = Math.round(docDuration(doc) * fps);
  const baseSrc = doc.baseVideoId ? srcs[doc.baseVideoId] : undefined;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {fontUrl && <style>{`@font-face { font-family: 'ReelFont'; src: url('${fontUrl}'); font-weight: 100 900; }`}</style>}
      {doc.scenes.map((s, i) => {
        const from = Math.round(starts[i] * fps);
        const dur = Math.max(1, Math.round(s.dur * fps));
        const vid = s.video.videoId ?? doc.baseVideoId;
        const src = vid ? srcs[vid] : undefined;
        const card = s.bg.type !== "none";
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.label || `장면 ${i + 1}`}>
            <Bg bg={s.bg} />
            {src && (
              <AbsoluteFill style={card ? { padding: "12% 8%", justifyContent: "center", alignItems: "center" } : undefined}>
                <OffthreadVideo
                  src={src}
                  muted
                  startFrom={Math.round((s.video.videoId ? s.video.from : s.audioFrom) * fps)}
                  style={card ? { width: "100%", height: "100%", objectFit: "contain", borderRadius: 36 } : { width: "100%", height: "100%", objectFit: s.fit }}
                />
              </AbsoluteFill>
            )}
            {doc.audio === "base" && baseSrc && <Audio src={baseSrc} startFrom={Math.round(s.audioFrom * fps)} />}
          </Sequence>
        );
      })}
      {doc.texts.map((t) => {
        const from = Math.max(0, Math.round(t.start * fps));
        const dur = Math.max(1, Math.min(total - from, Math.round((t.end - t.start) * fps)));
        if (from >= total) return null;
        return (
          <Sequence key={t.id} from={from} durationInFrames={dur} name={t.text.slice(0, 20)}>
            <TextLayer t={t} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
