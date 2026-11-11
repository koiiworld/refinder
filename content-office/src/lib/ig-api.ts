import "server-only";
import { q, q1, j, newId } from "./db";

/**
 * 📊 인스타그램 API (Instagram 로그인 방식, 프로페셔널 계정)
 * - 키: 설정 → 키 → INSTAGRAM_ACCESS_TOKEN (암호화 저장, 맥·Render 공용)
 * - 읽기만 함: 프로필 숫자 · 최근 게시물 · 게시물별 인사이트(도달·조회·저장·공유 등). 게시·답글 달기는 하지 않음
 * - 하루 한 번(또는 '지금 새로고침') 받아 research_snapshots(source='ig_daily')에 날짜별로 저장 → 팔로워 추이
 * - 토큰은 60일 만료 → 20일 넘으면 자동 연장
 */
const BASE = () => (process.env.INSTAGRAM_GRAPH_BASE?.trim() || "https://graph.instagram.com").replace(/\/$/, "");
const token = () => process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || "";
export const igConnected = () => !!token();

export type IgProfile = { id: string; username: string; name?: string; followers: number | null; follows: number | null; mediaCount: number | null; picture?: string };
export type IgPost = {
  id: string; caption: string; type: string; product: string; permalink: string; thumb: string; at: string;
  likes: number | null; comments: number | null;
  reach: number | null; views: number | null; saved: number | null; shares: number | null; interactions: number | null; avgWatchSec: number | null;
};
export type IgDay = { day: string; followers: number | null; mediaCount: number | null };
export type IgDashboard = { connected: boolean; profile: IgProfile | null; posts: IgPost[]; history: IgDay[]; at: string | null; error?: string };

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(`${BASE()}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token());
  const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || d.error) {
    const msg = d.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 401 || d.error?.code === 190) throw new Error(`인스타 토큰이 만료됐거나 잘못됐어요. 메타 개발자 앱에서 토큰을 다시 만들어 설정에 넣어 주세요. (${msg})`);
    throw new Error(`인스타 API 오류: ${msg}`);
  }
  return d;
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

/** 게시물 인사이트: 지표 이름이 게시물 종류·API 버전마다 달라서, 묶음으로 먼저 받고 안 되면 하나씩 */
async function postInsights(id: string, reel: boolean) {
  const want = ["reach", "views", "saved", "shares", "total_interactions", ...(reel ? ["ig_reels_avg_watch_time"] : [])];
  const pick = (data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[]) =>
    Object.fromEntries(data.map((m) => [m.name, num(m.total_value?.value ?? m.values?.[0]?.value)]));
  try {
    const r = await get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${id}/insights`, { metric: want.join(",") });
    return pick(r.data ?? []);
  } catch {
    const each = await Promise.all(want.map((m) => get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${id}/insights`, { metric: m }).then((r) => r.data ?? []).catch(() => [])));
    return pick(each.flat());
  }
}

/** 20일 넘은 토큰은 60일짜리로 연장해서 다시 저장 */
async function maybeRefreshToken() {
  const row = await q1<{ at: string | null }>("SELECT value->'INSTAGRAM_ACCESS_TOKEN'->>'at' AS at FROM settings WHERE key='api_keys'").catch(() => null);
  if (!row?.at || Date.now() - new Date(row.at).getTime() < 20 * 86400_000) return;
  try {
    const r = await get<{ access_token?: string }>("/refresh_access_token", { grant_type: "ig_refresh_token" });
    if (r.access_token) {
      const { saveKey, canSaveKeys } = await import("./keystore");
      if (canSaveKeys()) await saveKey("INSTAGRAM_ACCESS_TOKEN", r.access_token);
    }
  } catch { /* 다음에 다시 */ }
}

const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** 지금 받아서 오늘 날짜로 저장 */
export async function syncInstagram(limit = 30) {
  if (!igConnected()) throw new Error("인스타 토큰이 없어요. 설정 → 키에서 '인스타그램 액세스 토큰'을 넣어 주세요.");
  await maybeRefreshToken();
  const me = await get<{ user_id?: string; id?: string; username: string; name?: string; followers_count?: number; follows_count?: number; media_count?: number; profile_picture_url?: string }>("/me", { fields: "user_id,username,name,followers_count,follows_count,media_count,profile_picture_url" });
  const profile: IgProfile = { id: String(me.user_id ?? me.id ?? ""), username: me.username, name: me.name, followers: num(me.followers_count), follows: num(me.follows_count), mediaCount: num(me.media_count), picture: me.profile_picture_url };
  const media = await get<{ data: { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp?: string; like_count?: number; comments_count?: number }[] }>("/me/media", {
    fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: String(Math.min(50, limit)),
  });
  const posts: IgPost[] = [];
  for (const m of media.data ?? []) {
    const reel = m.media_product_type === "REELS";
    const ins = await postInsights(m.id, reel);
    posts.push({
      id: m.id, caption: String(m.caption ?? "").slice(0, 500), type: m.media_type ?? "", product: m.media_product_type ?? "", permalink: m.permalink ?? "",
      thumb: m.thumbnail_url ?? (m.media_type === "VIDEO" ? "" : m.media_url ?? ""), at: m.timestamp ?? "",
      likes: num(m.like_count), comments: num(m.comments_count),
      reach: ins.reach ?? null, views: ins.views ?? null, saved: ins.saved ?? null, shares: ins.shares ?? null, interactions: ins.total_interactions ?? null,
      avgWatchSec: ins.ig_reels_avg_watch_time != null ? Math.round(ins.ig_reels_avg_watch_time / 100) / 10 : null,
    });
  }
  const day = kstDay();
  await q("DELETE FROM research_snapshots WHERE source='ig_daily' AND query->>'day'=$1", [day]);
  await q("INSERT INTO research_snapshots (id, blog_id, source, query, data) VALUES ($1,NULL,'ig_daily',$2,$3)", [newId("snap_"), j({ day }), j({ profile, posts })]);
  return { profile, posts, day };
}

/** 대시보드 데이터 (저장된 것) */
export async function igDashboard(): Promise<IgDashboard> {
  const rows = await q<{ day: string; data: { profile: IgProfile; posts: IgPost[] }; at: string }>(
    "SELECT query->>'day' AS day, data, collected_at AS at FROM research_snapshots WHERE source='ig_daily' ORDER BY query->>'day' DESC LIMIT 120",
  );
  const latest = rows[0];
  return {
    connected: igConnected(),
    profile: latest?.data.profile ?? null,
    posts: latest?.data.posts ?? [],
    history: rows.map((r) => ({ day: r.day, followers: r.data.profile?.followers ?? null, mediaCount: r.data.profile?.mediaCount ?? null })).reverse(),
    at: latest?.at ?? null,
  };
}

/** 하루 한 번 자동 수집 (맥·Render 중 한 곳만, 키가 있을 때만) */
export async function igDailyTick() {
  if (!igConnected()) return;
  const day = kstDay();
  const claim = await q1(
    `INSERT INTO settings (key, value) VALUES ('ig_sync_day', jsonb_build_object('day', $1::text))
     ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object('day', $1::text) WHERE settings.value->>'day' <> $1 RETURNING key`,
    [day],
  );
  if (!claim) return;
  await syncInstagram().catch(async () => {
    // 실패하면 오늘 다시 시도할 수 있게 표시 되돌림
    await q("DELETE FROM settings WHERE key='ig_sync_day'").catch(() => {});
  });
}
