"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const P = {
  chart: "M5 20V10M12 20V4M19 20v-7",
  insta: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01",
  home: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  pen: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  blog: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  fire: "M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-3 3 0-2-1-5-3-7 0 4-4 6-4 11 0 5 3 9 7 9z",
  clap: "M4 9h16v11H4zM4 9l2-5 14 0-2 5M9 4l-1 5M14 4l-1 5",
  film: "M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4",
  phone: "M7 2h10v20H7zM11 18h2",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  check: "M4 12l5 5L20 6",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.3z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type Item = { href: string; label: string; sub: string; short?: string; icon?: string; badge?: boolean; mobile?: boolean };
type Group = { id: string; label: string; icon: string; items: Item[] };

const TOP: Item = { href: "/work", label: "전체 작업 현황", short: "현황", sub: "블로그·인스타·영상 등 전체 업무 진행 상황", icon: P.chart, mobile: true };
const GROUPS: Group[] = [
  { id: "workspace", label: "워크스페이스", icon: P.home, items: [
    { href: "/todos", label: "할 일", sub: "오늘·예정·완료 · 텔레그램 알림" },
    { href: "/ideas", label: "아이디어 노트", sub: "메모·할 일·글 기획" },
    { href: "/calendar", label: "캘린더", sub: "시즌·행사별 일정" },
  ] },
  { id: "research", label: "콘텐츠 리서치", icon: P.trend, items: [
    { href: "/trends", label: "트렌드 뷰어", short: "트렌드", sub: "유튜브 급상승·스크랩", icon: P.trend, mobile: true },
    { href: "/hot", label: "블로그 핫이슈", sub: "네이버 블로그 인기 주제 탐색" },
  ] },
  { id: "blog", label: "블로그 관리", icon: P.blog, items: [
    { href: "/posts", label: "업로드", short: "업로드", sub: "키워드 추천부터 발행 준비까지", icon: P.pen, badge: true, mobile: true },
    { href: "/diagnose", label: "진단", sub: "노출·제목·누락 점검" },
    { href: "/blogs", label: "설정", sub: "블로그별 말투·작성 규칙" },
  ] },
  { id: "video", label: "영상 제작", icon: P.clap, items: [
    { href: "/studio", label: "영상 스튜디오", sub: "쇼츠·릴스 기획 및 제작" },
    { href: "/videos", label: "영상공장", short: "영상", sub: "영상 다운로드·자막 제거·편집", icon: P.film, mobile: true },
  ] },
  { id: "insta", label: "인스타그램 관리", icon: P.insta, items: [
    { href: "/carousels", label: "캐러셀", short: "캐러셀", sub: "블로그 글·주제로 카드뉴스 제작", icon: P.phone, mobile: true },
  ] },
];
const BOTTOM: Item[] = [
  { href: "/settings", label: "설정", short: "설정", sub: "", icon: P.gear, mobile: true },
  { href: "/trash", label: "휴지통", sub: "", icon: P.trash },
];
const MOBILE = [TOP, ...GROUPS.flatMap((g) => g.items), ...BOTTOM].filter((x) => x.mobile);

function isOn(path: string, href: string) {
  return path === href || path.startsWith(href + "/") || (href === "/posts" && path === "/new");
}

const KEY = "nav-open";

export default function Nav({ pending, brand }: { pending: number; brand?: { name: string; mark: string; color: string } }) {
  const b = brand ?? { name: "콘텐츠 오피스", mark: "AI", color: "" };
  const markStyle = b.color ? { background: b.color, color: "#fff" } : undefined;
  const path = usePathname();
  const activeGroup = GROUPS.find((g) => g.items.some((it) => isOn(path, it.href)))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
  }, []);
  const save = (next: Record<string, boolean>) => {
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  const isOpen = (id: string) => open[id] ?? id === activeGroup;
  const allOpen = GROUPS.every((g) => isOpen(g.id));
  if (path === "/login") return null;

  const link = (it: Item, child = false) => (
    <Link key={it.href} href={it.href} className={`nav-link${child ? " nav-child" : ""} ${isOn(path, it.href) ? "on" : ""}`} style={{ alignItems: "flex-start" }}>
      {!child && it.icon && <Icon d={it.icon} />}
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span>{it.label}</span>
        {it.sub && <span className="tiny" style={{ opacity: 0.7, fontWeight: 400 }}>{it.sub}</span>}
      </span>
      {it.badge && pending > 0 && <span className="count" title="발행 대기">{pending}</span>}
    </Link>
  );

  return (
    <>
      <aside className="side">
        <Link href="/" className={`brand${path === "/" ? " on" : ""}`} title="대시보드로" aria-label={`${b.name} 대시보드`}>
          <span className="brand-mark" style={markStyle}>{b.mark}</span> {b.name}
        </Link>
        <div className="row between nav-tools">
          <span className="tiny muted">메뉴</span>
          <button type="button" className="nav-all" onClick={() => save(Object.fromEntries(GROUPS.map((g) => [g.id, !allOpen])))}>{allOpen ? "모두 접기" : "모두 펼치기"}</button>
        </div>
        {link(TOP)}
        <div className="nav-sep" />
        {GROUPS.map((g) => {
          const o = isOpen(g.id);
          const hasBadge = g.items.some((it) => it.badge) && pending > 0;
          return (
            <div key={g.id} className={`nav-grp${o ? " open" : ""}`}>
              <button type="button" className={`nav-link nav-grp-head${g.id === activeGroup ? " has-on" : ""}`} onClick={() => save({ ...open, [g.id]: !o })} aria-expanded={o}>
                <Icon d={g.icon} />
                <span style={{ flex: 1, textAlign: "left" }}>{g.label}</span>
                {!o && hasBadge && <span className="count">{pending}</span>}
                <span className="nav-chev" aria-hidden>›</span>
              </button>
              {o && <div className="nav-children">{g.items.map((it) => link(it, true))}</div>}
            </div>
          );
        })}
        <div className="nav-sep" />
        {BOTTOM.map((it) => link(it))}
      </aside>

      <header className="topbar">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" style={markStyle}>{b.mark}</span> {b.name}
        </Link>
      </header>

      <nav className="bottomnav" aria-label="주요 메뉴" style={{ gridTemplateColumns: `repeat(${MOBILE.length}, 1fr)` }}>
        {MOBILE.map((it) => (
          <Link key={it.href} href={it.href} className={isOn(path, it.href) ? "on" : ""}>
            <Icon d={it.icon ?? P.list} />
            {it.short ?? it.label}
            {it.badge && pending > 0 && <span className="dot">{pending}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
