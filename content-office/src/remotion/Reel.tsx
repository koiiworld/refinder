import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReelBg, ReelProps, ReelText, ReelTextStyle } from "./types";
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

/**
 * 글자 움직임 (Sequence 안에서 0프레임부터, dur = 이 글자가 보이는 프레임 수)
 * - 등장(anim): 처음 0.5초쯤 · 계속(loop): 보이는 내내 · 사라질 때(out): 마지막 0.35초
 * - 글자별 효과(한 글자씩·물결·콩콩)는 글자마다 따로 움직임
 */
const PER_CHAR_IN = new Set(["letters", "lettersPop", "lettersRain"]);
const PER_CHAR_LOOP = new Set(["wave", "jump"]);

function useMotion(s: ReelTextStyle, text: string, size: number, dur: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (damping: number, delay = 0) => spring({ frame: frame - delay, fps, config: { damping, stiffness: 180, mass: 0.6 } });
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const tr: string[] = [];
  let opacity = 1;
  let blur = 0;
  let shown = text;
  // 등장
  switch (s.anim) {
    case "fade": opacity *= interpolate(frame, [0, 8], [0, 1], clamp); break;
    case "pop": tr.push(`scale(${interpolate(sp(12), [0, 1], [0.6, 1])})`); opacity *= interpolate(frame, [0, 4], [0, 1], clamp); break;
    case "slide": tr.push(`translateY(${interpolate(sp(16), [0, 1], [60, 0])}px)`); opacity *= interpolate(frame, [0, 6], [0, 1], clamp); break;
    case "bounce": tr.push(`scale(${interpolate(sp(5), [0, 1], [0.3, 1])})`); break;
    case "type": { const chars = Array.from(text); shown = chars.slice(0, Math.min(chars.length, Math.floor((frame / fps) * 18) + 1)).join(""); break; }
    case "flyLeft": tr.push(`translateX(${interpolate(sp(14), [0, 1], [-1300, 0])}px)`); break;
    case "flyRight": tr.push(`translateX(${interpolate(sp(14), [0, 1], [1300, 0])}px)`); break;
    case "flyTop": tr.push(`translateY(${interpolate(sp(9), [0, 1], [-900, 0])}px)`); break;
    case "zoomIn": tr.push(`scale(${interpolate(sp(14), [0, 1], [3.2, 1])})`); opacity *= interpolate(frame, [0, 6], [0, 1], clamp); break;
    case "spin": tr.push(`rotate(${interpolate(sp(13), [0, 1], [-360, 0])}deg) scale(${interpolate(sp(13), [0, 1], [0.2, 1])})`); break;
    case "blurIn": blur += interpolate(frame, [0, 12], [size * 0.35, 0], clamp); opacity *= interpolate(frame, [0, 10], [0, 1], clamp); break;
    case "swingIn": tr.push(`rotate(${interpolate(sp(4), [0, 1], [-25, 0])}deg)`); opacity *= interpolate(frame, [0, 5], [0, 1], clamp); break;
  }
  // 계속 (글자 전체)
  const t = frame / fps;
  switch (s.loop) {
    case "float": tr.push(`translateY(${Math.sin(t * Math.PI * 1.6) * size * 0.09}px)`); break;
    case "shake": tr.push(`translate(${Math.sin(frame * 1.7) * size * 0.03}px, ${Math.cos(frame * 2.3) * size * 0.02}px) rotate(${Math.sin(frame * 1.3) * 2}deg)`); break;
    case "pulse": tr.push(`scale(${1 + 0.07 * Math.max(0, Math.sin(t * Math.PI * 2.4))})`); break;
    case "swing": tr.push(`rotate(${Math.sin(t * Math.PI * 1.4) * 6}deg)`); break;
    case "blink": opacity *= 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(t * Math.PI * 3)); break;
  }
  // 사라질 때 (마지막 0.35초)
  const outLen = Math.max(1, Math.min(Math.round(fps * 0.35), Math.floor(dur / 2)));
  const p = s.out && s.out !== "none" ? interpolate(frame, [dur - outLen, dur - 1], [0, 1], clamp) : 0;
  if (p > 0) {
    const e = p * p; // 점점 빨라지게
    switch (s.out) {
      case "fade": opacity *= 1 - p; break;
      case "flyLeft": tr.push(`translateX(${-1300 * e}px)`); break;
      case "flyRight": tr.push(`translateX(${1300 * e}px)`); break;
      case "up": tr.push(`translateY(${-500 * e}px)`); opacity *= 1 - p; break;
      case "down": tr.push(`translateY(${500 * e}px)`); opacity *= 1 - p; break;
      case "zoomOut": tr.push(`scale(${1 - 0.9 * e})`); opacity *= 1 - p * 0.6; break;
      case "spin": tr.push(`rotate(${360 * e}deg) scale(${1 - 0.8 * e})`); break;
      case "blurOut": blur += size * 0.35 * p; opacity *= 1 - p; break;
    }
  }
  // 글자별
  const perChar = PER_CHAR_IN.has(s.anim ?? "") || PER_CHAR_LOOP.has(s.loop ?? "");
  const charStyle = (i: number): React.CSSProperties => {
    const ct: string[] = [];
    let co = 1;
    const d = i * 2.2; // 글자 사이 0.07초
    if (s.anim === "letters") { const v = sp(13, d); ct.push(`translate(${interpolate(v, [0, 1], [size * 1.4, 0])}px, ${interpolate(v, [0, 1], [-size * 0.6, 0])}px) rotate(${interpolate(v, [0, 1], [25, 0])}deg)`); co = interpolate(frame - d, [0, 4], [0, 1], clamp); }
    if (s.anim === "lettersPop") { const v = sp(8, d); ct.push(`scale(${interpolate(v, [0, 1], [0, 1])})`); }
    if (s.anim === "lettersRain") { const v = sp(10, d); ct.push(`translateY(${interpolate(v, [0, 1], [-size * 3, 0])}px)`); co = interpolate(frame - d, [0, 3], [0, 1], clamp); }
    if (s.loop === "wave") ct.push(`translateY(${Math.sin(t * Math.PI * 2 - i * 0.55) * size * 0.12}px)`);
    if (s.loop === "jump") { const ph = (t * 2.2 - i * 0.12) % 1; ct.push(`translateY(${ph < 0.35 ? -Math.sin((ph / 0.35) * Math.PI) * size * 0.22 : 0}px)`); }
    return { display: "inline-block", transform: ct.join(" ") || undefined, opacity: co };
  };
  return { shown, perChar, charStyle, style: { transform: tr.join(" ") || undefined, opacity, filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined } as React.CSSProperties };
}

