import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { q1 } from "@/lib/db";
import { GATE_STAGES } from "@/lib/stages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 콘텐츠 오피스",
  description: "ChatGPT·Claude·Gemini를 함께 쓰는 멀티 블로그 콘텐츠 제작 오피스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171a20" },
  ],
};

async function pendingCount() {
  try {
    const r = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM projects WHERE (stage = ANY($1) OR stage IN ('images','carousel')) AND status <> 'running'`,
      [GATE_STAGES],
    );
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await pendingCount();
  return (
    <html lang="ko">
      <body>
        <div className="shell">
          <Nav pending={pending} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
