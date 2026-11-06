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
type Stored = Partial<Record<BalanceProvider, { topups: TopUp[] }>>;

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

export async function balances() {
  const s = await stored();
  const rows = [];
  for (const p of BALANCE_PROVIDERS) {
    const topups = (s[p.id]?.topups ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
    const charged = topups.reduce((a, t) => a + t.usd, 0);
    const since = topups[0]?.at ?? null;
    const used = await usedSince(p.id, since);
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

export async function removeTopUp(provider: string, index: number) {
  const s = await stored();
  const cur = s[provider as BalanceProvider]?.topups ?? [];
  const sorted = cur.slice().sort((a, b) => a.at.localeCompare(b.at));
  sorted.splice(index, 1);
  s[provider as BalanceProvider] = { topups: sorted };
  await save(s);
}
