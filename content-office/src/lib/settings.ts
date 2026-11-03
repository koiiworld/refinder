import "server-only";
import { q, q1, j } from "./db";

export interface AppSettings {
  fallbackToTemplate: boolean;
  pricing: Record<string, { input: number; output: number }>; // key: provider:model, USD / 1M tokens
}

const DEFAULTS: AppSettings = { fallbackToTemplate: true, pricing: {} };

export async function getSettings(): Promise<AppSettings> {
  const row = await q1<{ value: AppSettings }>("SELECT value FROM settings WHERE key='app'");
  return { ...DEFAULTS, ...(row?.value ?? {}) };
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
