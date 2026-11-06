// ✂️ 릴스 편집 문서 (브라우저 미리보기·맥 내보내기 공용 — 이 폴더는 '@/' 별칭 없이 씀)

export type ReelBg =
  | { type: "none" } // 원래 화면 (영상을 화면 가득)
  | { type: "color"; color: string }
  | { type: "gradient"; colors: [string, string]; angle: number }
  | { type: "aurora"; colors: string[] };

/** 장면: 출력 시간축에서 차례로 이어 붙음 (시작 시각 = 앞 장면 길이의 합) */
export type ReelScene = {
  id: string;
  label: string;
  dur: number; // 초
  audioFrom: number; // 바탕 영상의 소리를 몇 초부터 쓸지 (원래 위치)
  video: { videoId: string | null; from: number }; // null = 바탕 영상
  fit: "cover" | "contain";
  bg: ReelBg;
};

export type ReelTextStyle = {
  size: number; // px (1080×1920 기준)
  bold: boolean;
  color: string;
  box: string; // 글자 뒤 상자 색 ('' = 없음)
  stroke: string; // 테두리 색 ('' = 없음)
  align: "left" | "center" | "right";
  fit: boolean; // 한 줄 맞춤 (넘치면 줄임)
  x: number; // 가운데 기준 (0~1080)
  y: number; // 가운데 기준 (0~1920)
  width: number; // 글 폭 (px)
  rotate: number; // 도
  anim?: "none" | "fade" | "pop" | "slide" | "bounce" | "type"; // 등장 효과 (모션그래픽)
};

export type ReelText = { id: string; start: number; end: number; text: string; style: ReelTextStyle };

export type ReelDoc = {
  width: number;
  height: number;
  fps: number;
  baseVideoId: string | null;
  audio: "base" | "none";
  scenes: ReelScene[];
  texts: ReelText[];
};

export type ReelProps = { doc: ReelDoc; srcs: Record<string, string>; fontUrl: string };

export const DEFAULT_TEXT_STYLE: ReelTextStyle = { size: 64, bold: true, color: "#ffffff", box: "", stroke: "#000000", align: "center", fit: true, x: 540, y: 1500, width: 900, rotate: 0, anim: "none" };

export const sceneStarts = (doc: ReelDoc) => {
  const out: number[] = [];
  let t = 0;
  for (const s of doc.scenes) {
    out.push(t);
    t += s.dur;
  }
  return out;
};
export const docDuration = (doc: ReelDoc) => Math.max(0.5, doc.scenes.reduce((a, s) => a + s.dur, 0));
