import { body, fail, handle, ok } from "@/lib/api";
import { agentAllowed, checkPost, goldbox, inbox, kstDay, photo, postThreads, report, runDaily, search, shortLinks, threadsMe } from "@/lib/deals";

/**
 * 🧹 반품특가 줍줍 API
 * - 앱에 로그인한 브라우저(쿠키) 또는 x-co-agent-token 헤더(DEALS_AGENT_TOKEN)로 사용
 * - 헤더가 있으면 반드시 맞아야 함. 헤더가 없으면 proxy.ts 가 이미 로그인 쿠키를 확인한 요청
 */
function denied(req: Request) {
  const h = req.headers.get("x-co-agent-token");
  return h !== null && !agentAllowed(h);
}

/** ?action=inbox | photo&id= | goldbox&day= | status */
export async function GET(req: Request) {
  return handle(async () => {
    if (denied(req)) return fail("토큰이 맞지 않아요.", 401);
    const u = new URL(req.url);
    const action = u.searchParams.get("action") ?? "status";
    if (action === "inbox") return ok(await inbox(false));
    if (action === "photo") {
      const { bytes, type } = await photo(String(u.searchParams.get("id") ?? ""));
      return new Response(new Uint8Array(bytes), { headers: { "content-type": type, "cache-control": "no-store" } });
    }
    if (action === "goldbox") {
      const day = u.searchParams.get("day") ?? kstDay();
      if (!/^\d{8}$/.test(day)) return fail("day 는 YYYYMMDD 형식이에요.");
      return ok({ day, items: await goldbox(day) });
    }
    if (action === "status") {
      const threads = await threadsMe().catch((e: Error) => `연결 안 됨 (${e.message})`);
      return ok({ threads, report: !!process.env.REPORT_TELEGRAM_BOT_TOKEN?.trim(), today: kstDay() });
    }
    return fail("알 수 없는 작업이에요.");
  });
}

/**
 * { action: "ack" } 답장 읽음 처리
 * { action: "report", text } 업무 보고 보내기
 * { action: "search", keyword } 파트너스 검색 (1회)
 * { action: "links", urls: [] } 짧은 파트너스 링크 (1회, 최대 20개)
 * { action: "check", body, reply } 게시 전 점검만
 * { action: "threads", body, reply } 스레드 게시 (본문 → 첫 댓글)
 * { action: "daily", force? } 아침 보고를 지금 실행
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (denied(req)) return fail("토큰이 맞지 않아요.", 401);
    const b = await body<{ action?: string; text?: string; keyword?: string; urls?: string[]; body?: string; reply?: string; force?: boolean }>(req);
    try {
      switch (b.action) {
        case "ack": return ok(await inbox(true));
        case "report": await report(String(b.text ?? "")); return ok({ ok: true });
        case "search": return ok({ items: await search(String(b.keyword ?? "")) });
        case "links": {
          const urls = (Array.isArray(b.urls) ? b.urls : []).map(String).filter((x) => /^https:\/\/(www|m)\.coupang\.com\//.test(x));
          if (!urls.length) return fail("쿠팡 상품 주소(https://www.coupang.com/...)를 넣어 주세요.");
          return ok({ links: await shortLinks(urls) });
        }
        case "check": return ok({ problems: checkPost(String(b.body ?? ""), String(b.reply ?? "")) });
        case "threads": return ok(await postThreads(String(b.body ?? ""), String(b.reply ?? "")));
        case "daily": return ok(await runDaily(kstDay(), !!b.force));
        default: return fail("알 수 없는 작업이에요.");
      }
    } catch (e) {
      return fail((e as Error).message, 502);
    }
  });
}
