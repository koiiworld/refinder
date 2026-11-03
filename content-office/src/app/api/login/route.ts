import { NextResponse } from "next/server";
import { hash } from "@/proxy";

export async function POST(req: Request) {
  const pw = process.env.APP_PASSWORD?.trim();
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!pw) return NextResponse.json({ ok: true });
  if (password !== pw) return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("co_auth", await hash(pw), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && req.url.startsWith("https"),
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
