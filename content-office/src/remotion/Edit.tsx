import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { TextLayer } from "./Reel";
import { clipLen, clipStarts, editDuration, FILTERS, RATIO_SIZE, type Clip, type EditProps } from "./edit-types";

const TR = 0.4; // 전환 길이(초)

function ClipLayer({ c, src, mute }: { c: Clip; src: string; mute: boolean }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tr = Math.min(durationInFrames / 2, Math.round(TR * fps));
  const p = interpolate(frame, [0, tr], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let style: React.CSSProperties = {};
  if (c.transition === "fade") style = { opacity: p };
  if (c.transition === "slide") style = { transform: `translateX(${(1 - p) * 100}%)` };
  if (c.transition === "zoom") style = { transform: `scale(${1.4 - 0.4 * p})`, opacity: p };
  if (c.transition === "wipe") style = { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
  // 키프레임 줌: 클립 처음→끝 배율이 부드럽게 바뀜 (켄번스)
  const z = c.zoom ? interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [c.zoom.from, c.zoom.to], { extrapolateRight: "clamp" }) : 1;
  const media: React.CSSProperties = { width: "100%", height: "100%", objectFit: c.fit, filter: FILTERS[c.filter]?.[1] ?? "none", transform: z !== 1 ? `scale(${z})` : undefined, transformOrigin: c.zoom ? `${c.zoom.x}% ${c.zoom.y}%` : undefined };
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...style }}>
      {c.kind === "image" ? (
        <Img src={src} style={media} />
      ) : (
        <OffthreadVideo src={src} startFrom={Math.round(c.in * fps)} playbackRate={c.speed} volume={mute ? 0 : c.volume} muted={mute || c.volume === 0} style={media} />
      )}
    </AbsoluteFill>
  );
}

export const Edit: React.FC<EditProps> = ({ doc, srcs, fontUrl, scale = 1 }) => {
  const [BW, BH] = RATIO_SIZE[doc.ratio] ?? [1080, 1920];
  const { fps } = useVideoConfig();
  const starts = clipStarts(doc);
  const total = Math.round(editDuration(doc) * fps);
  return (
    <AbsoluteFill style={{ background: doc.bg || "#000" }}>
      {/* 내용은 기준 크기(1080 폭)로 그리고 내보낼 해상도만큼 키움 */}
      <div style={{ position: "absolute", left: 0, top: 0, width: BW, height: BH, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "0 0" }}>
      {fontUrl && <style>{`@font-face { font-family: 'ReelFont'; src: url('${fontUrl}'); font-weight: 100 900; }`}</style>}
      {doc.clips.map((c, i) => {
        const src = srcs[c.src];
        if (!src) return null;
        return (
          <Sequence key={c.id} from={Math.round(starts[i] * fps)} durationInFrames={Math.max(1, Math.round(clipLen(c) * fps))} name={`클립 ${i + 1}`}>
            <ClipLayer c={c} src={src} mute={doc.muteClips} />
          </Sequence>
        );
      })}
      {doc.overlays.map((o) => {
        const src = srcs[o.src];
        if (!src) return null;
        const [W] = RATIO_SIZE[doc.ratio];
        return (
          <Sequence key={o.id} from={Math.round(o.start * fps)} durationInFrames={Math.max(1, Math.round(o.dur * fps))} name="오버레이">
            <div style={{ position: "absolute", left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, transform: "translate(-50%, -50%)", opacity: o.opacity, borderRadius: (o.radius / 100) * W * 0.1, overflow: "hidden" }}>
              {o.kind === "image" ? <Img src={src} style={{ width: "100%", display: "block" }} /> : <OffthreadVideo src={src} startFrom={Math.round(o.in * fps)} volume={o.volume} muted={o.volume === 0} style={{ width: "100%", display: "block" }} />}
            </div>
          </Sequence>
        );
      })}
      {doc.audios.map((a) => {
        const src = srcs[a.src];
        if (!src) return null;
        return (
          <Sequence key={a.id} from={Math.round(a.start * fps)} durationInFrames={Math.max(1, Math.round(a.dur * fps))} name={a.label || "오디오"}>
            <Audio src={src} startFrom={Math.round(a.in * fps)} volume={a.volume} />
          </Sequence>
        );
      })}
      {doc.texts.map((t) => {
        const from = Math.max(0, Math.round(t.start * fps));
        if (from >= total) return null;
        return (
          <Sequence key={t.id} from={from} durationInFrames={Math.max(1, Math.min(total - from, Math.round((t.end - t.start) * fps)))} name={t.text.slice(0, 20)}>
            <TextLayer t={t} />
          </Sequence>
        );
      })}
      </div>
    </AbsoluteFill>
  );
};
