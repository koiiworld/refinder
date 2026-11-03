import "server-only";
import { q, q1, j } from "./db";
import { DEFAULT_STEP_AI, type StepKey } from "./steps";
import type { RoleAssignment } from "./types";

export interface AppSettings {
  fallbackToTemplate: boolean;
  pricing: Record<string, { input: number; output: number }>; // key: provider:model, USD / 1M tokens
  stepAi: Record<StepKey, RoleAssignment>; // 단계별 담당 AI
}

const DEFAULTS: AppSettings = { fallbackToTemplate: true, pricing: {}, stepAi: { ...DEFAULT_STEP_AI } };

export async function getSettings(): Promise<AppSettings> {
  const row = await q1<{ value: Partial<AppSettings> }>("SELECT value FROM settings WHERE key='app'");
  const v = row?.value ?? {};
  return { ...DEFAULTS, ...v, stepAi: { ...DEFAULT_STEP_AI, ...(v.stepAi ?? {}) } };
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
