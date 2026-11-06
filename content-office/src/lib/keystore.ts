import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { q, q1, j } from "./db";
import { clearProblem, type Feature } from "./health";

/**
 * 설정 화면에서 직접 넣는 API 키
 * - DB(settings 'api_keys')에는 앱 비밀번호(APP_PASSWORD)로 암호화해서 저장 → DB만 봐서는 키를 알 수 없음
 * - 서버가 켜질 때·1분마다 읽어 process.env 에 넣음 (맥·Render 둘 다 같은 DB라 한 번 넣으면 둘 다 적용)
 * - 앱에 넣은 키가 서버 환경변수(.env.local·Render)보다 우선. 지우면 원래 환경변수로 돌아감
 * - 화면에는 끝 4자리만 보여 주고 키 자체는 절대 돌려주지 않음
 */
export const KEY_FIELDS = [
  { env: "OPENAI_API_KEY", label: "ChatGPT (OpenAI)", group: "AI", feature: "ai_openai" },
  { env: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)", group: "AI", feature: "ai_anthropic" },
  { env: "GOOGLE_AI_TEXT_API_KEY", label: "Gemini 글쓰기 (무료 키)", group: "AI", feature: "ai_google" },
  { env: "GOOGLE_AI_API_KEY", label: "Gemini 이미지 (결제된 키)", group: "AI" },
  { env: "HIGGSFIELD_API_KEY", label: "Higgsfield (키ID:시크릿)", group: "AI", feature: "higgsfield" },
  { env: "NAVER_CLIENT_ID", label: "네이버 검색 API · Client ID", group: "네이버", feature: "naver_search" },
  { env: "NAVER_CLIENT_SECRET", label: "네이버 검색 API · Client Secret", group: "네이버", feature: "naver_search" },
  { env: "NAVER_AD_API_KEY", label: "네이버 검색광고 · API 키", group: "네이버", feature: "naver_ad" },
  { env: "NAVER_AD_SECRET_KEY", label: "네이버 검색광고 · 비밀키", group: "네이버", feature: "naver_ad" },
  { env: "NAVER_AD_CUSTOMER_ID", label: "네이버 검색광고 · 고객 ID", group: "네이버", feature: "naver_ad" },
  { env: "YOUTUBE_API_KEY", label: "YouTube Data API", group: "기타" },
  { env: "COUPANG_ACCESS_KEY", label: "쿠팡파트너스 · Access Key", group: "기타", feature: "coupang" },
  { env: "COUPANG_SECRET_KEY", label: "쿠팡파트너스 · Secret Key", group: "기타", feature: "coupang" },
  { env: "TELEGRAM_BOT_TOKEN", label: "텔레그램 봇 토큰", group: "기타" },
  { env: "TELEGRAM_CHAT_ID", label: "텔레그램 채팅 ID", group: "기타" },
] as const;
export type KeyEnv = (typeof KEY_FIELDS)[number]["env"];

type Stored = { enc: string; iv: string; tag: string; last4: string; at: string };
type All = Partial<Record<KeyEnv, Stored>>;

const g = globalThis as unknown as { __keyOrig?: Record<string, string | undefined>; __keyApplied?: Record<string, "app" | "unreadable">; __keyTimer?: boolean };
// 서버가 처음 읽은 환경변수 (앱 키를 지우면 이 값으로 돌아감)
const orig = (g.__keyOrig ??= Object.fromEntries(KEY_FIELDS.map((f) => [f.env, process.env[f.env]])));
const applied = (g.__keyApplied ??= {});

function secret() {
  const pw = process.env.APP_PASSWORD?.trim() || process.env.KEYS_SECRET?.trim();
  return pw ? createHash("sha256").update("content-office-keys:" + pw).digest() : null;
}

