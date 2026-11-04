import "server-only";
import { q, q1, j } from "./db";
import { DEFAULT_STEP_AI, type StepKey } from "./steps";
import type { RoleAssignment } from "./types";
import { catalogPricing } from "./model-catalog";

export interface AppSettings {
  fallbackToTemplate: boolean;
  pricing: Record<string, { input: number; output: number }>; // key: provider:model, USD / 1M tokens
  stepAi: Record<StepKey, RoleAssignment>; // 단계별 담당 AI
}

/** 기본 단가 (USD / 100만 토큰). 설정에서 직접 고치면 그 값이 우선합니다. */
export const DEFAULT_PRICING: AppSettings["pricing"] = catalogPricing();

const DEFAULTS: AppSettings = { fallbackToTemplate: true, pricing: {}, stepAi: { ...DEFAULT_STEP_AI } };

export async function getSettings(): Promise<AppSettings> {
  const row = await q1<{ value: Partial<AppSettings> }>("SELECT value FROM settings WHERE key='app'");
  const v = row?.value ?? {};
  const userPricing = Object.fromEntries(Object.entries(v.pricing ?? {}).filter(([, p]) => p && (Number(p.input) > 0 || Number(p.output) > 0)));
  return { ...DEFAULTS, ...v, pricing: { ...DEFAULT_PRICING, ...userPricing }, stepAi: { ...DEFAULT_STEP_AI, ...(v.stepAi ?? {}) } };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await q(
    `INSERT INTO settings (key, value) VALUES ('app', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [j(next)],
  );
  return next;
}
