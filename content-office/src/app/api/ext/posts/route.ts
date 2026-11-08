import { handle, ok } from "@/lib/api";
import { recentPostsForExt } from "@/lib/inbox";

/** 🧩 확장 프로그램: 보낼 글 고르기 (최근 글 40개) — 연결 코드 확인은 proxy.ts */
export async function GET() {
  return handle(async () => ok({ posts: await recentPostsForExt() }));
}
