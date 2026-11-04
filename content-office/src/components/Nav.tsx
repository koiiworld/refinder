"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const P = {
  pen: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  blog: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.3z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ITEMS = [
  { href: "/", label: "글 만들기", sub: "① 키워드 추천 · ② 선택", icon: P.pen },
  { href: "/posts", label: "진행 현황", sub: "③~⑦ 제목·글·이미지·검수·발행", icon: P.list, badge: true },
  { href: "/blogs", label: "블로그 설정", sub: "말투 예시·문체", icon: P.blog },
  { href: "/settings", label: "설정", sub: "AI 연결·단계별 AI", icon: P.gear },
  { href: "/trash", label: "휴지통", sub: "삭제한 글 되살리기·완전 삭제", icon: P.trash },
];

function isOn(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export default function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <>
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">AI</span> 콘텐츠 오피스
        </div>
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={`nav-link ${isOn(path, it.href) ? "on" : ""}`} style={{ alignItems: "flex-start" }}>
            <Icon d={it.icon} />
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span>{it.label}</span>
              <span className="tiny" style={{ opacity: 0.7, fontWeight: 400 }}>{it.sub}</span>
            </span>
            {it.badge && pending > 0 && <span className="count" title="발행 대기">{pending}</span>}
          </Link>
        ))}
      </aside>

      <header className="topbar">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">AI</span> 콘텐츠 오피스
        </Link>
      </header>

      <nav className="bottomnav" aria-label="주요 메뉴" style={{ gridTemplateColumns: `repeat(${ITEMS.length}, 1fr)` }}>
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={isOn(path, it.href) ? "on" : ""}>
            <Icon d={it.icon} />
            {it.label}
            {it.badge && pending > 0 && <span className="dot">{pending}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
