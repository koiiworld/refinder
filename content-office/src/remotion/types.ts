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
  image?: string | null; // 사진 장면 (/api/img/…) — 영상 대신 사진을 화면에
  kenburns?: boolean; // 사진 천천히 확대
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
  glowSize?: number; // 빛 세기 (0.3~3, 기본 1)
};

/** 글꼴: 구글 폰트의 무료(OFL) 한글 글꼴 전부. file 이 있는 4개는 bin/ 에 미리 받아 둠, 나머지는 처음 쓸 때 bin/fonts/ 로 받음 */
export type ReelFontDef = { id: string; label: string; family: string; file?: string; weights?: number[] };
export const REEL_FONTS: ReelFontDef[] = [
  { id: "noto", label: "본고딕", family: "Noto Sans KR", file: "NotoSansKR.ttf" },
  { id: "blackhan", label: "검은고딕 (굵은 제목)", family: "Black Han Sans", file: "BlackHanSans-Regular.ttf" },
  { id: "dohyeon", label: "도현체", family: "Do Hyeon", file: "DoHyeon-Regular.ttf" },
  { id: "jua", label: "주아체 (둥근)", family: "Jua", file: "Jua-Regular.ttf" },
  { id: "nanumgothic", label: "나눔고딕", family: "Nanum Gothic", weights: [400, 700] },
  { id: "gothica1", label: "고딕 A1", family: "Gothic A1", weights: [400, 700] },
  { id: "ibmplex", label: "IBM 플렉스 산스", family: "IBM Plex Sans KR", weights: [400, 700] },
  { id: "astasans", label: "아스타 산스", family: "Asta Sans", weights: [400, 700] },
  { id: "gowundodum", label: "고운돋움", family: "Gowun Dodum", weights: [400] },
  { id: "sunflower", label: "해바라기", family: "Sunflower", weights: [500, 700] },
  { id: "dongle", label: "동글 (큰 둥근)", family: "Dongle", weights: [400, 700] },
  { id: "stylish", label: "스타일리시", family: "Stylish", weights: [400] },
  { id: "orbit", label: "오르빗", family: "Orbit", weights: [400] },
  { id: "gasoek", label: "가석 (아주 굵은)", family: "Gasoek One", weights: [400] },
  { id: "notoserif", label: "본명조", family: "Noto Serif KR", weights: [400, 700] },
  { id: "nanummyeongjo", label: "나눔명조", family: "Nanum Myeongjo", weights: [400, 700] },
  { id: "gowunbatang", label: "고운바탕", family: "Gowun Batang", weights: [400, 700] },
  { id: "songmyung", label: "송명", family: "Song Myung", weights: [400] },
  { id: "hahmlet", label: "함렛", family: "Hahmlet", weights: [400, 700] },
  { id: "diphylleia", label: "산하엽", family: "Diphylleia", weights: [400] },
  { id: "grandiflora", label: "그랜디플로라", family: "Grandiflora One", weights: [400] },
  { id: "nanumpen", label: "나눔손글씨 펜", family: "Nanum Pen Script", weights: [400] },
  { id: "nanumbrush", label: "나눔손글씨 붓", family: "Nanum Brush Script", weights: [400] },
  { id: "gaegu", label: "개구 (손글씨)", family: "Gaegu", weights: [400, 700] },
  { id: "gamja", label: "감자꽃", family: "Gamja Flower", weights: [400] },
  { id: "himelody", label: "하이멜로디", family: "Hi Melody", weights: [400] },
  { id: "eastsea", label: "동해독도", family: "East Sea Dokdo", weights: [400] },
  { id: "nanumcoding", label: "나눔고딕코딩", family: "Nanum Gothic Coding", weights: [400, 700] },
  { id: "bagel", label: "베이글 (통통)", family: "Bagel Fat One", weights: [400] },
  { id: "dokdo", label: "독도", family: "Dokdo", weights: [400] },
  { id: "poorstory", label: "푸어스토리", family: "Poor Story", weights: [400] },
  { id: "kirang", label: "기랑해랑", family: "Kirang Haerang", weights: [400] },
  { id: "bwpicture", label: "흑백사진", family: "Black And White Picture", weights: [400] },
  { id: "singleday", label: "싱글데이", family: "Single Day", weights: [400] },
  { id: "cutefont", label: "귀여운체", family: "Cute Font", weights: [400] },
  { id: "gugi", label: "구기", family: "Gugi", weights: [400] },
  { id: "yeonsung", label: "연성", family: "Yeon Sung", weights: [400] },
  { id: "moirai", label: "모이라이", family: "Moirai One", weights: [400] },
];
export type ReelFontId = string;
export const fontFamily = (f?: string) => `ReelFont-${REEL_FONTS.some((x) => x.id === f) ? f : "noto"}`;
/** 미리보기·내보내기에서 쓸 글꼴 파일 목록 (id, 굵기) — file 글꼴은 굵기 범위 하나 */
export const fontFaces = (ids?: Iterable<string>) => {
  const want = ids ? new Set(ids) : null;
  return REEL_FONTS.filter((f) => !want || want.has(f.id)).flatMap((f) => (f.file ? [{ id: f.id, w: 0 }] : (f.weights ?? [400]).map((w) => ({ id: f.id, w }))));
};
export const faceKey = (id: string, w: number) => (w ? `${id}-${w}` : id);

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
export type ReelOverlay = { id: string; start: number; end: number; videoId?: string; image?: string; x: number; y: number; w: number; h: number; fit: "cover" | "contain"; radius: number };
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
  photos?: string[]; // 이 릴스에 올린 사진들 (/api/img/…)
  music?: { videoId: string; from: number; volume: number } | null; // 소리 트랙 (올린 음악)
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