function encrypt(value: string): Stored {
  const k = secret();
  if (!k) throw new Error("앱 비밀번호(APP_PASSWORD)가 있어야 키를 안전하게 저장할 수 있어요.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return { enc: enc.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), last4: value.slice(-4), at: new Date().toISOString() };
}

function decryptWith(k: Buffer, s: Stored): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(s.iv, "base64"));
    d.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(s.enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // 앱 비밀번호가 바뀌었거나 다른 서버의 비밀번호가 다름
  }
}
/** 지금 비밀번호로 풀기 → 안 되면 예전 비밀번호(APP_PASSWORD_OLD)로 풀고 '다시 잠가야 함' 표시 */
function decrypt(s: Stored): { value: string; rekey: boolean } | null {
  const k = secret();
  const v = k ? decryptWith(k, s) : null;
  if (v) return { value: v, rekey: false };
  const old = process.env.APP_PASSWORD_OLD?.trim();
  if (!old || !k) return null;
  const ov = decryptWith(createHash("sha256").update("content-office-keys:" + old).digest(), s);
  return ov ? { value: ov, rekey: true } : null;
}

async function load(): Promise<All> {
  const r = await q1<{ value: All }>("SELECT value FROM settings WHERE key='api_keys'").catch(() => null);
  return r?.value ?? {};
}

/** DB의 키를 이 서버의 process.env 에 반영 */
export async function applyStoredKeys() {
  const all = await load();
  for (const f of KEY_FIELDS) {
    const s = all[f.env];
    const d = s ? decrypt(s) : null;
    const v = d?.value ?? null;
    // 비밀번호를 바꿨으면: 예전 비밀번호로 푼 키를 새 비밀번호로 다시 잠가 저장 (다시 입력할 필요 없음)
    if (d?.rekey && s) {
      const re = { ...encrypt(d.value), at: s.at };
      await q(`UPDATE settings SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb) WHERE key='api_keys'`, [f.env, j(re)]).catch(() => {});
    }
    if (v) {
      process.env[f.env] = v;
      applied[f.env] = "app";
    } else {
      if (orig[f.env] === undefined) delete process.env[f.env];
      else process.env[f.env] = orig[f.env];
      if (s) applied[f.env] = "unreadable";
      else delete applied[f.env];
    }
  }
}

/** 서버 시작 시 한 번 + 1분마다 (다른 서버에서 바꾼 키도 따라감) */
export function startKeySync() {
  if (g.__keyTimer) return;
  g.__keyTimer = true;
  void applyStoredKeys().catch(() => {});
  setInterval(() => void applyStoredKeys().catch(() => {}), 60_000).unref?.();
}

/** 화면용 상태 (키 값은 절대 포함하지 않음) */
export async function keyStatus() {
  await applyStoredKeys().catch(() => {});
  const all = await load();
  return KEY_FIELDS.map((f) => {
    const s = all[f.env];
    const state: "app" | "env" | "none" | "unreadable" = applied[f.env] === "app" ? "app" : applied[f.env] === "unreadable" ? "unreadable" : orig[f.env]?.trim() ? "env" : "none";
    return { env: f.env, label: f.label, group: f.group, state, last4: state === "app" ? s?.last4 ?? "" : "", at: s?.at ?? null };
  });
}

export const canSaveKeys = () => !!secret();

export async function saveKey(env: string, value: string) {
  const f = KEY_FIELDS.find((x) => x.env === env);
  if (!f) throw new Error("알 수 없는 키예요.");
  const v = String(value ?? "").trim();
  if (!v) throw new Error("키를 붙여 넣어 주세요.");
  if (v.length > 600 || /\s/.test(v)) throw new Error("키 형식을 확인해 주세요 (띄어쓰기·줄바꿈 없이).");
  const st = encrypt(v);
  await q(
    `INSERT INTO settings (key, value) VALUES ('api_keys', jsonb_build_object($1::text, $2::jsonb))
     ON CONFLICT (key) DO UPDATE SET value = COALESCE(settings.value, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb)`,
    [env, j(st)],
  );
  await applyStoredKeys();
  if ("feature" in f) await clearProblem(f.feature as Feature).catch(() => {});
}

export async function removeKey(env: string) {
  if (!KEY_FIELDS.some((x) => x.env === env)) throw new Error("알 수 없는 키예요.");
  await q("UPDATE settings SET value = value - $1::text WHERE key='api_keys'", [env]);
  await applyStoredKeys();
}
