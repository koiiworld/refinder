// 맥에서 내보낼 때 Remotion 번들러가 읽는 입구 (앱 화면에서는 쓰지 않음)
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { Edit } from "./Edit";
import { editDuration, outSize, type EditProps } from "./edit-types";
import type { ReelProps } from "./types";
import { docDuration } from "./types";

const empty: ReelProps = { doc: { width: 1080, height: 1920, fps: 30, baseVideoId: null, audio: "none", scenes: [], texts: [] }, srcs: {}, fontUrl: "" };

const emptyEdit: EditProps = { doc: { ratio: "9:16", fps: 30, bg: "#000", clips: [], overlays: [], audios: [], texts: [], muteClips: false }, srcs: {}, fontUrl: "" };

const Root: React.FC = () => (
  <>
  <Composition
    id="Edit"
    component={Edit as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={emptyEdit as unknown as Record<string, unknown>}
    calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
      const p = props as unknown as EditProps;
      const [w, h] = outSize(p.doc.ratio, p.scale ?? 1);
      return { durationInFrames: Math.max(1, Math.round(editDuration(p.doc) * p.doc.fps)), fps: p.doc.fps, width: w, height: h };
    }}
  />
  <Composition
    id="Reel"
    component={Reel as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={empty as unknown as Record<string, unknown>}
    calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
      const p = props as unknown as ReelProps;
      return { durationInFrames: Math.max(1, Math.round(docDuration(p.doc) * p.doc.fps)), fps: p.doc.fps, width: p.doc.width, height: p.doc.height };
    }}
  />
  </>
);

registerRoot(Root);
