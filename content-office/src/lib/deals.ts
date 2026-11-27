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

/** 상품명에서 개수를 읽어 개당 가격 (예: "355ml, 24개" → 24개, "5개입" → 5개, "2p" → 2개). 못 읽으면 null */
export function unitPrice(name: string, price: number) {
  const n = name.replace(/\[[^\]]*\]/g, " ");
  const counts = [...n.matchAll(/(\d{1,4})\s*(개입|개|입|팩|캔|병|매|롤|p|P|ea|EA)(?![a-zA-Z가-힣])/g)].map((m) => Number(m[1])).filter((c) => c >= 2 && c <= 1000);
  if (!counts.length) return null;
  const total = counts.length >= 2 && /세트|x|X|×/.test(n) ? counts.reduce((a, b) => a * b, 1) : Math.max(...counts);
  if (total < 2 || total > 2000) return null;
  return { count: total, each: Math.round(price / total) };
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

/** 보고를 보낸 뒤 24시간 동안만 '답장 기다리는 중' → 이때만 답장 확인 (사용자 지시 11/27) */
export async function awaiting() {
  const a = await getSetting<{ until?: string }>("deals_awaiting");
  return !!a?.until && Date.parse(a.until) > Date.now();
}

export async function report(text: string, wait = true) {
  const { token, chat } = reportBot();
  const t = String(text ?? "").trim().slice(0, 4000);
  if (!t) throw new Error("보낼 내용이 비어 있어요.");
  const res = await fetch(`${TG()}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: t, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || d.ok === false) throw new Error(`텔레그램 오류: ${d.description ?? res.status}`);
  if (wait) await setSetting("deals_awaiting", { at: new Date().toISOString(), until: new Date(Date.now() + 24 * 3600_000).toISOString() });
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
  if (ack && messages.length) await setSetting("deals_awaiting", { at: new Date().toISOString(), until: null });
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
  // 링크·쿠팡 언급이 전혀 없는 글(공감·정보글)은 광고가 아니므로 광고 표시 검사 생략
  const isAd = /https?:\/\/|link\.coupang|쿠팡|파트너스/.test(body + "\n" + reply);
  if (isAd && !/\[광고\]|#광고/.test(body.split("\n").slice(0, 2).join("\n"))) problems.push("본문 첫 두 줄 안에 #광고 또는 [광고] 표시가 없어요");
  if (isAd && reply && /https?:\/\/|link\.coupang/.test(reply) && !/수수료/.test(reply)) problems.push("링크 댓글에 대가성 문구(수수료)가 없어요");
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

type PostLog = { at: string; id: string; first: string; body?: string; reply?: string; replyId?: string | null };

/** 게시: 본문 → 첫 댓글. 점검에 걸리면 올리지 않음 */
export async function postThreads(body: string, reply = "", replies: string[] = []) {
  // replies 가 있으면 본글 → 댓글1 → 댓글2 … 로 이어 달기 (마지막 댓글이 링크·대가성 문구). 없으면 reply 1개
  const chain = (replies.length ? replies : [reply]).map((r) => String(r ?? "").trim()).filter(Boolean);
  const last = chain.at(-1) ?? "";
  const problems = [...checkPost(body, last), ...chain.slice(0, -1).flatMap((r, i) => ([...r].length > 500 ? [`댓글${i + 1}이 500자를 넘어요`] : []))];
  if (/link\.coupang|https?:\/\//.test(chain.slice(0, -1).join("\n"))) problems.push("링크는 마지막 댓글에만 넣어요");
  if (problems.length) throw new Error("게시 안 함: " + problems.join(" / "));
  const id = await threadsPublish(body.trim());
  let replyId: string | null = null;
  let parent = id;
  for (const r of chain) {
    await sleep(3000);
    parent = await threadsPublish(r, parent);
    replyId ??= parent;
  }
  reply = chain.join("\n\n");
  const log = (await getSetting<PostLog[]>("deals_threads_log")) ?? [];
  log.unshift({ at: new Date().toISOString(), id, first: body.split("\n")[0].slice(0, 80), body: body.trim(), reply: reply.trim(), replyId });
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
  // 골드박스는 가격 기록용으로 조용히 저장만 (보고 X, 11/27 사용자 지시). 실패해도 보고는 계속
  const items = await goldbox(day, force).catch(() => [] as GoldItem[]);
  await report(await insightsReport(day), false);
  const tr = await trendsSection().catch(() => "");
  if (tr) await report(tr);
  const yday = kstDay(new Date(Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T00:00:00+09:00`) - 3600_000));
  const sum = await replySummary(yday).catch(() => "");
  if (sum) await report(sum);
  // 반품 확인 루틴은 콘셉트 미정이라 아침 보고에서 뺌 (11/27 사용자 지시: 반품은 아직 콘셉트에 넣지 말 것)
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
  const a = Buffer.from(header.trim().replace(/^Bearer\s+/i, "").trim());
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 자동 답글용 원글 기록 채우기 (기록에 본문이 없는 예전 글) */
export async function attachPostLog(id: string, body: string, reply: string, replyId?: string) {
  const log = (await getSetting<PostLog[]>("deals_threads_log")) ?? [];
  const p = log.find((x) => x.id === id);
  if (!p) throw new Error("그 글의 게시 기록이 없어요.");
  if (!body.trim()) throw new Error("본문이 비어 있어요.");
  Object.assign(p, { body: body.trim(), reply: reply.trim(), replyId: replyId ?? p.replyId ?? null });
  await setSetting("deals_threads_log", log);
  return { id, first: p.first };
}

