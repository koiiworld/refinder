import "server-only";
import crypto from "node:crypto";
import { q, j } from "./db";

/**
 * 네이버 검색광고 API - 키워드 도구 (월간 검색량·경쟁도·연관 키워드)
 * 인증: X-Timestamp(ms), X-API-KEY, X-Customer, X-Signature = Base64(HMAC-SHA256(secret, "{ts}.{METHOD}.{uri}"))
 * 출처: github.com/naver/searchad-apidoc 공식 예제
 */

export function naverAdConnected() {
  return !!(process.env.NAVER_AD_API_KEY?.trim() && process.env.NAVER_AD_SECRET_KEY?.trim() && process.env.NAVER_AD_CUSTOMER_ID?.trim());
}

function base() {
  return (process.env.NAVER_AD_BASE_URL?.trim() || "https://api.searchad.naver.com").replace(/\/$/, "");
}

export function signature(timestamp: string, method: string, uri: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

export interface KeywordStat {
  keyword: string; // 네이버가 돌려준 키워드 (띄어쓰기 없음)
  pc: number; // 월간 PC 검색수 (10 미만이면 0 + lt10)
  mobile: number;
  total: number;
  lt10: boolean; // "< 10" 으로 응답된 값이 있음
  compIdx: string; // 경쟁 정도: 높음/중간/낮음
  collected_at: string;
}

const norm = (k: string) => k.replace(/\s+/g, "").trim();

function num(v: unknown): { n: number; lt: boolean } {
  if (typeof v === "number") return { n: v, lt: false };
  const s = String(v ?? "").trim();
  if (s.startsWith("<")) return { n: 0, lt: true };
  const n = Number(s.replace(/,/g, ""));
  return { n: Number.isFinite(n) ? n : 0, lt: false };
}

async function callKeywordTool(hints: string[]) {
  const key = process.env.NAVER_AD_API_KEY!.trim();
  const secret = process.env.NAVER_AD_SECRET_KEY!.trim();
  const customer = process.env.NAVER_AD_CUSTOMER_ID!.trim();
  const uri = "/keywordstool";
  const ts = String(Date.now());
  const qs = new URLSearchParams({ hintKeywords: hints.join(","), showDetail: "1" });
  const res = await fetch(`${base()}${uri}?${qs}`, {
    headers: { "X-Timestamp": ts, "X-API-KEY": key, "X-Customer": customer, "X-Signature": signature(ts, "GET", uri, secret) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  void import("./health").then((h) => (res.ok ? h.markOk("naver_ad") : [401, 403].includes(res.status) ? h.markFail("naver_ad", `HTTP ${res.status}`) : undefined)).catch(() => {});
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      const d = JSON.parse(text);
      msg = d.title ?? d.message ?? d.detail ?? msg;
    } catch {
      /* JSON 아님 */
    }
    const hint = res.status === 401 || res.status === 403 ? " (API 키·비밀키·고객 ID를 확인하세요)" : res.status === 429 ? " (요청이 많아 잠시 후 다시 시도)" : "";
    throw new Error(`네이버 검색광고 API 오류 ${res.status}: ${msg}${hint}`);
  }
  return (JSON.parse(text).keywordList ?? []) as Record<string, unknown>[];
}

function toStat(r: Record<string, unknown>, at: string): KeywordStat {
  const pc = num(r.monthlyPcQcCnt);
  const mo = num(r.monthlyMobileQcCnt);
  return { keyword: String(r.relKeyword ?? ""), pc: pc.n, mobile: mo.n, total: pc.n + mo.n, lt10: pc.lt || mo.lt, compIdx: String(r.compIdx ?? ""), collected_at: at };
}

/**
 * 키워드별 월간 검색량. 7일 이내 조회한 값은 저장된 값을 사용(조회일 함께 표시).
 * withRelated 면 입력 키워드의 연관 키워드 상위 목록도 반환.
 */
export async function keywordStats(keywords: string[], opts: { withRelated?: boolean; force?: boolean } = {}) {
  if (!naverAdConnected()) throw new Error("네이버 검색광고 API 키(NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID)가 설정되지 않았습니다.");
  const list = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean))).slice(0, 50);
  const stats: Record<string, KeywordStat | null> = {};
  const todo: string[] = [];
  if (!opts.force) {
    const cached = await q<{ keyword: string; data: KeywordStat }>(
      "SELECT keyword, data FROM keyword_stats WHERE source='naver_ad' AND keyword = ANY($1) AND collected_at > NOW() - INTERVAL '7 days'",
      [list.map(norm)],
    );
    const map = new Map(cached.map((c) => [c.keyword, c.data]));
    for (const k of list) {
      const c = map.get(norm(k));
      if (c && !opts.withRelated) stats[k] = c;
      else todo.push(k);
    }
  } else todo.push(...list);

  const related: KeywordStat[] = [];
  const at = new Date().toISOString();
  // 한 번에 최대 5개 키워드
  for (let i = 0; i < todo.length; i += 5) {
    const batch = todo.slice(i, i + 5);
    const rows = (await callKeywordTool(batch.map(norm))).map((r) => toStat(r, at));
    const byKey = new Map(rows.map((r) => [norm(r.keyword), r]));
    for (const k of batch) {
      const s = byKey.get(norm(k)) ?? null;
      stats[k] = s;
      if (s) {
        await q(
          `INSERT INTO keyword_stats (keyword, source, data, collected_at) VALUES ($1,'naver_ad',$2,NOW())
           ON CONFLICT (keyword, source) DO UPDATE SET data=EXCLUDED.data, collected_at=NOW()`,
          [norm(k), j(s)],
        );
      }
    }
    if (opts.withRelated) related.push(...rows.filter((r) => !batch.some((b) => norm(b) === norm(r.keyword))));
  }
  return {
    stats,
    related: related.sort((a, b) => b.total - a.total).slice(0, 40),
    source: "네이버 검색광고 키워드 도구",
  };
}

/** 캐시된 검색량만 조회 (API 호출 없음) */
export async function cachedStats(keywords: string[]) {
  if (!keywords.length) return {} as Record<string, KeywordStat>;
  const rows = await q<{ keyword: string; data: KeywordStat }>("SELECT keyword, data FROM keyword_stats WHERE source='naver_ad' AND keyword = ANY($1)", [keywords.map(norm)]);
  const map = new Map(rows.map((r) => [r.keyword, r.data]));
  const out: Record<string, KeywordStat> = {};
  for (const k of keywords) {
    const s = map.get(norm(k));
    if (s) out[k] = s;
  }
  return out;
}
