// 마케팅 달력: 한국 시즌·기념일·쇼핑 이벤트 (클라이언트·서버 공용)

export type SeasonTag = "all" | "it" | "parenting" | "food" | "travel" | "life";

export interface SeasonEvent {
  key: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (하루짜리면 start 와 같음)
  leadDays: number; // 며칠 전부터 글을 준비·발행하면 좋은지
  kind: "holiday" | "commerce" | "season" | "school" | "custom";
  tentative?: string; // 날짜가 확정이 아니면 그 이유
  seeds: Partial<Record<SeasonTag, string[]>>; // 블로그 분야별 출발 키워드 (검색량 아님)
  note?: string;
  custom?: boolean;
  customId?: string;
  blogId?: string | null;
}

// 음력 명절 (양력 환산). 2026~2028
const LUNAR: Record<number, { seollal: string; chuseok: string }> = {
  2026: { seollal: "2026-02-17", chuseok: "2026-09-25" },
  2027: { seollal: "2027-02-07", chuseok: "2027-09-15" },
  2028: { seollal: "2028-01-27", chuseok: "2028-10-03" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** y년 m월의 n번째 요일(0=일) */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return ymd(y, m, day);
}

export function seasonEvents(year: number): SeasonEvent[] {
  const lunar = LUNAR[year];
  const y = year;
  const list: SeasonEvent[] = [
    { key: "newyear", name: "새해·신년 계획", start: ymd(y, 1, 1), end: ymd(y, 1, 10), leadDays: 21, kind: "season", seeds: { all: ["새해 목표", "신년 계획"], it: ["새해 IT 기기 추천", "다이어리 앱"], parenting: ["새해 아이 습관", "육아 계획"], food: ["떡국 끓이는 법", "신년 다이어트 식단"], travel: ["해돋이 명소", "1월 국내 여행"], life: ["가계부 정리", "연말정산 준비"] } },
    { key: "yearend-tax", name: "연말정산", start: ymd(y, 1, 15), end: ymd(y, 2, 28), leadDays: 14, kind: "season", seeds: { all: ["연말정산 간소화", "연말정산 환급"], life: ["연말정산 공제 항목", "월세 세액공제"], parenting: ["자녀 세액공제", "교육비 공제"] } },
    ...(lunar
      ? [
          { key: "seollal", name: "설날", start: addDays(lunar.seollal, -1), end: addDays(lunar.seollal, 1), leadDays: 30, kind: "holiday" as const, seeds: { all: ["설날 선물", "설 연휴"], food: ["설 차례상", "전 부치는 법", "떡국"], parenting: ["설날 아이와 갈 곳", "세뱃돈 관리"], travel: ["설 연휴 여행지", "귀성길"], it: ["설 선물 전자기기", "명절 가전 할인"], life: ["설 선물세트 추천", "명절 스트레스"] } },
          { key: "chuseok", name: "추석", start: addDays(lunar.chuseok, -1), end: addDays(lunar.chuseok, 1), leadDays: 30, kind: "holiday" as const, seeds: { all: ["추석 선물", "추석 연휴"], food: ["추석 차례상", "송편 만들기", "명절 음식 보관"], parenting: ["추석 아이와 놀거리", "명절 아이 한복"], travel: ["추석 연휴 여행", "연휴 국내 여행지"], it: ["추석 가전 할인", "명절 선물 전자기기"], life: ["추석 선물세트", "명절 증후군"] } },
        ]
      : []),
    { key: "valentine", name: "발렌타인데이", start: ymd(y, 2, 14), end: ymd(y, 2, 14), leadDays: 21, kind: "commerce", seeds: { all: ["발렌타인데이 선물"], food: ["수제 초콜릿 만들기", "초콜릿 디저트"], it: ["커플 선물 전자기기"], life: ["발렌타인 선물 추천"] } },
    { key: "newsemester", name: "새 학기·입학", start: ymd(y, 3, 1), end: ymd(y, 3, 15), leadDays: 30, kind: "school", seeds: { all: ["새학기 준비물"], parenting: ["초등 입학 준비물", "어린이집 적응", "책가방 추천"], it: ["대학생 노트북 추천", "학생 태블릿"], food: ["아이 등원 아침 메뉴"], life: ["새학기 정리 수납"] } },
    { key: "whiteday", name: "화이트데이", start: ymd(y, 3, 14), end: ymd(y, 3, 14), leadDays: 21, kind: "commerce", seeds: { all: ["화이트데이 선물"], food: ["사탕 만들기", "화이트데이 디저트"], life: ["화이트데이 선물 추천"] } },
    { key: "spring", name: "봄 나들이·벚꽃", start: ymd(y, 3, 25), end: ymd(y, 4, 15), leadDays: 21, kind: "season", seeds: { all: ["벚꽃 명소", "봄 나들이"], travel: ["벚꽃 축제 일정", "봄 여행지"], food: ["피크닉 도시락", "봄나물 요리"], parenting: ["아이와 봄 나들이", "주말 체험학습"], it: ["사진 잘 나오는 폰 설정", "액션캠 추천"], life: ["봄맞이 대청소", "미세먼지 대처"] } },
    { key: "familymonth", name: "가정의 달 (어린이날·어버이날)", start: ymd(y, 5, 1), end: ymd(y, 5, 15), leadDays: 30, kind: "holiday", seeds: { all: ["어린이날 선물", "어버이날 선물"], parenting: ["어린이날 갈만한 곳", "아이 선물 추천", "키즈카페"], food: ["어버이날 상차림", "카네이션 케이크"], it: ["부모님 선물 전자기기", "효도 가전"], travel: ["가족 여행지 5월"], life: ["스승의날 선물"] } },
    { key: "rainy", name: "장마", start: ymd(y, 6, 20), end: ymd(y, 7, 25), leadDays: 14, kind: "season", tentative: "기상청 예보에 따라 시기가 달라집니다", seeds: { all: ["장마 대비"], life: ["제습기 추천", "빨래 냄새 제거", "곰팡이 제거"], it: ["제습기 비교", "건조기 추천"], food: ["비 오는 날 음식", "부침개 레시피"], parenting: ["장마철 실내 놀이"], travel: ["비 오는 날 실내 데이트"] } },
    { key: "summer", name: "여름휴가·물놀이", start: ymd(y, 7, 20), end: ymd(y, 8, 20), leadDays: 30, kind: "season", seeds: { all: ["여름휴가", "물놀이"], travel: ["여름휴가 국내 여행지", "계곡 추천", "해수욕장"], parenting: ["아이 물놀이 준비물", "워터파크"], food: ["여름 보양식", "냉면 레시피", "삼계탕"], it: ["휴대용 선풍기", "방수 케이스", "에어컨 전기요금"], life: ["열대야 숙면", "모기 퇴치"] } },
    { key: "boknal", name: "복날 (초복·중복·말복)", start: ymd(y, 7, 15), end: ymd(y, 8, 15), leadDays: 14, kind: "season", tentative: "복날은 절기에 따라 매년 날짜가 달라집니다", seeds: { food: ["삼계탕 끓이는 법", "복날 보양식", "닭백숙"], all: ["복날 음식"] } },
    { key: "autumn", name: "가을 단풍·나들이", start: ymd(y, 10, 10), end: ymd(y, 11, 10), leadDays: 21, kind: "season", seeds: { all: ["단풍 명소", "가을 나들이"], travel: ["단풍 시기", "가을 여행지"], food: ["가을 제철 음식", "밤 고구마 요리"], parenting: ["아이와 가을 체험"], life: ["환절기 건강"] } },
    { key: "halloween", name: "할로윈", start: ymd(y, 10, 31), end: ymd(y, 10, 31), leadDays: 21, kind: "commerce", seeds: { all: ["할로윈 파티"], parenting: ["아이 할로윈 코스튬", "할로윈 만들기"], food: ["할로윈 간식 만들기"] } },
    { key: "pepero", name: "빼빼로데이", start: ymd(y, 11, 11), end: ymd(y, 11, 11), leadDays: 14, kind: "commerce", seeds: { food: ["빼빼로 만들기", "수제 빼빼로"], all: ["빼빼로데이 선물"] } },
    { key: "suneung", name: "수능", start: nthWeekday(y, 11, 4, 3), end: nthWeekday(y, 11, 4, 3), leadDays: 21, kind: "school", tentative: "11월 셋째 목요일로 계산한 예상일입니다. 교육부 공식 일정을 확인하세요", seeds: { all: ["수능 선물", "수능 응원"], food: ["수능 도시락", "수험생 간식"], it: ["수능 끝나고 노트북", "수험생 할인"], parenting: ["수험생 부모"], life: ["수능 끝나고 할 일"] } },
    { key: "kimjang", name: "김장철", start: ymd(y, 11, 10), end: ymd(y, 12, 10), leadDays: 21, kind: "season", seeds: { food: ["김장 김치 담그는 법", "김장 양념 비율", "절임배추"], life: ["김치냉장고 추천", "김장 비용"], it: ["김치냉장고 비교"], all: ["김장"] } },
    { key: "blackfriday", name: "블랙프라이데이", start: addDays(nthWeekday(y, 11, 4, 4), 1), end: addDays(nthWeekday(y, 11, 4, 4), 4), leadDays: 21, kind: "commerce", seeds: { all: ["블랙프라이데이 할인"], it: ["블프 노트북", "블프 직구", "아이패드 할인"], life: ["블프 쇼핑 리스트"], parenting: ["블프 육아용품"] } },
    { key: "winter", name: "겨울 준비·난방", start: ymd(y, 11, 15), end: ymd(y, 12, 31), leadDays: 21, kind: "season", seeds: { all: ["겨울 준비"], life: ["난방비 절약", "결로 방지", "가습기 추천"], it: ["전기히터 추천", "온수매트", "가습기 비교"], food: ["겨울 국물 요리", "붕어빵 만들기"], parenting: ["아이 겨울 옷", "겨울 감기 예방"], travel: ["겨울 여행지", "스키장"] } },
    { key: "christmas", name: "크리스마스·연말", start: ymd(y, 12, 20), end: ymd(y, 12, 31), leadDays: 30, kind: "holiday", seeds: { all: ["크리스마스 선물", "연말 모임"], food: ["크리스마스 케이크 만들기", "홈파티 요리"], parenting: ["아이 크리스마스 선물", "크리스마스 체험"], it: ["크리스마스 선물 전자기기", "연말 가전 할인"], travel: ["크리스마스 데이트", "연말 여행"], life: ["연말 정리", "다이어리 추천"] } },
  ];
  return list.sort((a, b) => (a.start < b.start ? -1 : 1));
}

export const LUNAR_YEARS = Object.keys(LUNAR).map(Number);

/** 블로그 분야(자유 입력) → 시즌 태그 */
export function blogTags(category: string): SeasonTag[] {
  const c = category || "";
  const tags: SeasonTag[] = [];
  if (/IT|전자|기기|가전|테크|폰|노트북/i.test(c)) tags.push("it");
  if (/육아|아이|아기|키즈|엄마|맘/.test(c)) tags.push("parenting");
  if (/요리|레시피|음식|맛집|키친|베이킹/.test(c)) tags.push("food");
  if (/여행|캠핑|숙소|나들이/.test(c)) tags.push("travel");
  if (/생활|일상|살림|후기|리뷰/.test(c)) tags.push("life");
  return tags.length ? tags : ["life"];
}

export function seedsFor(ev: SeasonEvent, category: string | null): string[] {
  const tags: SeasonTag[] = category === null ? (["all", "it", "parenting", "food", "travel", "life"] as SeasonTag[]) : ["all", ...blogTags(category)];
  return Array.from(new Set(tags.flatMap((t) => ev.seeds[t] ?? [])));
}

export const KIND_LABEL: Record<SeasonEvent["kind"], string> = {
  holiday: "명절·기념일",
  commerce: "쇼핑 이벤트",
  season: "계절·생활",
  school: "학사",
  custom: "직접 추가",
};
