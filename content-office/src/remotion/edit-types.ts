// 🎞 영상 편집 문서 (캡컷형) — 브라우저 미리보기·맥 내보내기 공용 ('@/' 별칭 없이)
import type { ReelText } from "./types";

export type Ratio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
export const RATIO_SIZE: Record<Ratio, [number, number]> = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350], "3:4": [1080, 1440] };

export type Filter = "none" | "bw" | "vivid" | "warm" | "cool" | "vintage" | "bright" | "dark" | "soft";
export const FILTERS: Record<Filter, [string, string]> = {
  none: ["원본", "none"],
  bw: ["흑백", "grayscale(1) contrast(1.1)"],
  vivid: ["선명", "saturate(1.5) contrast(1.1)"],
  warm: ["따뜻하게", "sepia(0.25) saturate(1.2) hue-rotate(-10deg)"],
  cool: ["차갑게", "saturate(1.1) hue-rotate(15deg) brightness(1.02)"],
  vintage: ["빈티지", "sepia(0.55) contrast(0.9) brightness(1.05)"],
  bright: ["밝게", "brightness(1.18) contrast(1.05)"],
  dark: ["어둡게", "brightness(0.82) contrast(1.15)"],
  soft: ["부드럽게", "contrast(0.88) saturate(0.9) brightness(1.06)"],
};
export type Transition = "none" | "fade" | "slide" | "zoom" | "wipe";
export const TRANSITIONS: Record<Transition, string> = { none: "없음", fade: "페이드", slide: "밀기", zoom: "줌", wipe: "닦아내기" };

/** 메인 트랙 클립: 원본(src)의 in~out 구간을 speed 배속으로 */
export type Clip = {
  id: string;
  src: string; // videoId 또는 이미지 아이디(img_…)
  kind: "video" | "image";
  in: number; // 원본 시작(초)
  out: number; // 원본 끝(초) — 이미지는 길이
  speed: number; // 0.25~4
  volume: number; // 0~2
  filter: Filter;
  transition: Transition; // 이 클립이 시작할 때 (앞 클립과 겹치지 않는 간단 전환)
  zoom: { from: number; to: number; x: number; y: number } | null; // 키프레임: 시작→끝 배율 (켄번스)
  fit: "cover" | "contain";
  reversed?: boolean;
};
/** 오버레이: 메인 위에 겹치는 영상·사진 (화면 속 화면) */
export type Overlay = { id: string; src: string; kind: "video" | "image"; start: number; dur: number; in: number; x: number; y: number; w: number; opacity: number; volume: number; radius: number };
/** 오디오: 영상에서 소리만 · 올린 음악 · 음성 */
export type AudioClip = { id: string; src: string; start: number; in: number; dur: number; volume: number; label: string };

export type EditDoc = {
  ratio: Ratio;
  fps: number;
  bg: string;
  clips: Clip[];
  overlays: Overlay[];
  audios: AudioClip[];
  texts: ReelText[];
  muteClips: boolean; // 클립 오디오 음소거
};
export type EditProps = { doc: EditDoc; srcs: Record<string, string>; fontUrl: string; scale?: number };
/** 내보낼 크기 (짝수 정수): 720p 2/3 · 1080p 1 · 2K 4/3 · 4K 2 배 */
export const outSize = (ratio: Ratio, scale = 1): [number, number] => {
  const [w, h] = RATIO_SIZE[ratio] ?? [1080, 1920];
  return [Math.round((w * scale) / 2) * 2, Math.round((h * scale) / 2) * 2];
};

export const clipLen = (c: Clip) => Math.max(0.1, (c.out - c.in) / (c.kind === "image" ? 1 : c.speed));
export const clipStarts = (doc: EditDoc) => {
  const out: number[] = [];
  let t = 0;
  for (const c of doc.clips) {
    out.push(t);
    t += clipLen(c);
  }
  return out;
};
export const editDuration = (doc: EditDoc) =>
  Math.max(
    0.5,
    doc.clips.reduce((a, c) => a + clipLen(c), 0),
    ...doc.overlays.map((o) => o.start + o.dur),
    ...doc.audios.map((a) => a.start + a.dur),
    ...doc.texts.map((t) => t.end),
  );
export const emptyEdit = (): EditDoc => ({ ratio: "9:16", fps: 30, bg: "#000000", clips: [], overlays: [], audios: [], texts: [], muteClips: false });
