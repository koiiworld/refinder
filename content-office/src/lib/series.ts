import "server-only";
import { q, q1, newId, j } from "./db";
import { extractJson, runStep } from "./ai/run";
import { enqueue } from "./jobs";
import { STUDIO_STYLES } from "./studio";

/**
 * 📺 시리즈 기획: 주인공·친구·주제 → N화를 한 번에 (화마다 제목·줄거리 3줄·8초 장면 프롬프트·유튜브 설명 2줄)
 * - 캐릭터 생김새 문장(영어)을 한 번 정해서 모든 화·모든 장면에 똑같이 넣음 → 화가 바뀌어도 같은 캐릭터
 * - '다음 화 이어서' 는 같은 문장·같은 형식으로 이어서 만듦
 * - '모든 화 기획 걸어두기' 는 화마다 영상 스튜디오 프로젝트를 작업 대기열로 만들어 둠 (이미지·영상은 버튼을 눌러야 생성 = 비용)
 */
export type Episode = { n: number; title: string; synopsis: string; scenePrompt: string; description: string; studioId?: string | null };
export type Series = { id: string; title: string; hero: string; friend: string; theme: string; style: string; characters: string; episodes: Episode[]; created_at: string; updated_at: string };

export async function listSeries() {
  return q<Series>("SELECT * FROM studio_series ORDER BY updated_at DESC LIMIT 50");
}
export async function getSeries(id: string) {
  return q1<Series>("SELECT * FROM studio_series WHERE id=$1", [id]);
}
async function save(id: string, patch: Partial<Series>) {
  const keys = Object.keys(patch) as (keyof Series)[];
  await q(`UPDATE studio_series SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (k === "episodes" ? j(patch[k]) : patch[k]))]);
}

async function writeEpisodes(s: Pick<Series, "hero" | "friend" | "theme" | "style" | "characters">, from: number, count: number, prev: Episode[]) {
  const style = STUDIO_STYLES.find((x) => x.id === s.style) ?? STUDIO_STYLES[1];
  const system = "너는 아이·가족용 쇼츠 애니메이션 시리즈 작가야. 반드시 JSON 객체 하나만 출력해. 장면 프롬프트는 영어, 나머지는 한국어.";
  const prompt = `[주인공] ${s.hero}
${s.friend ? `[친구] ${s.friend}\n` : ""}[주제] ${s.theme}
[그림체] ${style.label} — ${style.prompt}
${s.characters ? `[캐릭터 생김새 문장 — 바꾸지 말고 그대로 쓰기]\n${s.characters}\n` : ""}${prev.length ? `[이전 화 제목]\n${prev.map((e) => `${e.n}화 ${e.title}`).join("\n")}\n` : ""}
${from}화부터 ${from + count - 1}화까지 ${count}화를 만들어 줘. 화마다:
1. title: 제목 (30자 이내)
2. synopsis: 줄거리 3줄 (줄바꿈으로 구분)
3. scenePrompt: 영상 AI에 넣을 영어 장면 프롬프트 1개 — 8초 길이, 3D 애니메이션, 조명·장소·동작 포함, 동작은 딱 하나
4. description: 유튜브 설명 2줄
${s.characters ? "" : "그리고 characters: 주인공과 친구의 생김새를 영어 한 문장으로 아주 구체적으로 (색·크기·옷·특징)\n"}모든 scenePrompt 맨 앞에 캐릭터 생김새 문장을 한 글자도 바꾸지 말고 똑같이 넣어.
형식: {${s.characters ? "" : '"characters": "", '}"episodes": [{"title": "", "synopsis": "", "scenePrompt": "", "description": ""}]}`;
  const res = await runStep({ step: "studio", purpose: "series", blog: null, system, prompt, json: true, maxTokens: 6000 });
  const raw = extractJson<{ characters?: string; episodes?: Partial<Episode>[] }>(res.text);
  const characters = (s.characters || String(raw.characters ?? "")).trim().slice(0, 1200);
  const eps: Episode[] = (raw.episodes ?? []).slice(0, count).map((e, i) => {
    let scene = String(e.scenePrompt ?? "").trim();
    if (characters && !scene.includes(characters)) scene = `${characters} ${scene}`; // 빠뜨려도 앞에 붙여 같은 캐릭터 유지
    return { n: from + i, title: String(e.title ?? "").slice(0, 30), synopsis: String(e.synopsis ?? "").slice(0, 600), scenePrompt: scene.slice(0, 2000), description: String(e.description ?? "").slice(0, 400), studioId: null };
  });
  if (!eps.length) throw new Error("AI가 화를 만들지 못했어요. 다시 눌러 주세요.");
  return { characters, eps };
}

export async function createSeries(input: { hero: string; friend?: string; theme: string; style?: string; count?: number }) {
  const hero = String(input.hero ?? "").trim().slice(0, 200);
  const theme = String(input.theme ?? "").trim().slice(0, 300);
  if (!hero || !theme) throw new Error("주인공과 주제를 적어 주세요.");
  const base = { hero, friend: String(input.friend ?? "").trim().slice(0, 200), theme, style: STUDIO_STYLES.some((x) => x.id === input.style) ? String(input.style) : "3d", characters: "" };
  const count = Math.max(1, Math.min(10, Number(input.count) || 5));
  const { characters, eps } = await writeEpisodes(base, 1, count, []);
  const id = newId("ser_");
  await q("INSERT INTO studio_series (id, title, hero, friend, theme, style, characters, episodes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, `${theme.slice(0, 40)}`, base.hero, base.friend, base.theme, base.style, characters, j(eps)]);
  return id;
}

/** 다음 화 이어서 (같은 캐릭터 문장·형식) */
export async function continueSeries(id: string, count = 5) {
  const s = await getSeries(id);
  if (!s) throw new Error("시리즈를 찾을 수 없어요.");
  const from = (s.episodes.at(-1)?.n ?? 0) + 1;
  if (from > 50) throw new Error("한 시리즈는 50화까지예요.");
  const { eps } = await writeEpisodes(s, from, Math.max(1, Math.min(10, count)), s.episodes);
  await save(id, { episodes: [...s.episodes, ...eps] });
  return getSeries(id);
}

/** 한 화 다시 쓰기 요청 (예: "장면 프롬프트를 더 단순하게, 동작은 하나만") */
export async function editEpisode(id: string, n: number, request: string) {
  const s = await getSeries(id);
  const ep = s?.episodes.find((e) => e.n === n);
  if (!s || !ep) throw new Error("화를 찾을 수 없어요.");
  const res = await runStep({
    step: "studio", purpose: "series-edit", blog: null, json: true, maxTokens: 1500,
    system: "너는 쇼츠 시리즈 작가야. JSON만 출력해.",
    prompt: `[캐릭터 생김새 문장 — 그대로 유지]\n${s.characters}\n\n[${n}화]\n제목: ${ep.title}\n줄거리: ${ep.synopsis}\n장면 프롬프트: ${ep.scenePrompt}\n설명: ${ep.description}\n\n[요청]\n${request}\n\n요청대로 고쳐서 {"title": "", "synopsis": "", "scenePrompt": "", "description": ""} 로 답해. scenePrompt 맨 앞에는 캐릭터 문장을 그대로.`,
  });
  const r = extractJson<Partial<Episode>>(res.text);
  let scene = String(r.scenePrompt ?? ep.scenePrompt);
  if (s.characters && !scene.includes(s.characters)) scene = `${s.characters} ${scene}`;
  const episodes = s.episodes.map((e) => (e.n === n ? { ...e, title: String(r.title ?? e.title).slice(0, 30), synopsis: String(r.synopsis ?? e.synopsis).slice(0, 600), scenePrompt: scene.slice(0, 2000), description: String(r.description ?? e.description).slice(0, 400) } : e));
  await save(id, { episodes });
  return getSeries(id);
}

export async function setCharacters(id: string, characters: string) {
  await save(id, { characters: characters.trim().slice(0, 1200) });
  return getSeries(id);
}

/** 🌙 걸어두기: 아직 안 만든 화를 영상 스튜디오 기획으로 대기열에 (텍스트 AI만, 이미지·영상은 나중에 버튼) */
export async function queueEpisodes(id: string, ns?: number[]) {
  const s = await getSeries(id);
  if (!s) throw new Error("시리즈를 찾을 수 없어요.");
  const todo = s.episodes.filter((e) => !e.studioId && (!ns || ns.includes(e.n)));
  for (const [k, e] of todo.entries()) await enqueue("series_episode", { payload: { seriesId: id, n: e.n }, maxAttempts: 2, runAfter: new Date(Date.now() + k * 5000) });
  return todo.length;
}

/** 작업: 한 화 → 영상 스튜디오 프로젝트 */
export async function runSeriesEpisode(seriesId: string, n: number) {
  const s = await getSeries(seriesId);
  const ep = s?.episodes.find((e) => e.n === n);
  if (!s || !ep || ep.studioId) return;
  const { createStudio } = await import("./studio");
  const studioId = await createStudio({
    prompt: `[${s.title} ${n}화] ${ep.title}\n줄거리: ${ep.synopsis}\n대표 장면: ${ep.scenePrompt}`,
    seconds: 20, style: s.style, lockCharacter: s.characters, seriesId, episode: n,
  });
  const cur = await getSeries(seriesId);
  await save(seriesId, { episodes: (cur?.episodes ?? s.episodes).map((e) => (e.n === n ? { ...e, studioId } : e)) });
}

export async function deleteSeries(id: string) {
  // 바로 지우지 않고 휴지통으로 (30일 뒤 자동 완전 삭제)
  await (await import("./trash-snap")).snapToTrash("series", id);
}
