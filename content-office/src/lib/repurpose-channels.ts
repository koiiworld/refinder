// 📣 블로그 글 → 다른 채널 (클라이언트·서버 공용)
export const CHANNELS = [
  { id: "reel", label: "🎬 30초 릴스 대본 + 자막", hint: "첫 3초 훅 → 핵심 3개 → 마무리 행동 유도. 장면마다 화면·대사·자막" },
  { id: "cards", label: "🖼 카드뉴스 7장 문구", hint: "1장 표지 훅, 2~6장 핵심, 7장 저장·공유 유도. 장마다 제목+짧은 본문" },
  { id: "threads", label: "🧵 스레드 게시글", hint: "첫 줄 훅, 짧은 문단 3~5개, 질문으로 끝내기, 500자 이내" },
  { id: "insta", label: "📱 인스타 캡션 + 해시태그", hint: "첫 줄 훅, 핵심 요약, 저장 유도, 해시태그 15개 이내" },
  { id: "daangn", label: "🥕 당근 비즈프로필 소식", hint: "동네 이웃에게 말하듯 친근하게, 300자 이내, 방문·문의 유도" },
  { id: "place", label: "📍 네이버 플레이스 새소식", hint: "가게 소식 형식, 핵심 정보 위주, 300자 이내" },
  { id: "faq", label: "❓ 자주 묻는 질문 5개", hint: "실제 검색할 법한 질문 5개와 2~3문장 답" },
  { id: "kakao", label: "💬 단골에게 보낼 카카오톡 소식", hint: "짧고 다정하게, 200자 이내, 혜택·링크 자리 표시" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];
