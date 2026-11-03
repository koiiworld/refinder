"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  blog: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.3z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  slides: "M3 6h12v12H3zM18 8v8M21 10v4",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const MAIN = [
  { href: "/", label: "대시보드", icon: P.home },
  { href: "/approvals", label: "승인 대기함", icon: P.inbox, badge: true },
  { href: "/projects", label: "프로젝트", icon: P.folder },
  { href: "/research", label: "트렌드·키워드 연구소", short: "연구소", icon: P.bulb },
  { href: "/calendar", label: "콘텐츠 캘린더", icon: P.cal },
];
const MANAGE = [
  { href: "/blogs", label: "블로그 관리", icon: P.blog },
  { href: "/runs", label: "AI 실행·비용", icon: P.bolt },
  { href: "/settings", label: "설정·AI 연결", icon: P.gear },
];
const LATER = [
  { href: "/studio/images", label: "이미지 스튜디오", icon: P.image },
  { href: "/studio/carousel", label: "인스타 캐러셀", icon: P.slides },
  { href: "/diagnostics", label: "블로그 진단실", icon: P.pulse },
];

function isOn(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export default function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path === "/login") return null;

  const link = (it: { href: string; label: string; icon: string; badge?: boolean }) => (
    <Link key={it.href} href={it.href} className={`nav-link ${isOn(path, it.href) ? "on" : ""}`} onClick={() => setOpen(false)}>
      <Icon d={it.icon} />
      <span>{it.label}</span>
      {it.badge && pending > 0 && <span className="count">{pending}</span>}
    </Link>
  );

  return (
    <>
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">AI</span> 콘텐츠 오피스
        </div>
        {MAIN.map(link)}
        <div className="nav-group">관리</div>
        {MANAGE.map(link)}
        <div className="nav-group">2차 개발 예정</div>
        {LATER.map(link)}
      </aside>

      <header className="topbar">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">AI</span> 콘텐츠 오피스
        </Link>
        <Link href="/projects/new" className="btn btn-primary btn-sm">
          + 새 글
        </Link>
      </header>

      <nav className="bottomnav" aria-label="주요 메뉴">
        {MAIN.slice(0, 4).map((it) => (
          <Link key={it.href} href={it.href} className={isOn(path, it.href) ? "on" : ""}>
            <Icon d={it.icon} />
            {it.short ?? it.label.replace(" 대기함", "함")}
            {it.badge && pending > 0 && <span className="dot">{pending}</span>}
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className={open ? "on" : ""}>
          <Icon d={P.more} />
          더보기
        </button>
      </nav>

      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-label="전체 메뉴">
            {[MAIN[4], ...MANAGE].map(link)}
            <div className="nav-group">2차 개발 예정</div>
            {LATER.map(link)}
          </div>
        </>
      )}
    </>
  );
}
