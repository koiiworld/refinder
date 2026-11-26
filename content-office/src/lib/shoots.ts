import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, q1, newId, j } from "./db";
import { enqueue } from "./jobs";
import { addVideoFile, ffmpegPath, fitSize, getVideo, probe } from "./videos";
import { extractJson, runStep } from "./ai/run";
import { cleanScript, cleanVariants, MAX_SHOOT_CLIPS, MAX_SHOOT_REFS, scriptSeconds, scriptToDoc, SHOOT_LENGTHS, shootKind, type Shoot, type ShootClip, type ShootScript } from "./shoot-types";

/**
 * 📹 현장 숏폼: 찍은 영상 여러 개 → 대본 보고 → 승인 → 자동 컷 편집
 * ① 올리기: 클립들 + 촬영 종류 + 메모 (올리기를 누르면 대본 AI 비용까지 승인한 것으로 봄)
 * ② 영상 확인 (맥): 클립마다 받아쓰기 + 장면 사진 → 무료 Gemini가 사진을 보고 글로 정리 (단계 reelstudy)
 * ③ 대본: 그 글 + 메모로 컷 목록·자막 (단계 shootscript, 기본 Claude · 설정에서 바꿀 수 있음) → 텔레그램 알림
 * ④ 승인: 대본 → 릴스 편집 문서(현장 소리 유지, 배경음악 없음) → 맥에서 내보내기 → 완성 알림
 * 자동 재시도 없음(유료 AI를 두 번 부르지 않게). 실패하면 그 단계에서 멈추고 '다시 하기'.
 */
const HOME = os.homedir();
const WHISPER_PY = () => process.env.WHISPER_PYTHON || path.join(HOME, ".ai-content-office", "whisper-venv", "bin", "python");
const WHISPER_SCRIPT = () => process.env.WHISPER_SCRIPT || path.join(process.cwd(), "scripts", "transcribe.py");
const FRAMES_PER_CLIP = 10;

export type ShootRow = Shoot & { output_video_id: string | null; reel_status: string | null; reel_message: string | null };

