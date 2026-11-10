/**
 * 📱 인스타 운영 도구 (화면·서버 공용 정의)
 * 참고: instagram-agent-skill (MIT, © 2026 Jake Schincariol) 의 릴스 후킹 공식·프로필 채점표·주간 계획·댓글 분류·아웃라이어 배수 아이디어를 한국어로 옮김
 */
export const IG_TOOLS = [
  { id: "reel", label: "🎬 릴스 대본", sub: "아이디어 하나 → 후킹 3개(점수) · 대본 · 화면 문구 · 초 단위 구성" },
  { id: "reply", label: "💬 댓글 답글", sub: "댓글을 붙여넣으면 종류별로 나누고 답글 초안" },
  { id: "profile", label: "🪪 프로필 점수", sub: "프로필 캡처 → 12항목 100점 채점 + 고칠 문구" },
  { id: "plan", label: "🗓 주간 계획", sub: "이번 주에 올릴 것 · 시간 · 형식 · 소통 목록" },
  { id: "viral", label: "🔥 잘 된 영상 찾기", sub: "계정 평소 조회수 대비 몇 배 나왔는지로 순위 → 내 대본으로" },
] as const;
export type IgTool = (typeof IG_TOOLS)[number]["id"];
export const isIgTool = (t: unknown): t is IgTool => IG_TOOLS.some((x) => x.id === t);

/** 릴스 후킹 공식 26가지 (번호는 원본과 같음) */
export const HOOKS: [number, string, string][] = [
  [1, "손해 고백", "{구체적 금액/시간}이 {실수 하나} 때문에 날아갔어요"],
  [2, "하지 마세요", "{흔한 행동} 그만하세요. 대신 {대안}"],
  [3, "아무도 안 알려주는", "아무도 안 알려주는 {불편한 진실}"],
  [4, "대체템", "{이것} 하나로 {비싼 것}을 {가격}에 대신했어요"],
  [5, "시간 단축", "예전엔 {긴 시간} 걸렸는데 이제 {짧은 시간}이면 끝나요"],
  [6, "기록 공개", "{N일} 동안 {한 일}, 실제 숫자 보여드릴게요"],
  [7, "잘못된 방법·맞는 방법", "{이것} 이렇게 하고 계시죠? 당신 잘못 아니에요. {해결}"],
  [8, "내부자 폭로", "{업계}에 {N년} 있으면서 말 못 했던 것"],
  [9, "가져가세요", "이 {자료} 그대로 가져가세요. 만드는 데 {시간} 걸렸어요"],
  [10, "이런 분이라면", "{구체 상황}이라면 이 {짧은 시간}이면 해결돼요"],
  [11, "N가지 + 최애", "{결과} 내는 {N}가지, {k}번은 아무도 안 써요"],
  [12, "반박 받기", "\"{실제로 듣는 반론}\" 맞아요. 그래도 되는 방법이 있어요"],
  [13, "전·후 화면", "{예전 모습} → {바뀐 모습}. 차이는 딱 하나"],
  [14, "콕 집어 부르기", "{특정 대상}분들, 이거 계속 놓치고 계세요"],
  [15, "실패 기록", "처음 {N}번은 망했어요. {N+1}번째에 바꾼 것"],
  [16, "받은 질문 그대로", "\"{받은 질문 그대로}\" 매주 받는 질문이에요"],
  [17, "맞대결", "{A} vs {B}, {기간} 써 봤는데 차이가 컸어요"],
  [18, "바로 시연", "{하는 중인 장면부터} 이거 보세요"],
  [19, "마감 알림", "{날짜}부터 {이것}이 바뀌어요. 그 전에 {행동}"],
  [20, "허락", "{다들 필요하다는 것} 없어도 돼요"],
  [21, "말 중간부터", "…그리고 그때 {반전}"],
  [22, "통념 뒤집기", "{유명한 말}, 사실 반대예요"],
  [23, "통계", "{대상}의 {N}%가 {의외의 사실}"],
  [24, "공개", "이게 새로운 {것}이에요"],
  [25, "남의 결과", "{기간} 만에 {결과} 낸 {사람}이 있어요"],
  [26, "최상급", "가장 {빠른/쉬운/유일한} {것}은 {답}"],
];

