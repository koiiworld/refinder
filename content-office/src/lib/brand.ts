import "server-only";
import { q, q1, j } from "./db";

/** 왼쪽 위 로고 (아이콘 글자·이름·색) — settings 'brand' */
export type Brand = { name: string; mark: string; color: string };
export const DEFAULT_BRAND: Brand = { name: "콘텐츠 오피스", mark: "AI", color: "" };

export async function getBrand(): Promise<Brand> {
  const r = await q1<{ value: Partial<Brand> }>("SELECT value FROM settings WHERE key='brand'").catch(() => null);
  return { ...DEFAULT_BRAND, ...(r?.value ?? {}) };
}

export async function saveBrand(input: Partial<Brand>): Promise<Brand> {
  const name = String(input.name ?? "").trim().slice(0, 20) || DEFAULT_BRAND.name;
  const mark = Array.from(String(input.mark ?? "").trim()).slice(0, 2).join("") || DEFAULT_BRAND.mark;
  const color = /^#[0-9a-fA-F]{6}$/.test(String(input.color ?? "")) ? String(input.color) : "";
  const b = { name, mark, color };
  await q(`INSERT INTO settings (key, value) VALUES ('brand', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(b)]);
  return b;
}
