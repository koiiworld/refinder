import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { q1 } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { getFeatureOff } from "@/lib/features";
import FeatureGate from "@/components/FeatureGate";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return {
    title: /^[\p{L}\p{N}]+$/u.test(b.mark) ? `${b.mark} ${b.name}` : b.name,
    description: "ChatGPT·Claude·Gemini를 함께 쓰는 멀티 블로그 콘텐츠 제작 오피스",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171a20" },
  ],
};

/** 발행 대기(검수까지 끝난) 글 수 */
async function pendingCount() {
  try {
    const r = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM projects WHERE stage='ready' AND status <> 'running' AND deleted_at IS NULL");
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [pending, brand, off] = await Promise.all([pendingCount(), getBrand(), getFeatureOff().catch(() => [] as string[])]);
  return (
    <html lang="ko">
      <body>
        <div className="shell">
          <Nav pending={pending} brand={brand} off={off} />
          <main className="main"><FeatureGate off={off}>{children}</FeatureGate></main>
        </div>
      </body>
    </html>
  );
}