/** 프로필 채점표 12항목 (100점) */
export const PROFILE_RUBRIC: { id: string; label: string; points: number; full: string }[] = [
  { id: "name_field", label: "이름 칸", points: 12, full: "굵은 이름 칸(30자)에 이름 + 사람들이 검색하는 말(무엇을 하는 계정인지)" },
  { id: "bio_first_line", label: "소개 첫 줄", points: 12, full: "누구를 위한 계정이고 보면 뭐가 달라지는지 그 사람 말로. 직함·형용사 나열·이모지 나열 X" },
  { id: "bio_body", label: "소개 나머지", points: 8, full: "증거 하나 또는 구체적인 제안 하나, 문장으로" },
  { id: "pinned_three", label: "고정 게시물 3개", points: 10, full: "고정 3개가 각각 다른 역할: 최고의 증거 · 제안 설명 · 나 소개" },
  { id: "link", label: "링크", points: 8, full: "소개에서 약속한 것과 맞는 목적지 하나 (메뉴판보다 문 하나)" },
  { id: "highlights", label: "하이라이트", points: 8, full: "실제로 묻는 질문 이름으로 4~6개, 표지 통일, 1년 넘은 것 없음" },
  { id: "grid_legibility", label: "피드 첫 9칸", points: 8, full: "작은 썸네일에서도 글자가 읽히고 탭 없이 무슨 계정인지 보임. 릴스 표지 직접 고름" },
  { id: "photo", label: "프로필 사진", points: 6, full: "얼굴이 원의 60%쯤, 눈이 보이고 최근 2년 안 사진, 배경이 방해 안 됨" },
  { id: "handle", label: "아이디", points: 6, full: "읽기 쉽고 소리 내 말할 수 있음, 다른 채널과 같음" },
  { id: "category_contact", label: "카테고리·연락", points: 6, full: "프로 계정, 내용과 맞는 카테고리, 작동하는 연락 버튼" },
  { id: "recent_activity", label: "최근 활동", points: 10, full: "최근 7일 안에 게시 + 최근 글 댓글에 답글" },
  { id: "story_presence", label: "스토리", points: 6, full: "지금 스토리가 있거나 거의 매일 올림" },
];

/** 조회수 표에서 계정별 평소(중앙값) 대비 배수 계산 — AI 없이 */
export type ViralRow = { account: string; views: number; text: string; url?: string };
export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function parseViralRows(raw: string): ViralRow[] {
  const num = (v: string) => {
    const t = v.replace(/[,\s회]/g, "").toLowerCase();
    const m = t.match(/^([\d.]+)(만|천|k|m)?$/);
    if (!m) return NaN;
    const n = Number(m[1]);
    return m[2] === "만" ? n * 10000 : m[2] === "천" || m[2] === "k" ? n * 1000 : m[2] === "m" ? n * 1_000_000 : n;
  };
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.includes("|") ? l.split("|") : l.split(",")))
    .map((cells): ViralRow | null => {
      const c = cells.map((x) => x.trim()).filter(Boolean);
      const vi = c.findIndex((x, i) => i > 0 && Number.isFinite(num(x)));
      if (vi < 1) return null;
      const rest = c.filter((_, i) => i !== 0 && i !== vi);
      const url = rest.find((x) => /^https?:\/\//.test(x));
      return { account: c[0].replace(/^@/, ""), views: num(c[vi]), text: rest.filter((x) => x !== url).join(" ").slice(0, 300), ...(url ? { url } : {}) };
    })
    .filter((r): r is ViralRow => !!r && r.views > 0)
    .slice(0, 200);
}
export function rankOutliers(rows: ViralRow[]) {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.account, [...(by.get(r.account) ?? []), r.views]);
  return rows
    .map((r) => {
      const views = by.get(r.account)!;
      const med = median(views);
      return { ...r, median: med, posts: views.length, multiple: med ? Math.round((r.views / med) * 10) / 10 : 0 };
    })
    .sort((a, b) => b.multiple - a.multiple);
}

/** 대본 말하는 시간 추정 (한국어 초당 약 6.5글자, 공백 제외) */
export const spokenSeconds = (text: string) => Math.round((text.replace(/\s/g, "").length / 6.5) * 10) / 10;
