import "server-only";
import { q, q1, j } from "./db";

/**
 * 기능별 고장 알림: 외부 서비스에 기대는 기능이 연속으로 실패하면 대시보드 맨 위에 '점검 필요'
 * - 상태는 settings 'health' 에 저장 (상태가 바뀔 때·10분에 한 번만 기록해 DB 부담 적게)
 * - fix: self = 사용자가 직접(충전·키·설정), code = 코드 수정 필요(Claude Code·Codex), auto = 자동 복구 시도 중
 */

export const FEATURES = {
  visits: { label: "블로그 방문자 수 수집", fix: "code", hint: "네이버·티스토리 화면이 바뀌었을 수 있어요." },
  coupang: { label: "쿠팡파트너스 수익 집계", fix: "self", hint: "쿠팡 API 키(Access·Secret)가 맞는지, 파트너스 승인 상태를 확인하세요." },
  blog_hot: { label: "블로그 핫이슈 (네이버 블로그 홈)", fix: "code", hint: "네이버 블로그 홈 구조가 바뀌었을 수 있어요." },
  google_trends: { label: "구글 트렌드", fix: "code", hint: "구글 트렌드 주소·형식이 바뀌었을 수 있어요." },
  naver_search: { label: "네이버 검색 API (진단·뉴스)", fix: "self", hint: "NAVER API HUB 키와 '블로그·뉴스 검색' 사용 설정을 확인하세요." },
  naver_ad: { label: "네이버 검색광고 (검색량)", fix: "self", hint: "검색광고 API 키를 확인하세요." },
  video_download: { label: "영상 받기 (인스타·유튜브)", fix: "auto", hint: "받기 도구를 자동으로 최신으로 바꿔 다시 시도해요. 계속되면 코드 확인이 필요해요." },
  ai_openai: { label: "ChatGPT (OpenAI)", fix: "self", hint: "크레딧이 떨어졌거나 키가 막혔어요. 충전하거나 설정에서 다른 AI로 바꾸세요." },
  ai_anthropic: { label: "Claude (Anthropic)", fix: "self", hint: "크레딧이 떨어졌거나 키가 막혔어요. 충전하거나 설정에서 다른 AI로 바꾸세요." },
  ai_google: { label: "Gemini (무료 키)", fix: "self", hint: "무료 한도를 넘었거나 키가 막혔어요. 잠시 뒤 저절로 풀리기도 해요." },
  higgsfield: { label: "Higgsfield (이미지·영상)", fix: "self", hint: "크레딧이 떨어졌거나 키가 막혔어요." },
} as const;
export type Feature = keyof typeof FEATURES;
type State = { ok_at?: string; fail_at?: string; fails: number; error?: string };
type All = Partial<Record<Feature, State>>;

const g = globalThis as unknown as { __health?: { at: number; data: All }; __healthWrite?: Partial<Record<Feature, number>> };
const written = (g.__healthWrite ??= {});

async function load(): Promise<All> {
  if (g.__health && Date.now() - g.__health.at < 30_000) return g.__health.data;
  const r = await q1<{ value: All }>("SELECT value FROM settings WHERE key='health'").catch(() => null);
  g.__health = { at: Date.now(), data: r?.value ?? {} };
  return g.__health.data;
}
async function put(f: Feature, st: State) {
  const data = await load();
  data[f] = st;
  written[f] = Date.now();
  // 기능 하나만 바꿔 씀 (다른 서버가 쓴 값 덮어쓰지 않게)
  await q(
    `INSERT INTO settings (key, value) VALUES ('health', jsonb_build_object($1::text, $2::jsonb))
     ON CONFLICT (key) DO UPDATE SET value = COALESCE(settings.value, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb)`,
    [f, j(st)],
  ).catch(() => {});
}

export async function markOk(f: Feature) {
  const cur = (await load())[f];
  if (cur && cur.fails === 0 && written[f] && Date.now() - written[f]! < 10 * 60 * 1000) return;
  if (cur && cur.fails === 0 && cur.ok_at && Date.now() - new Date(cur.ok_at).getTime() < 10 * 60 * 1000) return;
  await put(f, { ok_at: new Date().toISOString(), fail_at: cur?.fail_at, fails: 0 });
}

export async function markFail(f: Feature, error: string) {
  const cur = (await load())[f];
  await put(f, { ok_at: cur?.ok_at, fail_at: new Date().toISOString(), fails: (cur?.fails ?? 0) + 1, error: error.slice(0, 300) });
}

/** 점검이 필요한 기능 (연속 실패 기준: AI·키는 1번, 나머지는 3번) */
export async function healthProblems() {
  g.__health = undefined;
  const data = await load();
  return (Object.keys(FEATURES) as Feature[])
    .map((f) => ({ f, st: data[f] }))
    .filter(({ f, st }) => st && st.fails >= (f.startsWith("ai_") || f === "higgsfield" || f === "coupang" ? 1 : 3) && (!st.ok_at || (st.fail_at ?? "") > st.ok_at))
    .map(({ f, st }) => ({ id: f, label: FEATURES[f].label, fix: FEATURES[f].fix, hint: FEATURES[f].hint, fails: st!.fails, since: st!.fail_at ?? null, error: st!.error ?? "" }));
}

export async function clearProblem(f: string) {
  if (!(f in FEATURES)) return;
  await put(f as Feature, { ok_at: new Date().toISOString(), fails: 0 });
}