// ---------- 댓글 자동 답글 (검수 후) ----------
// 10분마다(Render 에서만): 최근 3일 글의 새 댓글 → Gemini(무료) 답글 작성 → Gemini 2차 점검 → 규칙 검사 → 답글
// 악플·시비·스팸·개인정보·판단 어려움은 답하지 않고 '확인 필요'로 모아 다음 아침 보고. 한 번 5개, 하루 30개까지
const REPLY_MAX_TICK = 5;
const REPLY_MAX_DAY = 30;

type ReplyLog = { at: string; post: string; comment: string; user: string; text: string; action: "replied" | "skipped" | "error"; answer?: string; reason?: string };

async function threadsGet(path: string, params: Record<string, string>) {
  const token = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("스레드 토큰(THREADS_ACCESS_TOKEN)이 없어요.");
  const res = await fetch(`${THREADS()}${path}?${new URLSearchParams({ ...params, access_token: token })}`, { signal: AbortSignal.timeout(20_000) });
  const d = (await res.json().catch(() => ({}))) as { data?: unknown[]; username?: string; error?: { message?: string } };
  if (!res.ok || d.error) throw new Error(`스레드 오류 (HTTP ${res.status}) ${d.error?.message ?? ""}`.trim());
  return d;
}

async function geminiJson(system: string, user: string) {
  const key = process.env.GOOGLE_AI_TEXT_API_KEY?.trim();
  if (!key) throw new Error("무료 Gemini 키(GOOGLE_AI_TEXT_API_KEY)가 없어요.");
  for (const model of ["gemini-3.5-flash", "gemini-3.5-flash-lite"]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(60_000),
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 } }),
      });
      const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const txt = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      const m = txt.match(/\{[\s\S]*\}/);
      if (res.ok && m) return JSON.parse(m[0]) as Record<string, unknown>;
    } catch { /* 다음 모델 */ }
  }
  throw new Error("Gemini 답을 받지 못했어요.");
}

/** 규칙 검사 (AI 와 별개로 코드가 확인) */
export function checkReply(answer: string, post: string) {
  const problems: string[] = [];
  const a = answer.trim();
  if (!a) problems.push("빈 답글");
  if ([...a].length > 150) problems.push("150자 초과");
  if (/https?:\/\/|www\.|link\.coupang/i.test(a)) problems.push("링크 포함");
  if (/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/.test(a)) problems.push("보이지 않는 문자");
  if (/[—–]/.test(a)) problems.push("긴 대시");
  const nums = (a.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, ""));
  const known = new Set((post.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, "")));
  for (const n of nums) if (!known.has(n)) problems.push(`원글에 없는 숫자(${n})`);
  if (/최저가|오늘만|마지막|품절 임박|무조건|100%|정품/.test(a) && !/최저가|오늘만|마지막|품절 임박|무조건|100%|정품/.test(post)) problems.push("확인 안 된 단정 표현");
  return problems;
}

const REPLY_RULES = `너는 스레드 계정 '자취방 살림고수'(살림 n년차 선배가 자취방 살림 문제를 해결해 주는 계정)의 댓글 담당이야. 자취생인 척하거나 '나 자취할 때' 같은 1인칭 경험담은 쓰지 말 것. 원글(아래 POST)만 근거로 댓글에 짧게 답해.
규칙:
- 댓글 단 사람의 말투에 맞출 것: 댓글이 존댓말(~요, ~습니다, ~네요 등)이면 존댓말, 반말이면 반말. 애매하면 존댓말. 1~2문장, 100자 안쪽
- 원글에 없는 가격·숫자·효능·재고·정품 여부는 절대 말하지 말 것. 모르면 "상품 페이지에서 확인해줘" 정도로
- 링크는 쓰지 말 것 (필요하면 "링크는 첫 댓글에 있어" 라고만)
- 구매를 압박하지 말 것, 과장 금지, 이모지는 0~1개
- 공감·의견·경험 공유 댓글도 답글 대상이야 (짧게 공감하거나 원글 내용 한마디 보태기). 다른 살림/핫딜 계정이 단 댓글이라도 내용이 정상이면 답할 것
- 악플·시비·정치/혐오·스팸·광고·개인정보(전화번호 등)·판단이 어려운 댓글은 답하지 말 것 (action: "skip")
JSON 한 개로만 답해: {"action": "reply" | "skip", "reason": "짧게", "answer": "답글 (skip 이면 빈 문자열)"}`;