export async function listShoots() {
  return q<Pick<Shoot, "id" | "title" | "kind" | "status" | "message" | "created_at" | "updated_at"> & { clip_count: number; thumb: string | null }>(
    `SELECT s.id, s.title, s.kind, s.status, s.message, s.created_at, s.updated_at, jsonb_array_length(s.clips) AS clip_count, v.thumb_path AS thumb
     FROM shoots s LEFT JOIN videos v ON v.id = s.clips->0->>'videoId' ORDER BY s.created_at DESC LIMIT 100`,
  );
}
export async function getShoot(id: string) {
  return q1<ShootRow>(
    `SELECT s.*, r.output_video_id, r.status AS reel_status, r.message AS reel_message FROM shoots s LEFT JOIN reel_projects r ON r.id = s.reel_id WHERE s.id=$1`,
    [id],
  );
}
async function setShoot(id: string, patch: Partial<Pick<Shoot, "status" | "message" | "clips" | "script" | "variants" | "pick" | "history" | "failed_at" | "reel_id" | "title">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`UPDATE shoots SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (["clips", "script", "variants", "history"].includes(k) ? j(patch[k]) : patch[k]))]);
}
const fail = (id: string, at: "analyze" | "script" | "render", e: unknown) => setShoot(id, { status: "error", failed_at: at, message: (e instanceof Error ? e.message : String(e)).slice(0, 400) });

/** 새 촬영: 이미 올린 영상(영상공장)들을 묶어 영상 확인을 시작 */
export async function createShoot(input: { title?: string; kind?: string; memo?: string; seconds?: number; videoIds?: string[]; mosaic?: boolean; refs?: string[]; refUrls?: string[] }) {
  const ids = Array.from(new Set((input.videoIds ?? []).map(String).filter(Boolean)));
  if (!ids.length) throw new Error("영상을 1개 이상 올려 주세요.");
  if (ids.length > MAX_SHOOT_CLIPS) throw new Error(`영상은 한 번에 ${MAX_SHOOT_CLIPS}개까지 올릴 수 있어요.`);
  const clips: ShootClip[] = [];
  for (const id of ids) {
    const v = await getVideo(id);
    if (!v || v.status !== "ready" || !v.path) throw new Error("올린 영상을 찾을 수 없어요. 다시 올려 주세요.");
    clips.push({ videoId: v.id, name: v.title.slice(0, 80), duration: Number(v.duration) || 0, width: v.width ?? 0, height: v.height ?? 0 });
  }
  const kind = shootKind(input.kind);
  const memo = String(input.memo ?? "").trim().slice(0, 2000);
  const seconds = (SHOOT_LENGTHS as readonly number[]).includes(Number(input.seconds)) ? Number(input.seconds) : 30;
  const title = String(input.title ?? "").trim().slice(0, 80) || memo.split("\n")[0].slice(0, 40) || `${kind.label} ${new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })}`;
  // 참고 릴스: 이미 분석한 것(릴스 분석) + 새 링크(지금 분석 시작 → 대본 쓰기 전에 끝나길 기다림)
  let refs = Array.from(new Set((input.refs ?? []).map(String).filter((x) => /^study_/.test(x))));
  if (refs.length) refs = (await q<{ id: string }>("SELECT id FROM study_reels WHERE id = ANY($1)", [refs])).map((r) => r.id);
  const urls = Array.from(new Set((input.refUrls ?? []).map((u) => String(u).trim()).filter((u) => /^https?:\/\//.test(u)))).slice(0, Math.max(0, MAX_SHOOT_REFS - refs.length));
  if (urls.length) refs.push(...(await (await import("./reel-study")).addStudies(urls, false)));
  refs = refs.slice(0, MAX_SHOOT_REFS);
  const id = newId("shoot_");
  await q("INSERT INTO shoots (id, title, kind, memo, seconds, clips, mosaic, refs, status, message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'analyzing','영상 확인 대기 중 (맥에서 받아쓰기·장면 사진)')", [id, title, kind.id, memo, seconds, j(clips), input.mosaic === true, j(refs)]);
  await enqueue("shoot_analyze", { payload: { shootId: id }, maxAttempts: 1 });
  return id;
}

export async function deleteShoot(id: string) {
  await (await import("./trash-snap")).snapToTrash("shoot", id); // 휴지통으로 (30일 뒤 자동 완전 삭제). 올린 영상은 영상공장에 그대로
}

/** 텔레그램 알림 (연결돼 있을 때만, 한 번만 시도) */
async function notify(text: string, shootId: string, buttons: { text: string; callback_data: string }[] = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim(), chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return;
  const { tgBase, logTg } = await import("./telegram");
  const base = await (await import("./image-refs")).publicBase().catch(() => null);
  const link = base ? `${base}/shoots/${shootId}` : "";
  const body = `${text}${link ? `\n${link}` : ""}`.slice(0, 3900);
  const rows = [...buttons.map((b) => [b]), ...(buttons.length && link ? [[{ text: "✏️ 앱에서 보기·고치기", url: link }]] : [])];
  try {
    const res = await fetch(`${tgBase()}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: body, disable_web_page_preview: true, ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}) }), signal: AbortSignal.timeout(15_000) });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    const ok = res.ok && d.ok !== false;
    await logTg({ direction: "out", kind: "shoot", text: body, ok, error: ok ? null : `텔레그램 오류 ${res.status}: ${d.description ?? ""}` });
  } catch (e) {
    await logTg({ direction: "out", kind: "shoot", text: body, ok: false, error: (e as Error).message });
  }
}

