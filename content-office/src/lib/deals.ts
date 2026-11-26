import "server-only";
import crypto from "node:crypto";
import { q, q1, j } from "./db";
import { coupangAuth, coupangConnected } from "./coupang";

/**
 * 🧹 반품특가 줍줍 (스레드·카톡 알림방 운영)
 * - 매일 08:10(한국 시간) 쿠팡 골드박스를 1번 받아 저장 → 가격 기록이 쌓임 → 새 텔레그램 봇(업무 보고용)으로 "오늘 모은 데이터" 보고
 * - Render 서버에서만 자동 실행 (맥 앱과 같은 DB를 쓰므로 두 번 보내지 않도록). 하루 1번은 DB 고유키로 보장
 * - 쿠팡 페이지를 직접 열지 않음(차단·약관 위험) → 공식 파트너스 API(골드박스·검색·링크 생성)만 사용, 호출은 하루 몇 번으로 제한
 * - 스레드 게시는 게시 전 점검: 본문 앞부분 #광고/[광고], 첫 댓글에 대가성 문구, 링크 자리 비어 있으면 거부
 * - 키(앱 설정 'API 키 직접 연결'): THREADS_ACCESS_TOKEN, REPORT_TELEGRAM_BOT_TOKEN, REPORT_TELEGRAM_CHAT_ID, DEALS_AGENT_TOKEN
 */

const API = () => (process.env.COUPANG_API_BASE_URL?.trim() || "https://api-gateway.coupang.com").replace(/\/$/, "");
const OPEN = "/v2/providers/affiliate_open_api/apis/openapi/v1";
const TG = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/$/, "");
const THREADS = () => (process.env.THREADS_API_BASE?.trim() || "https://graph.threads.net/v1.0").replace(/\/$/, "");
const DAILY_HM = "08:10";

export type GoldItem = { productId: number | string; productName: string; productPrice: number; productImage?: string; productUrl: string; categoryName?: string; isRocket?: boolean };

const kstNow = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000);
export const kstDay = (now = new Date()) => kstNow(now).toISOString().slice(0, 10).replace(/-/g, "");
const won = (n: number) => Number(n).toLocaleString("ko-KR");

async function getSetting<T>(key: string): Promise<T | null> {
  const r = await q1<{ value: T }>("SELECT value FROM settings WHERE key=$1", [key]);
  return r?.value ?? null;
}
async function setSetting(key: string, value: unknown) {
  await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, j(value)]);
}
/** 처음 한 번만 true (DB 고유키) */
async function claim(key: string) {
  const r = await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key", [key, j({ at: new Date().toISOString() })]);
  return r.length > 0;
}