const REVIEW_RULES = `너는 스레드 답글 검수자야. POST(원글), COMMENT(댓글), ANSWER(보낼 답글)를 보고 판단해.
- ANSWER 가 원글에 없는 사실·숫자·효능을 말하거나, 과장·단정·구매 압박이 있거나, 댓글 단 사람의 말투(존댓말/반말)와 다르거나(애매하면 존댓말), 댓글에 맞지 않으면 고쳐
- 고칠 수 없거나 답하지 않는 게 나으면 action 을 "skip"
JSON 한 개로만 답해: {"action": "reply" | "skip", "reason": "짧게", "answer": "최종 답글"}`;

export async function replyTick(now = new Date()) {
  if (!process.env.RENDER && process.env.DEALS_RUN_HERE !== "1") return;
  if (!process.env.THREADS_ACCESS_TOKEN?.trim() || !process.env.GOOGLE_AI_TEXT_API_KEY?.trim()) return;
  if ((await getSetting<{ off?: boolean }>("deals_autoreply"))?.off) return;
  const day = kstDay(now);
  const posts = ((await getSetting<PostLog[]>("deals_threads_log")) ?? []).filter((p) => p.body && now.getTime() - Date.parse(p.at) < 3 * 86400_000);
  if (!posts.length) return;
  const handled = (await getSetting<Record<string, string>>("deals_replied")) ?? {};
  const log = (await getSetting<ReplyLog[]>("deals_reply_log")) ?? [];
  let todayCount = log.filter((l) => l.action === "replied" && kstDay(new Date(l.at)) === day).length;
  let tick = 0;
  const me = (await threadsGet("/me", { fields: "username" })).username as string | undefined;
  for (const post of posts) {
    const d = await threadsGet(`/${post.id}/replies`, { fields: "id,text,username,timestamp", reverse: "false" }).catch(() => ({ data: [] }));
    for (const c of (d.data ?? []) as { id: string; text?: string; username?: string }[]) {
      if (handled[c.id] || c.id === post.replyId || c.username === me || !c.text?.trim()) continue;
      if (tick >= REPLY_MAX_TICK || todayCount >= REPLY_MAX_DAY) break;
      handled[c.id] = new Date().toISOString();
      const entry: ReplyLog = { at: new Date().toISOString(), post: post.id, comment: c.id, user: c.username ?? "", text: c.text.slice(0, 300), action: "skipped" };
      try {
        const ctx = `POST:\n${post.body}\n\nCOMMENT (@${c.username}):\n${c.text}`;
        const a1 = await geminiJson(REPLY_RULES, ctx);
        if (a1.action !== "reply") { entry.reason = `1차: ${a1.reason ?? "skip"}`; }
        else {
          const a2 = await geminiJson(REVIEW_RULES, `${ctx}\n\nANSWER:\n${a1.answer}`);
          const answer = String(a2.answer ?? "").trim();
          const problems = a2.action === "reply" ? checkReply(answer, post.body ?? "") : [`2차: ${a2.reason ?? "skip"}`];
          if (problems.length) entry.reason = problems.join(" / ");
          else {
            await threadsPublish(answer, c.id);
            entry.action = "replied"; entry.answer = answer; tick++; todayCount++;
          }
        }
      } catch (e) {
        entry.action = "error"; entry.reason = (e as Error).message.slice(0, 200);
      }
      log.unshift(entry);
    }
  }
  await setSetting("deals_replied", handled);
  await setSetting("deals_reply_log", log.slice(0, 300));
}

/** 최근 자동 답글 기록 (건너뛴 이유 포함) */
export async function replyLog(n = 50) {
  return ((await getSetting<ReplyLog[]>("deals_reply_log")) ?? []).slice(0, n);
}

/** 어제 답글 요약 (아침 보고에 붙임) */
export async function replySummary(day: string) {
  const log = (await getSetting<ReplyLog[]>("deals_reply_log")) ?? [];
  const y = log.filter((l) => kstDay(new Date(l.at)) === day);
  if (!y.length) return "";
  const replied = y.filter((l) => l.action === "replied");
  const check = y.filter((l) => l.action !== "replied");
  const lines = [`💬 ${day.slice(4, 6)}/${day.slice(6)} 댓글: 답글 ${replied.length}개 · 확인 필요 ${check.length}개`];
  for (const l of check.slice(0, 10)) lines.push(`- @${l.user}: ${l.text.slice(0, 60)} → ${l.reason ?? l.action}`);
  return lines.join("\n");
}