export function TextLayer({ t, dur = 9999 }: { t: ReelText; dur?: number }) {
  const s = t.style;
  const size = fittedSize(t);
  const a = useMotion(s, t.text, size, dur);
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
        {a.perChar
          ? a.shown.split("\n").map((line, li, arr) => (
              <span key={li}>
                {Array.from(line).map((ch, ci) => {
                  const idx = arr.slice(0, li).reduce((n, l) => n + Array.from(l).length, 0) + ci;
                  return <span key={ci} style={a.charStyle(idx)}>{ch === " " ? "\u00a0" : ch}</span>;
                })}
                {li < arr.length - 1 && <br />}
              </span>
            ))
          : a.shown}
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
                <OffthreadVideo pauseWhenBuffering
                  src={src}
                  muted
                  startFrom={Math.round((s.video.videoId ? s.video.from : s.audioFrom) * fps)}
                  style={card ? { width: "100%", height: "100%", objectFit: "contain", borderRadius: 36 } : { width: "100%", height: "100%", objectFit: s.fit }}
                />
              </AbsoluteFill>
            )}
            {s.sound && s.video.videoId && src && !s.image ? <Audio pauseWhenBuffering src={src} startFrom={Math.round(s.video.from * fps)} /> : doc.audio === "base" && baseSrc && <Audio pauseWhenBuffering src={baseSrc} startFrom={Math.round(s.audioFrom * fps)} />}
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
              {o.image ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: o.fit }} /> : <OffthreadVideo pauseWhenBuffering src={src} muted style={{ width: "100%", height: "100%", objectFit: o.fit }} />}
            </div>
          </Sequence>
        );
      })}
      {doc.music?.videoId && srcs[doc.music.videoId] && <Audio pauseWhenBuffering src={srcs[doc.music.videoId]} startFrom={Math.round((doc.music.from || 0) * fps)} volume={doc.music.volume ?? 0.8} />}
      {doc.texts.map((t) => {
        const from = Math.max(0, Math.round(t.start * fps));
        const dur = Math.max(1, Math.min(total - from, Math.round((t.end - t.start) * fps)));
        if (from >= total) return null;
        return (
          <Sequence key={t.id} from={from} durationInFrames={dur} name={t.text.slice(0, 20)}>
            <TextLayer t={t} dur={dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