async function coupang(method: "GET" | "POST", path: string, query = "", payload?: unknown) {
  if (!coupangConnected()) throw new Error("쿠팡파트너스 API 키가 없어요.");
  const full = `${OPEN}${path}`;
  const res = await fetch(`${API()}${full}${query ? "?" + query : ""}`, {
    method,
    headers: { Authorization: coupangAuth(method, full, query), "content-type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const d = (await res.json().catch(() => ({}))) as { rCode?: string; rMessage?: string; message?: string; data?: unknown };
  if (!res.ok || (d.rCode && d.rCode !== "0")) throw new Error(`쿠팡 API 오류 (HTTP ${res.status}) ${d.rMessage ?? d.message ?? ""}`.trim());
  return d.data;
}

/** 오늘 골드박스 (하루 1번만 API 호출, 이후엔 저장분) */
export async function goldbox(day = kstDay(), force = false): Promise<GoldItem[]> {
  const key = `deals_goldbox:${day}`;
  const saved = await getSetting<GoldItem[]>(key);
  if (saved && !force) return saved;
  const items = ((await coupang("GET", "/products/goldbox", "subId=goldbox&imageSize=512x512")) as GoldItem[]) ?? [];
  await setSetting(key, items);
  return items;
}

/** 파트너스 링크 → 일반 쿠팡 상품 주소 (링크 생성 API는 일반 주소만 받음) */
export function plainUrl(productUrl: string, productId?: string | number) {
  try {
    const u = new URL(productUrl);
    if (u.hostname === "www.coupang.com" || u.hostname === "m.coupang.com") return productUrl;
    const qs = new URLSearchParams({ itemId: u.searchParams.get("itemId") ?? "", vendorItemId: u.searchParams.get("vendorItemId") ?? "" });
    return `https://www.coupang.com/vp/products/${u.searchParams.get("pageKey") ?? productId}?${qs}`;
  } catch {
    return productUrl;
  }
}

/** 짧은 파트너스 링크 (링크 생성 API 1회, 최대 20개). 만든 링크는 저장해 다시 만들지 않음 */
export async function shortLinks(urls: string[]) {
  const map = (await getSetting<Record<string, string>>("deals_short_links")) ?? {};
  const need = [...new Set(urls)].filter((u) => !map[u]).slice(0, 20);
  if (need.length) {
    const data = ((await coupang("POST", "/deeplink", "", { coupangUrls: need })) as { originalUrl?: string; shortenUrl?: string }[]) ?? [];
    data.forEach((d, i) => { if (d.shortenUrl) map[need[i]] = d.shortenUrl; });
    await setSetting("deals_short_links", map);
  }
  return Object.fromEntries(urls.map((u) => [u, map[u] ?? null]));
}

/** 상품 검색 (파트너스 검색 API, 키워드 1개 = 1회). 결과는 일반 쿠팡 주소와 함께 돌려줌 */
export async function search(keyword: string, limit = 10) {
  const k = keyword.trim().slice(0, 50);
  if (!k) throw new Error("검색어가 비어 있어요.");
  const data = (await coupang("GET", "/products/search", `keyword=${encodeURIComponent(k)}&limit=${Math.min(10, Math.max(1, limit))}&subId=deals`)) as { productData?: GoldItem[] };
  return (data?.productData ?? []).map((p) => ({ ...p, url: plainUrl(p.productUrl, p.productId) }));
}

/** 상품별 가격 기록에서 사실만 뽑기: 지난 기록보다 내림 / 기록 중 최저가 */
async function priceFacts(day: string, items: GoldItem[]) {
  const rows = await q<{ key: string; value: GoldItem[] }>("SELECT key, value FROM settings WHERE key LIKE 'deals_goldbox:%' AND key < $1 ORDER BY key", [`deals_goldbox:${day}`]);
  const hist: Record<string, { day: string; price: number }[]> = {};
  for (const r of rows) for (const p of r.value ?? []) (hist[String(p.productId)] ??= []).push({ day: r.key.slice(14), price: p.productPrice });
  return items.map((p) => {
    const h = hist[String(p.productId)] ?? [];
    const out: string[] = [];
    if (h.length) {
      const prev = h[h.length - 1];
      if (prev.price > p.productPrice) out.push(`${prev.day.slice(4, 6)}/${prev.day.slice(6)}보다 ${won(prev.price - p.productPrice)}원 내림`);
      if (h.length >= 2 && p.productPrice <= Math.min(...h.map((x) => x.price))) out.push(`기록된 ${h.length + 1}번 중 최저가`);
    }
    return out;
  });
}

// ---------- 업무 보고용 텔레그램 (새 봇) ----------
function reportBot() {
  const token = process.env.REPORT_TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.REPORT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) throw new Error("업무 보고 봇 키(REPORT_TELEGRAM_BOT_TOKEN / REPORT_TELEGRAM_CHAT_ID)가 없어요.");
  return { token, chat };
}

export async function report(text: string) {
  const { token, chat } = reportBot();
  const t = String(text ?? "").trim().slice(0, 4000);
  if (!t) throw new Error("보낼 내용이 비어 있어요.");
  const res = await fetch(`${TG()}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: t, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || d.ok === false) throw new Error(`텔레그램 오류: ${d.description ?? res.status}`);
}

/** 새 답장 읽기 (글자 + 사진 file_id). ack=true 면 읽음 처리 */
export async function inbox(ack = false) {
  const { token, chat } = reportBot();
  const offset = (await getSetting<{ offset: number }>("deals_inbox"))?.offset ?? 0;
  const res = await fetch(`${TG()}/bot${token}/getUpdates?offset=${offset}&timeout=0`, { signal: AbortSignal.timeout(20_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { update_id: number; message?: { message_id: number; date: number; chat: { id: number }; text?: string; caption?: string; photo?: { file_id: string }[]; document?: { file_id: string; mime_type?: string } } }[] };
  let last = offset - 1;
  const messages = [];
  for (const x of d.result ?? []) {
    last = Math.max(last, x.update_id);
    const m = x.message;
    if (!m || String(m.chat.id) !== chat) continue;
    const photo = m.photo?.at(-1)?.file_id ?? (m.document?.mime_type?.startsWith("image/") ? m.document.file_id : null);
    messages.push({ id: m.message_id, at: new Date(m.date * 1000).toISOString(), text: m.text ?? m.caption ?? "", photo });
  }
  if (ack && last >= offset) await setSetting("deals_inbox", { offset: last + 1 });
  return { messages, nextOffset: last + 1 };
}

/** 받은 사진 내려받기 (file_id → 이미지 바이트) */
export async function photo(fileId: string) {
  const { token } = reportBot();
  const f = (await (await fetch(`${TG()}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(15_000) })).json()) as { ok?: boolean; result?: { file_path: string } };
  if (!f.ok || !f.result) throw new Error("사진을 찾지 못했어요.");
  const res = await fetch(`${TG()}/file/bot${token}/${f.result.file_path}`, { signal: AbortSignal.timeout(30_000) });
  return { bytes: Buffer.from(await res.arrayBuffer()), type: f.result.file_path.endsWith(".png") ? "image/png" : "image/jpeg" };
}

