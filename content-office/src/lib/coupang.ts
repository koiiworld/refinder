import "server-only";
import crypto from "node:crypto";
import { q, q1, j } from "./db";
import { getRevenue, monthKey, saveRevenue } from "./dashboard";

/**
 * 쿠팡파트너스 Open API: 이번 달 수익·클릭·주문 자동 집계
 * - 키: COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY (파트너스 사이트에서 발급)
 * - 일별 실적은 쿠팡이 하루 한 번(오후 3시쯤) 갱신 → 3시간에 한 번만 불러옴
 * - 금액은 '예상 수익'(취소·확정 전) 기준
 */

const BASE = () => (process.env.COUPANG_API_BASE_URL?.trim() || "https://api-gateway.coupang.com").replace(/\/$/, "");
const REPORT = "/v2/providers/affiliate_open_api/apis/openapi/v1/reports";
const SYNC_MS = 3 * 60 * 60 * 1000;

export function coupangConnected() {
  return !!(process.env.COUPANG_ACCESS_KEY?.trim() && process.env.COUPANG_SECRET_KEY?.trim());
}

/** 쿠팡 HMAC 서명 헤더 (signed-date: yyMMddTHHmmssZ, 메시지 = 날짜+메서드+경로+쿼리) */
export function coupangAuth(method: string, path: string, query: string, now = new Date()) {
  const dt = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "").slice(2);
  const sig = crypto.createHmac("sha256", process.env.COUPANG_SECRET_KEY!.trim()).update(dt + method + path + query).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${process.env.COUPANG_ACCESS_KEY!.trim()}, signed-date=${dt}, signature=${sig}`;
}

async function report(kind: "commission" | "clicks" | "orders", start: string, end: string) {
  const path = `${REPORT}/${kind}`;
  const query = `startDate=${start}&endDate=${end}`;
  const res = await fetch(`${BASE()}${path}?${query}`, { headers: { Authorization: coupangAuth("GET", path, query), "content-type": "application/json" }, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { rCode?: string; rMessage?: string; message?: string; data?: unknown };
  if (!res.ok || (data.rCode && data.rCode !== "0")) throw new Error(`쿠팡파트너스 API 오류 (HTTP ${res.status}) ${data.rMessage ?? data.message ?? ""}`.trim());
  return Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
}

const sum = (rows: Record<string, unknown>[], ...keys: string[]) =>
  rows.reduce((s, r) => s + (Number(keys.map((k) => r[k]).find((v) => v != null) ?? 0) || 0), 0);

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** 이번 달(1일~오늘, 한국 시간) 수익을 불러와 대시보드 수익에 저장 */
export async function syncCoupang(force = false) {
  if (!coupangConnected()) throw new Error("쿠팡파트너스 API 키가 아직 연결되지 않았습니다.");
  const last = await q1<{ value: { at?: string } }>("SELECT value FROM settings WHERE key='coupang_sync'");
  if (!force && last?.value?.at && Date.now() - new Date(last.value.at).getTime() < SYNC_MS) return null;
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const month = monthKey();
  const start = `${month.replace("-", "")}01`;
  const end = ymd(kst);
  const [commission, clicks, orders] = await Promise.all([
    report("commission", start, end),
    report("clicks", start, end).catch(() => []),
    report("orders", start, end).catch(() => []),
  ]);
  const krw = Math.round(sum(commission, "commission"));
  const click = sum(clicks, "click", "clickCount");
  const order = sum(orders, "quantity", "orderCount");
  const all = await getRevenue();
  const cur = all[month] ?? {};
  await saveRevenue(month, { ...cur, coupang: { krw, usd: null, metric: `API 자동 · 클릭 ${click.toLocaleString("ko-KR")} · 주문 ${order.toLocaleString("ko-KR")} · 예상 수익 기준` } });
  const at = new Date().toISOString();
  await q(`INSERT INTO settings (key, value) VALUES ('coupang_sync', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j({ at, month, krw, click, order })]);
  return { at, month, krw, click, order };
}

export async function lastCoupangSync() {
  const r = await q1<{ value: { at?: string; error?: string } }>("SELECT value FROM settings WHERE key='coupang_sync'");
  return r?.value ?? null;
}
