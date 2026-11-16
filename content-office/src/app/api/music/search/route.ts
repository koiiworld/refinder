import { fail, handle, ok } from "@/lib/api";
import { searchMusic } from "@/lib/music-search";

/** 무료 음원 찾기 ?q=&kind=music|sfx&license=all|cc0|by&page= (CC0·CC BY만) */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    try {
      return ok(await searchMusic({ q: p.get("q") ?? "", kind: p.get("kind") === "sfx" ? "sfx" : "music", license: (["cc0", "by"].includes(p.get("license") ?? "") ? p.get("license") : "all") as "all" | "cc0" | "by", page: Number(p.get("page") ?? 1) }));
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
