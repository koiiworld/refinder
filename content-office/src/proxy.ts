import { NextResponse, type NextRequest } from "next/server";

/**
 * APP_PASSWORD 가 설정된 경우에만 접속 비밀번호를 요구합니다.
 * (로컬 사용 시에는 비워두면 됩니다. 외부 배포 시 반드시 설정)
 */
export async function proxy(req: NextRequest) {
  const pw = process.env.APP_PASSWORD?.trim();
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const token = req.cookies.get("co_auth")?.value;
  if (token && token === (await hash(pw))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export async function hash(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("content-office:" + s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