// ---------- 인사이트 보고 (아침 보고의 중심, 11/27 사용자 지시) ----------
const POST_METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;
type Metrics = Partial<Record<(typeof POST_METRICS)[number], number>>;

async function postInsights(id: string): Promise<Metrics> {
  const d = (await threadsGet(`/${id}/insights`, { metric: POST_METRICS.join(",") })) as { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
  return Object.fromEntries((d.data ?? []).map((x) => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? 0])) as Metrics;
}

async function accountInsights() {
  const d = (await threadsGet("/me/threads_insights", { metric: "views,likes,replies,reposts,quotes,followers_count" }).catch(() => ({ data: [] }))) as { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
  const m: Record<string, number> = {};
  for (const x of d.data ?? []) m[x.name] = x.total_value?.value ?? (x.values ?? []).reduce((a, v) => a + (v.value ?? 0), 0);
  return m;
}

export async function insightsReport(day = kstDay()) {
  const posts = ((await getSetting<PostLog[]>("deals_threads_log")) ?? []).filter((p) => Date.now() - Date.parse(p.at) < 7 * 86400_000);
  const prev = (await getSetting<Record<string, Metrics>>("deals_insights_prev")) ?? {};
  const now: Record<string, Metrics> = {};
  const rows: { p: PostLog; m: Metrics; dv: number }[] = [];
  for (const p of posts) {
    const m = await postInsights(p.id).catch(() => null);
    if (!m) continue; // 지워진 글 등
    now[p.id] = m;
    rows.push({ p, m, dv: (m.views ?? 0) - (prev[p.id]?.views ?? 0) });
  }
  await setSetting("deals_insights_prev", now);
  const acc = await accountInsights();
  const lines = [`📊 ${day.slice(4, 6)}/${day.slice(6)} 스레드 인사이트`];
  if (acc.followers_count !== undefined) lines.push(`팔로워 ${won(acc.followers_count)}명`);
  lines.push("");
  if (!rows.length) lines.push("최근 7일 글이 없어요.");
  rows.sort((a, b) => (b.m.views ?? 0) - (a.m.views ?? 0));
  rows.forEach((r, i) => {
    const m = r.m;
    lines.push(`${i + 1}. ${r.p.first.replace(/\s*\[광고\]\s*/, " ").trim().slice(0, 40)}`);
    lines.push(`   조회 ${won(m.views ?? 0)}${r.dv > 0 ? ` (+${won(r.dv)})` : ""} · 좋아요 ${m.likes ?? 0} · 댓글 ${m.replies ?? 0} · 리포스트 ${m.reposts ?? 0} · 공유 ${m.shares ?? 0}`);
  });
  if (rows.length >= 2) {
    const top = rows[0], low = rows[rows.length - 1];
    lines.push("", `👍 가장 많이 본 첫 줄: "${top.p.first.replace(/\s*\[광고\]\s*/, " ").trim().slice(0, 40)}"`, `👎 가장 적게 본 첫 줄: "${low.p.first.replace(/\s*\[광고\]\s*/, " ").trim().slice(0, 40)}"`);
  }
  lines.push("", "※ 댓글 수에는 우리가 단 링크 댓글도 포함돼요.");
  return lines.join("\n");
}

/** 오늘 뜨는 주제: 스레드 인기 주제(한국) → 비어 있으면 구글 트렌드 한국 */
export async function trendsSection() {
  const lines: string[] = [];
  try {
    const d = (await threadsGet("/trending_topics", { country_code: "KR" })) as { trends?: { title: string; description?: string }[] };
    const t = d.trends ?? [];
    if (t.length) {
      lines.push("🔥 스레드 인기 주제 (한국)");
      t.slice(0, 10).forEach((x, i) => lines.push(`${i + 1}. ${x.title}${x.description ? ` — ${x.description.slice(0, 50)}` : ""}`));
      return lines.join("\n");
    }
  } catch { /* 구글 트렌드로 */ }
  try {
    const { googleTrends } = await import("./hot-report");
    const g = await googleTrends();
    if (g.length) {
      lines.push("🔥 오늘 뜨는 검색어 (구글 트렌드 한국 · 스레드 한국 인기 주제는 아직 비어 있음)");
      g.slice(0, 10).forEach((x, i) => lines.push(`${i + 1}. ${x.title} (${x.traffic})${x.news[0] ? ` — ${x.news[0].title.slice(0, 40)}` : ""}`));
      lines.push("", "글감으로 쓸 만한 번호를 답장하면 상황형 첫 줄 후보를 만들어요.");
    }
  } catch { /* 없음 */ }
  return lines.join("\n");
}
