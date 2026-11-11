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
  font?: ReelFontId; // 글꼴 (없으면 본고딕)
  glow?: string; // 글자 둘레 빛 색 ('' = 없음)
};

/** 글꼴 (모두 무료 OFL 글꼴, bin/ 에 들어 있음) */
export const REEL_FONTS = [
  { id: "noto", label: "본고딕", file: "NotoSansKR.ttf" },
  { id: "blackhan", label: "검은고딕 (굵은 제목)", file: "BlackHanSans-Regular.ttf" },
  { id: "dohyeon", label: "도현체", file: "DoHyeon-Regular.ttf" },
  { id: "jua", label: "주아체 (둥근)", file: "Jua-Regular.ttf" },
] as const;
export type ReelFontId = (typeof REEL_FONTS)[number]["id"];
export const fontFamily = (f?: string) => `ReelFont-${REEL_FONTS.some((x) => x.id === f) ? f : "noto"}`;

/** 글자 꾸미기 한 번에 (속성 칸 위 버튼들) */
export const TEXT_PRESETS: { id: string; label: string; style: Partial<ReelTextStyle> }[] = [
  { id: "pinkglow", label: "핑크 빛 글씨", style: { font: "dohyeon", color: "#ffffff", box: "", stroke: "", glow: "#ff5fa2", bold: true } },
  { id: "pinkbox", label: "연핑크 박스", style: { font: "noto", color: "#c2185b", box: "#ffd6e8", stroke: "", glow: "", bold: true } },
  { id: "whiteblack", label: "흰 글씨 검정 테두리", style: { font: "noto", color: "#ffffff", box: "", stroke: "#000000", glow: "", bold: true } },
  { id: "blackbox", label: "검정 박스", style: { font: "noto", color: "#ffffff", box: "#000000", stroke: "", glow: "", bold: true } },
  { id: "round", label: "둥근 글씨", style: { font: "jua", color: "#ffffff", box: "", stroke: "#3355ff", glow: "", bold: true } },
  { id: "title", label: "큰 제목", style: { font: "blackhan", size: 110, color: "#ffffff", box: "", stroke: "#000000", glow: "", bold: true, fit: true } },
];

/** 위에 얹기: 메인 화면 위에 정해진 시간 동안 얹는 영상·사진 (영상공장 파일) */
export type ReelOverlay = { id: string; start: number; end: number; videoId: string; x: number; y: number; w: number; h: number; fit: "cover" | "contain"; radius: number };
/** 가이드 박스: 이 안에 글자·얹기를 두면 인스타 화면 가림(위·아래)을 피해요 */
export const GUIDE_BOX = { x: 60, y: 250, w: 960, h: 1420 };

export type ReelText = { id: string; start: number; end: number; text: string; style: ReelTextStyle };

export type ReelDoc = {
  width: number;
  height: number;
  fps: number;
  baseVideoId: string | null;
  audio: "base" | "none";
  scenes: ReelScene[];
  texts: ReelText[];
  overlays?: ReelOverlay[];
  memo?: string; // 수정 메모 (영상엔 안 나옴)
};

export type ReelProps = { doc: ReelDoc; srcs: Record<string, string>; fontUrl: string; fontUrls?: Partial<Record<ReelFontId, string>> };

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