// ---------- 스레드 게시 ----------
export function checkPost(body: string, reply: string) {
  const len = (s: string) => [...s].length;
  const problems: string[] = [];
  if (!body.trim()) problems.push("본문이 비어 있어요");
  if (len(body) > 500) problems.push(`본문이 500자를 넘어요 (${len(body)}자)`);
  if (len(reply) > 500) problems.push(`댓글이 500자를 넘어요 (${len(reply)}자)`);
  if (!/\[광고\]|#광고/.test(body.split("\n").slice(0, 2).join("\n"))) problems.push("본문 첫 두 줄 안에 #광고 또는 [광고] 표시가 없어요");
  if (reply && !/수수료/.test(reply)) problems.push("댓글에 대가성 문구(수수료)가 없어요");
  if (/링크 필요|링크 생성 전|\(링크\)/.test(reply)) problems.push("댓글에 비어 있는 링크 자리가 있어요");
  return problems;
}

async function threadsCall(path: string, params: Record<string, string>) {
  const token = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("스레드 토큰(THREADS_ACCESS_TOKEN)이 없어요.");
  const res = await fetch(`${THREADS()}${path}?${new URLSearchParams({ ...params, access_token: token })}`, { method: "POST", signal: AbortSignal.timeout(30_000) });
  const d = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || d.error || !d.id) throw new Error(`스레드 오류 (HTTP ${res.status}) ${d.error?.message ?? ""}`.trim());
  return d.id;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function threadsPublish(text: string, replyTo?: string) {
  const c = await threadsCall("/me/threads", { media_type: "TEXT", text, ...(replyTo ? { reply_to_id: replyTo } : {}) });
  await sleep(Number(process.env.THREADS_WAIT_MS ?? 5000));
  return threadsCall("/me/threads_publish", { creation_id: c });
}

export async function threadsMe() {
  const token = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("스레드 토큰(THREADS_ACCESS_TOKEN)이 없어요.");
  const res = await fetch(`${THREADS()}/me?fields=id,username&access_token=${token}`, { signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { username?: string; error?: { message?: string } };
  if (!d.username) throw new Error(`스레드 토큰 확인 실패: ${d.error?.message ?? res.status}`);
  return d.username;
}

/** 게시: 본문 → 첫 댓글. 점검에 걸리면 올리지 않음 */
export async function postThreads(body: string, reply = "") {
  const problems = checkPost(body, reply);
  if (problems.length) throw new Error("게시 안 함: " + problems.join(" / "));
  const id = await threadsPublish(body.trim());
  let replyId: string | null = null;
  if (reply.trim()) {
    await sleep(3000);
    replyId = await threadsPublish(reply.trim(), id);
  }
  const log = (await getSetting<{ at: string; id: string; first: string }[]>("deals_threads_log")) ?? [];
  log.unshift({ at: new Date().toISOString(), id, first: body.split("\n")[0].slice(0, 80) });
  await setSetting("deals_threads_log", log.slice(0, 100));
  return { id, replyId };
}

// ---------- 매일 아침 ----------
export const FILTER_ROUTINE = [
  "🧹 오늘의 반품 확인 (쿠팡 앱에서 직접, 1~2분)",
  '쿠팡 앱 검색 → 필터 → 상품 상태 "반품"·"박스 훼손" 체크 → 높은 가격순',
  "",
  "오늘 검색어: 아이폰 / 아이패드 / 맥북 / 에어팟 / 애플워치",
  "",
  '반품 있으면 "반품 상품" 화면 캡처 → 여기로 보내기 (링크는 Claude가 API로 만들어요)',
  "⚠️ 쿠팡 링크를 연달아 열면 차단돼요. 앱에서 천천히만!",
].join("\n");

export async function runDaily(day = kstDay(), force = false) {
  const items = await goldbox(day, force);
  const facts = await priceFacts(day, items);
  const lines = [`📦 오늘 모은 데이터 (${day.slice(4, 6)}/${day.slice(6)} 골드박스 ${items.length}개)`, ""];
  items.slice(0, 30).forEach((p, i) => lines.push(`${i + 1}. ${p.productName.split(",")[0].slice(0, 34)} | ${won(p.productPrice)}원${facts[i].length ? " | " + facts[i].join(" / ") : ""}`));
  lines.push("", "올릴 번호(예: 1,4)를 답장하면 스레드 초안을 만들어요.");
  await report(lines.join("\n"));
  await report(FILTER_ROUTINE);
  return { items: items.length };
}

/** 서버 작업자가 5분마다 호출: Render 에서만, 한국 시간 08:10 이후 하루 1번 */
export async function dealsTick(now = new Date()) {
  if (!process.env.RENDER && process.env.DEALS_RUN_HERE !== "1") return;
  if (!coupangConnected() || !process.env.REPORT_TELEGRAM_BOT_TOKEN?.trim()) return;
  if (kstNow(now).toISOString().slice(11, 16) < DAILY_HM) return;
  const day = kstDay(now);
  if (!(await claim(`deals_daily:${day}`))) return;
  try {
    await runDaily(day);
  } catch (e) {
    await setSetting(`deals_daily:${day}`, { at: new Date().toISOString(), error: (e as Error).message });
  }
}

/** /api/deals 전용 토큰 확인 (Claude 같은 에이전트가 앱 비밀번호 없이 이 기능만 쓰도록) */
export function agentAllowed(header: string | null) {
  const want = process.env.DEALS_AGENT_TOKEN?.trim();
  if (!want || !header) return false;
  const a = Buffer.from(header.trim());
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
