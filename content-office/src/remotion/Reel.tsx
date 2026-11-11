import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReelBg, ReelProps, ReelText } from "./types";
import { docDuration, faceKey, fontFaces, fontFamily, sceneStarts } from "./types";

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

/** 사진 장면: 화면 가득(또는 카드) + 천천히 확대 */
function Photo({ src, fit, kenburns, card, dur }: { src: string; fit: "cover" | "contain"; kenburns?: boolean; card: boolean; dur: number }) {
  const frame = useCurrentFrame();
  const z = kenburns === false ? 1 : interpolate(frame, [0, Math.max(1, dur)], [1, 1.12], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={card ? { padding: "12% 8%", justifyContent: "center", alignItems: "center" } : undefined}>
      <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: card ? 36 : 0 }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: card ? "contain" : fit, transform: `scale(${z})` }} />
      </div>
    </AbsoluteFill>
  );
}

/** 한 줄 맞춤: 대충 글자 폭을 계산해 넘치면 글자 크기를 줄임 (한글 1em, 영문·숫자 0.58em) */
export function fittedSize(t: ReelText) {
  if (!t.style.fit) return t.style.size;
  const lines = t.text.split("\n");
  const em = Math.max(...lines.map((l) => Array.from(l).reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.58), 0)), 1);
  const pad = t.style.box ? 0.8 : 0;
  return Math.max(16, Math.min(t.style.size, Math.floor(t.style.width / (em + pad))));
}

/** 등장 효과: 자막이 나타나는 순간의 움직임 (Sequence 안에서 0프레임부터) */
function useAnim(anim: string | undefined, text: string) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (damping: number) => spring({ frame, fps, config: { damping, stiffness: 180, mass: 0.6 } });
  switch (anim) {
    case "fade":
      return { style: { opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }) }, text };
    case "pop":
      return { style: { transform: `scale(${interpolate(sp(12), [0, 1], [0.6, 1])})`, opacity: interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" }) }, text };
    case "slide":
      return { style: { transform: `translateY(${interpolate(sp(16), [0, 1], [60, 0])}px)`, opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }, text };
    case "bounce":
      return { style: { transform: `scale(${interpolate(sp(5), [0, 1], [0.3, 1])})` }, text };
    case "type": {
      const chars = Array.from(text);
      const n = Math.min(chars.length, Math.floor((frame / fps) * 18) + 1); // 1초에 18글자
      return { style: {}, text: chars.slice(0, n).join("") };
    }
    default:
      return { style: {}, text };
  }
}

export function TextLayer({ t }: { t: ReelText }) {
  const s = t.style;
  const size = fittedSize(t);
  const a = useAnim(s.anim, t.text);
  return (
    <div
      style={{
        position: "absolute",
        left: s.x - s.width / 2,
        top: s.y,
        width: s.width,
        transform: `translateY(-50%) rotate(${s.rotate}deg)`,
        textAlign: s.align,
        fontFamily: `${fontFamily(s.font)}, ReelFont, 'Noto Sans KR', sans-serif`,
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
          display: "inline-block",
          ...a.style,
          background: s.box || undefined,
          padding: s.box ? `${size * 0.12}px ${size * 0.35}px` : undefined,
          borderRadius: s.box ? size * 0.2 : undefined,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          WebkitTextStroke: s.stroke && !s.box ? `${Math.max(2, size * 0.06)}px ${s.stroke}` : undefined,
          paintOrder: "stroke fill",
          textShadow: s.glow ? glowShadow(s.glow, size, s.glowSize ?? 1) : undefined,
        }}
      >
        {a.text}
      </span>
    </div>
  );
}

/** 글자 빛: 세기(0.3~3)에 따라 번짐 크기·겹 수 */
function glowShadow(c: string, size: number, g: number) {
  const k = Math.min(3, Math.max(0.3, g));
  const layers = [0.15, 0.3, 0.6].slice(0, k >= 1.5 ? 3 : 2);
  return layers.map((r) => `0 0 ${Math.round(size * r * k)}px ${c}`).join(", ");
}

export const Reel: React.FC<ReelProps> = ({ doc, srcs, fontUrl, fontUrls }) => {
  const fps = doc.fps;
  const starts = sceneStarts(doc);
  const total = Math.round(docDuration(doc) * fps);
  const baseSrc = doc.baseVideoId ? srcs[doc.baseVideoId] : undefined;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {fontUrl && <style>{`@font-face { font-family: 'ReelFont'; src: url('${fontUrl}'); font-weight: 100 900; }` + fontFaces().map(({ id, w }) => { const u = fontUrls?.[faceKey(id, w)] ?? (id === "noto" ? fontUrl : ""); return u ? `@font-face { font-family: '${fontFamily(id)}'; src: url('${u}'); font-weight: ${w || "100 900"}; }` : ""; }).join("")}</style>}
      {doc.scenes.map((s, i) => {
        const from = Math.round(starts[i] * fps);
        const dur = Math.max(1, Math.round(s.dur * fps));
        const vid = s.video.videoId ?? doc.baseVideoId;
        const src = vid ? srcs[vid] : undefined;
        const card = s.bg.type !== "none";
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.label || `장면 ${i + 1}`}>
            <Bg bg={s.bg} />
            {s.image && <Photo src={srcs[s.image] ?? s.image} fit={s.fit} kenburns={s.kenburns} card={card} dur={dur} />}
            {!s.image && src && (
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
      {(doc.overlays ?? []).map((o) => {
        const from = Math.max(0, Math.round(o.start * fps));
        const dur = Math.max(1, Math.min(total - from, Math.round((o.end - o.start) * fps)));
        const src = o.image ? srcs[o.image] ?? o.image : o.videoId ? srcs[o.videoId] : undefined;
        if (from >= total || !src) return null;
        return (
          <Sequence key={o.id} from={from} durationInFrames={dur} name="위에 얹기">
            <div style={{ position: "absolute", left: o.x, top: o.y, width: o.w, height: o.h, borderRadius: o.radius, overflow: "hidden" }}>
              {o.image ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: o.fit }} /> : <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: o.fit }} />}
            </div>
          </Sequence>
        );
      })}
      {doc.music?.videoId && srcs[doc.music.videoId] && <Audio src={srcs[doc.music.videoId]} startFrom={Math.round((doc.music.from || 0) * fps)} volume={doc.music.volume ?? 0.8} />}
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
