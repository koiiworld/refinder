import "server-only";
import { q, q1, j } from "./db";
import { MENU_GROUPS, MENU_TOP, type FeatureOff } from "./menu";

/** 설정 > 기능 켜기·끄기 (settings 'features' = { off: ['g:insta', '/diagnose', ...] }) */
const VALID = new Set([MENU_TOP.href, ...MENU_GROUPS.map((g) => `g:${g.id}`), ...MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href))]);

export async function getFeatureOff(): Promise<FeatureOff> {
  const r = await q1<{ value: { off?: string[] } }>("SELECT value FROM settings WHERE key='features'").catch(() => null);
  return (r?.value?.off ?? []).filter((x) => VALID.has(x));
}

export async function saveFeatureOff(off: unknown): Promise<FeatureOff> {
  const clean = Array.from(new Set((Array.isArray(off) ? off : []).map(String).filter((x) => VALID.has(x))));
  await q(`INSERT INTO settings (key, value) VALUES ('features', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j({ off: clean })]);
  return clean;
}
