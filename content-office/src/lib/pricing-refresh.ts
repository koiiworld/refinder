import "server-only";
import { q, q1, j } from "./db";
import { getSettings, saveSettings } from "./settings";

/**
 * AI 단가 새로고침: 공개 가격표(LiteLLM model_prices_and_context_window.json)에서 각 모델 단가를 찾아
 * 지금 값과 다르면 바꾸고 'NEW' 표시용으로 바뀐 날짜를 남김 (settings 'pricing_updates')
 */
const SOURCE = () => process.env.PRICING_SOURCE_URL?.trim() || "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const PREFIX: Record<string, string[]> = { openai: ["", "openai/"], anthropic: ["", "anthropic/"], google: ["gemini/", ""] };
const PROVIDER_NAME: Record<string, string[]> = { openai: ["openai", "text-completion-openai"], anthropic: ["anthropic"], google: ["gemini", "vertex_ai-language-models"] };
export const NEW_DAYS = 7;

type Entry = { input_cost_per_token?: number; output_cost_per_token?: number; litellm_provider?: string };
export type PriceUpdate = { at: string; from: { input: number; output: number }; to: { input: number; output: number } };

const per1M = (v: number) => Math.round(v * 1e6 * 10000) / 10000;

export async function pricingUpdates(): Promise<Record<string, PriceUpdate>> {
  const r = await q1<{ value: Record<string, PriceUpdate> }>("SELECT value FROM settings WHERE key='pricing_updates'").catch(() => null);
  return r?.value ?? {};
}

export async function refreshPricing(extraKeys: string[] = []) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let table: Record<string, Entry>;
  try {
    const res = await fetch(SOURCE(), { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`가격표를 못 받았어요 (${res.status})`);
    table = (await res.json()) as Record<string, Entry>;
  } catch (e) {
    throw new Error((e as Error).name === "AbortError" ? "가격표 응답이 너무 늦어요. 잠시 뒤 다시 눌러 주세요." : (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
  const settings = await getSettings();
  const keys = Array.from(new Set([...Object.keys(settings.pricing), ...Object.values(settings.stepAi).map((a) => `${a.provider}:${a.model}`), ...extraKeys]));
  const pricing = { ...settings.pricing };
  const updates = await pricingUpdates();
  const changed: string[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const [provider, ...rest] = key.split(":");
    const model = rest.join(":");
    const e = (PREFIX[provider] ?? [""])
      .map((p) => table[p + model])
      .find((x) => x && typeof x.input_cost_per_token === "number" && (!x.litellm_provider || (PROVIDER_NAME[provider] ?? []).includes(x.litellm_provider)));
    if (!e) {
      missing.push(key);
      continue;
    }
    const to = { input: per1M(e.input_cost_per_token ?? 0), output: per1M(e.output_cost_per_token ?? 0) };
    const from = pricing[key] ?? { input: 0, output: 0 };
    if (Math.abs(from.input - to.input) > 1e-6 || Math.abs(from.output - to.output) > 1e-6) {
      pricing[key] = to;
      updates[key] = { at: new Date().toISOString(), from, to };
      changed.push(key);
    }
  }
  if (changed.length) {
    await saveSettings({ pricing });
    await q(`INSERT INTO settings (key, value) VALUES ('pricing_updates', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(updates)]);
  }
  return { checked: keys.length, changed, missing, pricing, updates };
}
