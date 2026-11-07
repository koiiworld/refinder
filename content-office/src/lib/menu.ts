// 메뉴 구성 + 기능 켜기/끄기 (클라이언트·서버 공용)

export type MenuItem = { href: string; label: string; sub: string; short?: string; badge?: boolean; mobile?: boolean };
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

export const MENU_TOP: MenuItem = { href: "/work", label: "전체 작업 현황", short: "현황", sub: "블로그·인스타·영상 등 전체 업무 진행 상황", mobile: true };
export const MENU_GROUPS: MenuGroup[] = [
  { id: "workspace", label: "워크스페이스", items: [
    { href: "/todos", label: "할 일", sub: "오늘·예정·완료 · 텔레그램 알림" },
    { href: "/routines", label: "루틴 관리", sub: "반복 업무 · 매일 알림 · 실행 기록" },
    { href: "/learn", label: "AI 학습지", sub: "후킹·이미지 생성·디자인·블로그·기타" },
    { href: "/ideas", label: "아이디어 노트", sub: "메모·할 일·글 기획" },
    { href: "/calendar", label: "캘린더", sub: "시즌·행사별 일정" },
    { href: "/convert", label: "문서 → 마크다운", sub: "PDF·워드·PPT·엑셀을 글로 (맥, 무료)" },
    { href: "/telegram", label: "텔레그램", sub: "연결·알림 설정 · 받은/보낸 메시지함" },
  ] },
  { id: "research", label: "콘텐츠 리서치", items: [
    { href: "/trends", label: "트렌드 뷰어", short: "트렌드", sub: "유튜브 급상승·스크랩", mobile: true },
    { href: "/hot", label: "블로그 핫이슈", sub: "네이버 블로그 인기 주제 탐색" },
    { href: "/study", label: "릴스 분석", sub: "링크로 첫 3초·구조·적용 아이디어" },
  ] },
  { id: "blog", label: "블로그 관리", items: [
    { href: "/posts", label: "업로드", short: "업로드", sub: "키워드 추천부터 발행 준비까지", badge: true, mobile: true },
    { href: "/repurpose", label: "채널 변환", sub: "글 하나로 릴스·카드뉴스·스레드 등" },
    { href: "/diagnose", label: "진단", sub: "노출·제목·누락 점검" },
    { href: "/blogs", label: "설정", sub: "블로그별 말투·작성 규칙" },
  ] },
  { id: "video", label: "영상 제작", items: [
    { href: "/studio", label: "영상 스튜디오", sub: "쇼츠·릴스 기획 및 제작" },
    { href: "/edit", label: "영상 편집", sub: "캡컷처럼 자르기·트랙·자막·효과·4K" },
    { href: "/reels", label: "릴스 편집", sub: "자막·장면·배경 캡컷처럼 편집" },
    { href: "/videos", label: "영상공장", short: "영상", sub: "영상 다운로드·자막 제거·편집", mobile: true },
  ] },
  { id: "insta", label: "인스타그램 관리", items: [
    { href: "/carousels", label: "캐러셀", short: "캐러셀", sub: "블로그 글·주제로 카드뉴스 제작", mobile: true },
  ] },
];
export const MENU_BOTTOM: MenuItem[] = [
  { href: "/settings", label: "설정", short: "설정", sub: "", mobile: true },
  { href: "/trash", label: "휴지통", sub: "" },
];

/** 끈 기능 목록: 그룹은 'g:insta', 페이지는 '/hot' 처럼 */
export type FeatureOff = string[];

/** 이 주소가 꺼져 있나 (페이지 자체 또는 속한 그룹이 꺼짐) — /new 는 업로드(/posts)로 봄 */
export function isOffPath(off: FeatureOff, path: string) {
  if (!off.length) return false;
  const p = path === "/new" || path.startsWith("/new/") ? "/posts" : path;
  for (const g of MENU_GROUPS) {
    for (const it of g.items) {
      if (p === it.href || p.startsWith(it.href + "/")) return off.includes(it.href) || off.includes(`g:${g.id}`);
    }
  }
  if (p === MENU_TOP.href || p.startsWith(MENU_TOP.href + "/")) return off.includes(MENU_TOP.href);
  return false;
}
export const itemOff = (off: FeatureOff, href: string) => isOffPath(off, href);
