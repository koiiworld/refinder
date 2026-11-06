import "server-only";
import { q, q1, j } from "./db";
import { getSettings } from "./settings";

/**
 * AI별 잔액 (충전액 − 앱에서 쓴 금액)
 * - OpenAI·Anthropic·Google은 API 키로 남은 크레딧을 알려 주지 않아, 충전한 금액을 직접 기록하고
 *   앱이 기록한 사용 비용(토큰 × 단가 추정, Higgsfield는 생성 때 받은 예상 금액)을 빼서 계산
 * - 앱 밖(각 사 웹사이트 등)에서 쓴 금액은 포함되지 않음
 */

export const BALANCE_PROVIDERS = [
  { id: "openai", name: "ChatGPT (OpenAI)", billing: "https://platform.openai.com/settings/organization/billing/overview" },
  { id: "anthropic", name: "Claude (Anthropic)", billing: "https://console.anthropic.com/settings/billing" },
  { id: "higgsfield", name: "Higgsfield", billing: "https://cloud.higgsfield.ai" },
  { id: "google-image", name: "Gemini 이미지 (유료 키)", billing: "https://aistudio.google.com/usage" },
] as const;
export type BalanceProvider = (typeof BALANCE_PROVIDERS)[number]["id"];
type TopUp = { usd: number; at: string; note?: string };
type Stored = Partial<Record<BalanceProvider, { topups: TopUp[]; actual?: { usd: number; at: string } }>>;

async function stored(): Promise<Stored> {
  const r = await q1<{ value: Stored }>("SELECT value FROM settings WHERE key='ai_balances'");
  return r?.value ?? {};
}
async function save(v: Stored) {
  await q(`INSERT INTO settings (key, value) VALUES ('ai_balances', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(v)]);
}

/** 특정 시각 이후 앱에서 쓴 금액 (USD) */
async function usedSince(p: BalanceProvider, since: string | null) {
  const from = since ?? "1970-01-01";
  if (p === "higgsfield") {
    await backfillHiggsfield();
    const r = await q1<{ usd: number; n: number }>(
      "SELECT COALESCE(SUM(cost_usd),0)::float AS usd, COUNT(*)::int AS n FROM media_jobs WHERE provider='higgsfield' AND status NOT IN ('failed','canceled','error','nsfw') AND created_at >= $1",
      [from],
    );
    return { usd: Number(r?.usd ?? 0), calls: Number(r?.n ?? 0) };
  }
  // 대시보드 'AI 비용'과 같은 계산: 기록된 비용이 없으면 토큰 × 현재 단가
  const cond = p === "google-image" ? "provider='google' AND purpose='image'" : `provider='${p}'`;
  const rows = await q<{ provider: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number }>(
    `SELECT provider, model, COALESCE(input_tokens,0) AS input_tokens, COALESCE(output_tokens,0) AS output_tokens, COALESCE(cost_usd,0) AS cost_usd FROM ai_runs WHERE ${cond} AND status='succeeded' AND created_at >= $1`,
    [from],
  );
  const { pricing } = await getSettings();
  const usd = rows.reduce((s, r) => {
    if (Number(r.cost_usd) > 0) return s + Number(r.cost_usd);
    const pr = pricing[`${r.provider}:${r.model}`];
    return s + (pr ? (Number(r.input_tokens) * pr.input + Number(r.output_tokens) * pr.output) / 1_000_000 : 0);
  }, 0);
  return { usd, calls: rows.length };
}

/** 비용 기록 전에 만든 Higgsfield 작업: 저장된 요청으로 견적(무료)을 받아 채움 */
async function backfillHiggsfield() {
  const rows = await q<{ id: string; model: string; input: Record<string, unknown> }>("SELECT id, model, input FROM media_jobs WHERE provider='higgsfield' AND cost_usd IS NULL AND status NOT IN ('failed','canceled','error','nsfw') LIMIT 20");
  if (!rows.length) return;
  const { HF_MODELS } = await import("./hf-models");
  const { hfEstimate, hfConnected } = await import("./higgsfield");
  if (!hfConnected()) return;
  for (const r of rows) {
    const def = (HF_MODELS as Record<string, { path: string }>)[r.model];
    if (!def) continue;
    const est = await hfEstimate(def.path, r.input ?? {}).catch(() => null);
    if (est?.usd != null) await q("UPDATE media_jobs SET cost_usd=$2 WHERE id=$1", [r.id, est.usd]);
  }
}

export async function balances() {
  const s = await stored();
  const rows = [];
  for (const p of BALANCE_PROVIDERS) {
    const topups = (s[p.id]?.topups ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
    const charged = topups.reduce((a, t) => a + t.usd, 0);
    const since = topups[0]?.at ?? null;
    // '실제 사용액 맞추기': 그 시점까지는 사용자가 적은 실제 금액, 이후는 앱 기록
    const actual = s[p.id]?.actual;
    const after = actual ? await usedSince(p.id, actual.at) : null;
    const base = await usedSince(p.id, since);
    const used = actual && after ? { usd: actual.usd + after.usd, calls: base.calls } : base;
    rows.push({
      id: p.id,
      name: p.name,
      billing: p.billing,
      topups,
      charged: topups.length ? charged : null,
      used: used.usd,
      calls: used.calls,
      since,
      remaining: topups.length ? charged - used.usd : null,
      rate: topups.length && charged > 0 ? used.usd / charged : null,
      actual: actual ?? null,
    });
  }
  return rows;
}

export async function addTopUp(provider: string, usd: number, at?: string, note?: string) {
  if (!BALANCE_PROVIDERS.some((p) => p.id === provider)) throw new Error("알 수 없는 AI입니다.");
  if (!(usd > 0) || usd > 100000) throw new Error("충전 금액을 확인해 주세요 (달러).");
  const when = at && !isNaN(new Date(at).getTime()) ? new Date(at).toISOString() : new Date().toISOString();
  const s = await stored();
  const cur = s[provider as BalanceProvider]?.topups ?? [];
  s[provider as BalanceProvider] = { topups: [...cur, { usd: Math.round(usd * 100) / 100, at: when, note: String(note ?? "").slice(0, 60) }] };
  await save(s);
}

/** 각 사 결제 화면의 실제 사용액으로 맞추기 (지금까지 = usd, 이후는 앱 기록을 더함). usd 가 null 이면 해제 */
export async function setActualUsed(provider: string, usd: number | null) {
  if (!BALANCE_PROVIDERS.some((p) => p.id === provider)) throw new Error("알 수 없는 AI입니다.");
  const s = await stored();
  const cur = s[provider as BalanceProvider] ?? { topups: [] };
  if (usd == null) delete cur.actual;
  else {
    if (!(usd >= 0) || usd > 100000) throw new Error("사용액을 확인해 주세요 (달러).");
    cur.actual = { usd: Math.round(usd * 10000) / 10000, at: new Date().toISOString() };
  }
  s[provider as BalanceProvider] = cur;
  await save(s);
}

export async function removeTopUp(provider: string, index: number) {
  const s = await stored();
  const cur = s[provider as BalanceProvider]?.topups ?? [];
  const sorted = cur.slice().sort((a, b) => a.at.localeCompare(b.at));
  sorted.splice(index, 1);
  s[provider as BalanceProvider] = { topups: sorted };
  await save(s);
}