/** 작업 ②: 영상 확인 (맥) */
export async function runShootAnalyze(id: string) {
  const s = await getShoot(id);
  if (!s || s.status !== "analyzing") return;
  const { run, videoToTemp } = await import("./reels");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shoot-"));
  try {
    const clips: ShootClip[] = [];
    let seen = 0;
    for (const [i, c] of s.clips.entries()) {
      const label = `클립 ${i + 1}/${s.clips.length}`;
      await setShoot(id, { message: `${label} 받아쓰는 중` });
      let file = await videoToTemp(c.videoId, dir);
      let meta = await probe(file);
      const duration = meta.duration ?? c.duration ?? 0;
      // 🫥 얼굴 모자이크 (켰을 때만 · 이미 한 클립은 건너뜀): 가린 영상을 새로 저장하고 이 뒤로는 그 영상만 씀
      let videoId = c.videoId, originalId = c.originalId, faces = c.faces;
      if (s.mosaic && faces === undefined) {
        const m = await (await import("./shoot-mosaic")).mosaicClip({ file, dir, tag: `c${i}`, duration, run, onStep: (msg) => void setShoot(id, { message: `${label} ${msg}` }) });
        faces = m.faces;
        if (m.file) {
          const name = await fitSize(dir, path.basename(m.file));
          originalId = c.videoId;
          videoId = await addVideoFile({ title: `${c.name} (얼굴 모자이크)`.slice(0, 200), file: path.join(dir, name), kind: "edit", info: { description: `현장 숏폼 ${id} 얼굴 모자이크` } });
          fs.rmSync(file, { force: true });
          file = await videoToTemp(videoId, dir);
          meta = await probe(file);
        }
      }
      let transcript: NonNullable<ShootClip["transcript"]> = [];
      if (fs.existsSync(WHISPER_PY()) || process.env.WHISPER_PYTHON) {
        const r = await run(WHISPER_PY(), [WHISPER_SCRIPT(), file, process.env.WHISPER_MODEL || "small"], { env: { FFMPEG: ffmpegPath() } });
        if (r.code === 0) transcript = ((JSON.parse(r.out.trim().split("\n").pop() || "{}").segments ?? []) as typeof transcript).filter((x) => x.text && x.end > x.start).slice(0, 80);
      }
      // 장면 사진: 클립 전체에 고르게 (음식 영상은 말이 없으니 촘촘히, 최대 10장)
      await setShoot(id, { message: `${label} 장면 사진 뽑는 중` });
      const step = Math.max(1.5, duration / FRAMES_PER_CLIP);
      const frames: NonNullable<ShootClip["frames"]> = [];
      const dataUrls: string[] = [];
      for (let t = Math.min(0.5, duration / 2); t < duration - 0.1 && frames.length < FRAMES_PER_CLIP; t += step) {
        const out = path.join(dir, `c${i}-${frames.length}.jpg`);
        await run(ffmpegPath(), ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", out], { timeoutMs: 60_000 });
        if (!fs.existsSync(out)) continue;
        const buf = fs.readFileSync(out);
        const img = `img_${crypto.randomBytes(12).toString("hex")}`;
        await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'shoot','frame','image/jpeg',$2,$3)", [img, buf, `${id}#${i + 1}@${t.toFixed(1)}`]); // 모자이크를 켰으면 가린 영상에서 뽑은 사진
        frames.push({ t: Math.round(t * 10) / 10, img });
        dataUrls.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
      }
      // AI가 사진을 직접 보고 글로 정리 (무료 Gemini)
      let summary = "", quality = "";
      if (frames.length) {
        await setShoot(id, { message: `${label} AI가 장면 보는 중` });
        try {
          const res = await runStep({
            step: "reelstudy", role: "ideas", purpose: "shoot_view", blog: null, json: true, maxTokens: 2000, images: dataUrls, retries: 0,
            system: "너는 숏폼 영상 촬영본 검토자야. 함께 준 사진(한 클립에서 시간 순서로 뽑은 장면)을 직접 보고, 보이는 것만 한국어로 적어. 추측·지어내기 금지. 답은 JSON만.",
            prompt: `촬영 종류: ${shootKind(s.kind).label}\n클립 길이: ${duration.toFixed(1)}초\n사진 순서와 시각: ${frames.map((f, k) => `${k + 1}번=${f.t}초`).join(", ")}\n\n사진마다 무엇이 어떻게 보이는지(대상·동작·구도·먹음직스러움이나 눈길 끄는 정도)를 한 문장으로, 클립 전체는 한 줄로 요약해. 흔들림·어두움·초점 나감·손가락 가림 같은 문제가 있으면 quality에 적고 없으면 빈 문자열.\n{"summary":"클립 한 줄 요약","quality":"문제 또는 빈 문자열","frames":[{"n":1,"desc":"..."}]}`,
          });
          const a = extractJson<{ summary?: string; quality?: string; frames?: { n?: number; desc?: string }[] }>(res.text);
          summary = String(a.summary ?? "").trim().slice(0, 200);
          quality = String(a.quality ?? "").trim().slice(0, 160);
          for (const f of a.frames ?? []) { const fr = frames[Math.round(Number(f?.n)) - 1]; if (fr && f?.desc) fr.desc = String(f.desc).trim().slice(0, 200); }
          if (summary || frames.some((f) => f.desc)) seen++;
        } catch (e) {
          quality = `AI가 이 클립을 보지 못했어요: ${(e as Error).message.slice(0, 100)}`;
        }
      }
      clips.push({ ...c, videoId, ...(originalId ? { originalId } : {}), ...(faces !== undefined ? { faces } : {}), duration, width: meta.width ?? c.width, height: meta.height ?? c.height, transcript, frames, summary, quality });
      await setShoot(id, { clips: [...clips, ...s.clips.slice(clips.length)] });
      fs.rmSync(file, { force: true });
    }
    if (!seen && !clips.some((c) => c.transcript?.length)) throw new Error("AI가 영상을 하나도 확인하지 못했어요. 잠시 뒤 '다시 하기'를 눌러 주세요.");
    await setShoot(id, { clips, status: "scripting", message: "대본 쓰는 중", failed_at: "" });
    await enqueue("shoot_script", { payload: { shootId: id }, maxAttempts: 1 });
  } catch (e) {
    await fail(id, "analyze", e);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SYSTEM = `너는 한국 인스타그램 릴스·유튜브 쇼츠·네이버 클립을 만드는 숏폼 편집 감독이야. 촬영한 클립들의 장면 설명과 받아쓰기, 촬영자의 메모를 보고 '어느 클립의 몇 초~몇 초를 어떤 순서로 붙이고, 그 위에 어떤 자막을 얹을지' 컷 편집 대본을 짠다.
규칙:
- 첫 컷은 1~2초 안에 스크롤을 멈추게 하는 가장 강한 장면. 첫 컷 자막(후킹)은 후보 3개를 낸다. 인사·"안녕하세요" 금지.
- 컷 하나는 보통 1.5~4초. from·to 는 그 클립 길이 안의 초. 장면 설명에 있는 시각 근처에서 고른다. 말소리가 있는 구간은 문장 중간에서 자르지 않는다.
- 배속(speed): 붓기·굽기·끓이기·이동처럼 과정이 긴 장면은 2~4배로 빠르게, 치즈가 늘어나거나 국물이 떨어지는 짧은 순간은 0.5배로 느리게 할 수 있다. 쓸 수 있는 값은 0.5·1·1.5·2·3·4. from~to 는 원본 구간이고 화면에는 (to-from)÷speed 초가 나온다. 배속 컷은 소리가 꺼지니 말소리·먹는 소리가 중요한 컷은 1배로 둔다. 배속은 꼭 필요한 컷에만.
- 현장 소리를 그대로 쓴다. 내레이션·배경음악은 없다(음악은 올릴 때 플랫폼에서 넣음). 자막은 화면에 얹는 짧은 글(한 줄 16자 안팎, 최대 24자), 말하듯 쉬운 말. 자막이 필요 없는 컷은 빈 문자열.
- 비슷한 장면은 가장 좋은 것 하나만. 흔들리거나 어두운 클립은 빼고 unused 에 이유를 적는다.
- 가격·위치·메뉴 이름·제품 사양·영업시간 같은 사실은 메모에 적힌 것만 쓴다. 메모에 없는데 넣으면 좋을 사실은 자막에 쓰지 말고 check 에 "무엇을 확인하면 좋은지" 적는다.
- 과장·낚시(무조건, 인생 맛집, 100%)는 쓰지 않는다.
- 올릴 글(post)은 플랫폼마다 따로: 인스타 릴스는 캡션 2~4줄 + 해시태그 5개, 유튜브 쇼츠는 검색되는 짧은 제목 + 설명 1~2줄, 네이버 클립은 짧은 제목 + 설명 1~2줄(장소·메뉴·제품 이름처럼 검색할 말을 넣되 메모에 있는 것만).
반드시 JSON 하나만 답한다.`;

function clipsText(clips: ShootClip[]) {
  return clips.map((c, i) => {
    const lines = [`[클립 ${i + 1}] 길이 ${(c.duration ?? 0).toFixed(1)}초 · ${(c.width ?? 0) > (c.height ?? 0) ? "가로" : "세로"} 촬영${c.summary ? ` · ${c.summary}` : ""}${c.quality ? ` · ⚠ ${c.quality}` : ""}`];
    for (const f of c.frames ?? []) if (f.desc) lines.push(`  ${f.t}초: ${f.desc}`);
    if (c.transcript?.length) lines.push(`  말소리: ${c.transcript.map((x) => `(${x.start.toFixed(1)}~${x.end.toFixed(1)}초) ${x.text}`).join(" / ").slice(0, 1500)}`);
    else lines.push("  말소리: 없음");
    return lines.join("\n");
  }).join("\n\n");
}

/** 참고 릴스(릴스 분석 결과) → 대본 AI에 줄 글. pending = 아직 분석 중인 수 */
async function refsText(ids: string[]) {
  if (!ids?.length) return { text: "", pending: 0 };
  const rows = await q<{ id: string; status: string; title: string; analysis: import("./reel-study").StudyAnalysis; transcript: { text: string }[] }>("SELECT id, status, title, analysis, transcript FROM study_reels WHERE id = ANY($1)", [ids]);
  const done = rows.filter((r) => r.status === "done");
  const text = done.map((r, i) => {
    const a = r.analysis ?? {};
    return [`(참고 ${i + 1}) ${r.title.slice(0, 80)}${a.format ? ` · 형식: ${a.format}` : ""}`, a.summary ? `  요약: ${a.summary}` : "", a.hook?.text ? `  첫 3초: ${a.hook.text}${a.hook.verdict ? ` → ${a.hook.verdict}` : ""}` : "",
      ...(a.structure ?? []).slice(0, 8).map((x) => `  ${x.t} ${x.part}: ${x.desc}`), a.whyWorks?.length ? `  잘 된 이유: ${a.whyWorks.slice(0, 4).join(" / ")}` : "",
      r.transcript?.length ? `  말·자막 호흡: ${r.transcript.slice(0, 12).map((x) => x.text).join(" / ").slice(0, 400)}` : ""].filter(Boolean).join("\n");
  }).join("\n\n");
  return { text, pending: rows.filter((r) => r.status === "queued" || r.status === "running").length };
}

/** 작업 ③: 대본 쓰기 (feedback 이 있으면 지금 대본을 그 요청대로 고침) */
export async function runShootScript(id: string, feedback = "", wait = 0) {
  const s = await getShoot(id);
  if (!s || s.status !== "scripting") return;
  const ref = await refsText(s.refs).catch(() => ({ text: "", pending: 0 }));
  // 방금 넣은 참고 릴스가 아직 분석 중이면 끝날 때까지 기다림 (20초마다, 최대 15분 → 그래도 안 끝나면 없이 진행)
  if (ref.pending && wait < 45) {
    await setShoot(id, { message: `참고 릴스 분석을 기다리는 중 (${ref.pending}개 남음)` });
    await enqueue("shoot_script", { payload: { shootId: id, feedback, wait: wait + 1 }, maxAttempts: 1, runAfter: new Date(Date.now() + 20_000) });
    return;
  }
  try {
    const kind = shootKind(s.kind);
    const voice = await q1<{ value: unknown }>("SELECT value FROM settings WHERE key='ig_voice'").catch(() => null);
    const voiceText = typeof voice?.value === "string" ? voice.value : String((voice?.value as { text?: string } | null)?.text ?? "");
    const cur = s.script;
    const prev = feedback && cur ? `\n\n[지금 대본]\n${JSON.stringify({ name: cur.name, hooks: cur.hooks, cuts: cur.cuts.map(({ clip, from, to, caption, speed }) => ({ clip, from, to, speed: speed ?? 1, caption })) })}\n\n[수정 요청 — 이 요청을 반영해 이 대본을 다시 줘. 요청하지 않은 부분은 되도록 그대로 둬. variants 에는 고친 안 하나만]\n${feedback.slice(0, 1000)}` : "";
    const prompt = `[촬영 종류] ${kind.label}
[이 종류의 구성 규칙] ${kind.rule}
[목표 길이] 약 ${s.seconds}초 (컷 길이 합계가 ${Math.round(s.seconds * 0.8)}~${Math.round(s.seconds * 1.15)}초. 쓸 만한 장면이 모자라면 더 짧아도 됨)
[촬영자 메모 — 사실은 여기 적힌 것만]
${s.memo || "(메모 없음)"}
${voiceText.trim() ? `\n[내 말투]\n${voiceText.trim().slice(0, 800)}\n` : ""}
${ref.text ? `\n[참고 릴스 — 촬영자가 고른 레퍼런스. 첫 컷을 여는 방식·컷 길이와 호흡·자막 말투·흐름을 따라 하되, 문구를 그대로 베끼지 말고 내용(사실)은 가져오지 마. 내 클립에 없는 장면은 억지로 맞추지 마]\n${ref.text}\n` : ""}
[촬영한 클립들 — AI가 장면 사진을 보고 정리한 것]
${clipsText(s.clips)}${prev}
${feedback ? "" : "\n[대본은 2안] 첫 컷과 흐름이 서로 다른 두 가지 구성으로 짜 줘 (예: 음식부터 보여 주는 안 / 궁금증으로 시작하는 안). 쓸 만한 장면이 적어 두 안이 거의 같아진다면 한 안만 줘.\n"}
[답 형식]
{"variants":[{"name":"A안 · 구성 이름(8자 이내)","concept":"이 안의 흐름 한 줄","title":"영상 제목(20자 이내)","hooks":["첫 컷 자막 후보1","후보2","후보3"],"cuts":[{"clip":클립 번호,"from":시작 초,"to":끝 초,"speed":1,"caption":"자막 또는 빈 문자열","note":"이 장면을 고른 이유 한 줄"}],"unused":[{"clip":번호,"reason":"안 쓴 이유"}],"check":["확인이 필요한 사실"]}],"post":{"caption":"인스타 릴스 캡션 2~4줄","hashtags":["해시태그",...5개],"shorts":{"title":"유튜브 쇼츠 제목","desc":"설명 1~2줄"},"clip":{"title":"네이버 클립 제목","desc":"설명 1~2줄"}}}`;
    const res = await runStep({ step: "shootscript", purpose: "shoot_script", blog: null, system: SYSTEM, prompt, json: true, maxTokens: 9000, retries: 0 });
    const got = cleanVariants(extractJson<Record<string, unknown>>(res.text), s.clips, { model: res.model, substitutedFor: res.substitutedFor });
    if (!got.length) throw new Error("대본에 쓸 수 있는 컷이 없었어요. '다시 하기'를 눌러 주세요.");
    // 수정 요청이면 지금 고른 안만 바꾸고, 처음이면 받은 안 전부
    const old = s.variants?.length ? s.variants : cur ? [cur] : [];
    const pick = feedback && old.length ? Math.min(s.pick ?? 0, old.length - 1) : 0;
    const variants = feedback && old.length ? old.map((v, i) => (i === pick ? { ...got[0], name: got[0].name || v.name, shorts: got[0].shorts ?? v.shorts, clip: got[0].clip ?? v.clip, caption: got[0].caption || v.caption, hashtags: got[0].hashtags.length ? got[0].hashtags : v.hashtags } : v)) : got;
    const script = variants[pick];
    await setShoot(id, { script, variants, pick, status: "review", failed_at: "", message: `대본 준비 완료 · ${variants.length > 1 ? `${variants.length}안 · ` : ""}컷 ${script.cuts.length}개 · 약 ${Math.round(scriptSeconds(script))}초`, ...(script.title && !feedback && s.title.startsWith(kind.label) ? { title: script.title } : {}) }); // 제목을 안 적었으면 AI 제목으로
    const brief = variants.map((v, i) => `${variants.length > 1 ? `\n【${v.name || `${i + 1}안`}】${v.concept ? ` ${v.concept}` : ""}\n` : "\n"}후킹: ${v.hooks[v.hook] ?? ""}\n컷 ${v.cuts.length}개 · 약 ${Math.round(scriptSeconds(v))}초\n${v.cuts.map((c, k) => `${k + 1}. 클립${c.clip} ${c.from}~${c.to}초${c.speed && c.speed !== 1 ? ` (${c.speed}배속)` : ""}${c.caption ? ` “${c.caption}”` : ""}`).join("\n")}${v.check.length ? `\n⚠ 확인: ${v.check.join(" / ")}` : ""}`).join("\n");
    await notify(`📹 대본이 준비됐어요 — ${s.title}\n${brief}\n\n버튼을 누르면 그 안으로 바로 만들어요 (1분 안에 시작). 고치려면 앱에서 열어 주세요.`, id, variants.map((v, i) => ({ text: `✅ ${variants.length > 1 ? `${(v.name || `${i + 1}안`).split("·")[0].trim()}으로` : "이 대본으로"} 만들기`, callback_data: `sa:${id}:${i}` })));
  } catch (e) {
    await fail(id, "script", e);
  }
}

/** 수정 요청: 지금 대본을 요청대로 다시 (유료 AI 1회) */
export async function reviseShoot(id: string, feedback: string) {
  const s = await getShoot(id);
  if (!s) throw new Error("찾을 수 없어요.");
  if (s.status !== "review") throw new Error("대본 승인 대기 중일 때만 수정을 요청할 수 있어요.");
  const fb = String(feedback ?? "").trim().slice(0, 1000);
  if (!fb) throw new Error("어떻게 고칠지 적어 주세요.");
  await setShoot(id, { status: "scripting", message: "수정 요청대로 대본 다시 쓰는 중", history: [...(s.history ?? []), { at: new Date().toISOString(), feedback: fb }].slice(-20) });
  await enqueue("shoot_script", { payload: { shootId: id, feedback: fb }, maxAttempts: 1 });
}

/** 화면에서 고친 대본 저장 (자막·구간·후킹 고르기 · AI 호출 없음) */
export async function saveShootScript(id: string, script: unknown) {
  const s = await getShoot(id);
  if (!s) throw new Error("찾을 수 없어요.");
  if (s.status !== "review") throw new Error("대본 승인 대기 중일 때만 고칠 수 있어요.");
  const clean = cleanScript({ ...s.script, ...(script as object), model: s.script?.model, substitutedFor: s.script?.substitutedFor }, s.clips);
  if (!clean.cuts.length) throw new Error("컷이 하나는 있어야 해요.");
  const variants = (s.variants?.length ? s.variants : [clean]).map((v, i) => (i === (s.pick ?? 0) ? clean : v));
  await setShoot(id, { script: clean, variants });
  return clean;
}

/** 여러 안 중 하나 고르기 (AI 호출 없음) */
export async function pickShootVariant(id: string, n: number) {
  const s = await getShoot(id);
  if (!s) throw new Error("찾을 수 없어요.");
  if (s.status !== "review") throw new Error("대본 승인 대기 중일 때만 고를 수 있어요.");
  const v = s.variants?.[Math.round(n)];
  if (!v) throw new Error("그 안을 찾을 수 없어요.");
  await setShoot(id, { pick: Math.round(n), script: v });
}

/** 텔레그램 버튼 'sa:<촬영>:<안 번호>' → 그 안으로 승인. 돌려주는 글은 버튼 누른 사람에게 잠깐 보임 */
export async function shootButton(data: string) {
  const [, id, n] = data.split(":");
  const s = await getShoot(id);
  if (!s) return { ok: false, text: "촬영을 찾을 수 없어요." };
  if (s.status !== "review") return { ok: s.status === "rendering" || s.status === "done", text: s.status === "rendering" ? "이미 만드는 중이에요" : s.status === "done" ? "이미 완성됐어요" : "지금은 승인할 수 없어요" };
  if ((s.variants?.length ?? 0) > 1 || Number(n) > 0) await pickShootVariant(id, Number(n) || 0);
  await approveShoot(id);
  return { ok: true, text: "✅ 승인! 영상을 만들기 시작했어요" };
}

/** ④ 승인: 대본대로 릴스 편집 문서를 만들고 바로 내보내기 (맥) */
export async function approveShoot(id: string, script?: unknown) {
  if (script) await saveShootScript(id, script);
  const s = await getShoot(id);
  if (!s) throw new Error("찾을 수 없어요.");
  if (s.status !== "review") throw new Error("대본 승인 대기 중일 때만 승인할 수 있어요.");
  if (!s.script?.cuts.length) throw new Error("대본이 없어요.");
  const doc = scriptToDoc(s.script, s.clips, `📹 현장 숏폼 ${id}\n${s.memo}`);
  if (!doc.scenes.length) throw new Error("대본에 쓸 수 있는 컷이 없어요.");
  const reelId = newId("reel_");
  await q("INSERT INTO reel_projects (id, title, base_video_id, doc, status, message) VALUES ($1,$2,NULL,$3,'ready','')", [reelId, (s.script.title || s.title).slice(0, 120), j(doc)]);
  await setShoot(id, { status: "rendering", reel_id: reelId, failed_at: "", message: "영상 만드는 중 (맥에서 컷 편집·자막)" });
  await (await import("./reels")).startReelRender(reelId, "1080");
  return reelId;
}

/** 내보내기가 끝났을 때 (reel_render 작업 뒤에 불림): 현장 숏폼에서 만든 릴스면 상태 반영 + 알림 */
export async function shootRenderDone(reelId: string) {
  const s = await q1<{ id: string; title: string; status: string }>("SELECT id, title, status FROM shoots WHERE reel_id=$1", [reelId]);
  if (!s || s.status !== "rendering") return;
  const r = await q1<{ status: string; message: string; output_video_id: string | null }>("SELECT status, message, output_video_id FROM reel_projects WHERE id=$1", [reelId]);
  if (r?.status === "ready" && r.output_video_id) {
    await setShoot(s.id, { status: "done", message: "완성! 확인하고 내려받아 올리세요", failed_at: "" });
    await notify(`✅ 숏폼이 완성됐어요 — ${s.title}\n아래에서 보고 내려받을 수 있어요. 손볼 곳이 있으면 '릴스 편집기에서 열기'를 누르세요.`, s.id);
  } else {
    await setShoot(s.id, { status: "error", failed_at: "render", message: r?.message || "영상을 만들지 못했어요." });
    await notify(`⚠️ 숏폼을 만들다 멈췄어요 — ${s.title}\n${(r?.message ?? "").slice(0, 200)}`, s.id);
  }
}

/** 다시 하기: 멈춘 단계부터 (대본 단계는 유료 AI 1회) · 완성본을 대본 고쳐 다시 만들 때도 씀 */
export async function retryShoot(id: string) {
  const s = await getShoot(id);
  if (!s) throw new Error("찾을 수 없어요.");
  if (s.status === "done" || (s.status === "error" && s.failed_at === "render")) return setShoot(id, { status: "review", message: "대본을 확인하고 다시 승인해 주세요", failed_at: "" });
  if (s.status !== "error") throw new Error("멈춘 작업만 다시 할 수 있어요.");
  if (s.failed_at === "script") {
    await setShoot(id, { status: "scripting", message: "대본 쓰는 중" });
    await enqueue("shoot_script", { payload: { shootId: id }, maxAttempts: 1 });
  } else {
    await setShoot(id, { status: "analyzing", message: "영상 확인 대기 중 (맥에서 받아쓰기·장면 사진)" });
    await enqueue("shoot_analyze", { payload: { shootId: id }, maxAttempts: 1 });
  }
}
