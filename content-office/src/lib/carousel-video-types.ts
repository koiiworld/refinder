/** 🎬 카드 사진 → AI 영상: 움직임 예시 (화면·서버 공용) */
export const CARD_MOTIONS = [
  { id: "boil", label: "보글보글 끓기", en: "The broth gently bubbles and simmers, small bubbles rising to the surface" },
  { id: "steam", label: "김 모락모락", en: "Soft white steam rises slowly from the hot food" },
  { id: "noodles", label: "젓가락으로 면 들어올리기", en: "Chopsticks lift a bundle of noodles up and slowly lower it back, noodles swaying naturally (hands out of frame)" },
  { id: "pour", label: "소스·국물 붓기", en: "Sauce or broth is slowly poured onto the dish from above" },
  { id: "sizzle", label: "지글지글 굽기", en: "The food sizzles in the pan with small oil bubbles and a little smoke" },
  { id: "drip", label: "소스 흘러내리기", en: "A glossy sauce slowly drips and spreads over the food" },
  { id: "rotate", label: "접시 천천히 돌리기", en: "The plate rotates slowly on the table" },
  { id: "pushin", label: "카메라 천천히 다가가기", en: "The camera slowly pushes in toward the dish" },
] as const;
export type CardVideo = { jobId: string; status: string; url?: string; error?: string; prompt: string; motions: string[]; usd?: number | null; image: string };
export type CardMotionId = (typeof CARD_MOTIONS)[number]["id"];
export const CARD_VIDEO_USD = 0.5; // Wan 2.6 · 5초 · 720p (11/7 실제 청구 기준) — 버튼 누를 때 실제 예상 비용을 다시 받아 확인
