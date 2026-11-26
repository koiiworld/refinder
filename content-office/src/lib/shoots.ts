import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, q1, newId, j } from "./db";
import { enqueue } from "./jobs";
import { ffmpegPath, getVideo, probe } from "./videos";
import { extractJson, runStep } from "./ai/run";
import { cleanScript, MAX_SHOOT_CLIPS, scriptSeconds, scriptToDoc, SHOOT_LENGTHS, shootKind, type Shoot, type ShootClip, type ShootScript } from "./shoot-types";

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
async function setShoot(id: string, patch: Partial<Pick<Shoot, "status" | "message" | "clips" | "script" | "history" | "failed_at" | "reel_id" | "title">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`UPDATE shoots SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...keys.map((k) => (["clips", "script", "history"].includes(k) ? j(patch[k]) : patch[k]))]);
}
const fail = (id: string, at: "analyze" | "script" | "render", e: unknown) => setShoot(id, { status: "error", failed_at: at, message: (e instanceof Error ? e.message : String(e)).slice(0, 400) });

/** 새 촬영: 이미 올린 영상(영상공장)들을 묶어 영상 확인을 시작 */
export async function createShoot(input: { title?: string; kind?: string; memo?: string; seconds?: number; videoIds?: string[] }) {
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
  const id = newId("shoot_");
  await q("INSERT INTO shoots (id, title, kind, memo, seconds, clips, status, message) VALUES ($1,$2,$3,$4,$5,$6,'analyzing','영상 확인 대기 중 (맥에서 받아쓰기·장면 사진)')", [id, title, kind.id, memo, seconds, j(clips)]);
  await enqueue("shoot_analyze", { payload: { shootId: id }, maxAttempts: 1 });
  return id;
}

export async function deleteShoot(id: string) {
  await (await import("./trash-snap")).snapToTrash("shoot", id); // 휴지통으로 (30일 뒤 자동 완전 삭제). 올린 영상은 영상공장에 그대로
}

/** 텔레그램 알림 (연결돼 있을 때만, 한 번만 시도) */
async function notify(text: string, shootId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim(), chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return;
  const { tgBase, logTg } = await import("./telegram");
  const base = await (await import("./image-refs")).publicBase().catch(() => null);
  const body = `${text}${base ? `\n${base}/shoots/${shootId}` : ""}`;
  try {
    const res = await fetch(`${tgBase()}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: body, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) });
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
      const file = await videoToTemp(c.videoId, dir);
      const meta = await probe(file);
      const duration = meta.duration ?? c.duration ?? 0;
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
        await q("INSERT INTO generated_images (id, project_id, provider, model, mime, data, prompt) VALUES ($1,NULL,'shoot','frame','image/jpeg',$2,$3)", [img, buf, `${id}#${i + 1}@${t.toFixed(1)}`]);
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
      clips.push({ ...c, duration, width: meta.width ?? c.width, height: meta.height ?? c.height, transcript, frames, summary, quality });
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
- 현장 소리를 그대로 쓴다. 내레이션·배경음악은 없다(음악은 올릴 때 플랫폼에서 넣음). 자막은 화면에 얹는 짧은 글(한 줄 16자 안팎, 최대 24자), 말하듯 쉬운 말. 자막이 필요 없는 컷은 빈 문자열.
- 비슷한 장면은 가장 좋은 것 하나만. 흔들리거나 어두운 클립은 빼고 unused 에 이유를 적는다.
- 가격·위치·메뉴 이름·제품 사양·영업시간 같은 사실은 메모에 적힌 것만 쓴다. 메모에 없는데 넣으면 좋을 사실은 자막에 쓰지 말고 check 에 "무엇을 확인하면 좋은지" 적는다.
- 과장·낚시(무조건, 인생 맛집, 100%)는 쓰지 않는다.
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

/** 작업 ③: 대본 쓰기 (feedback 이 있으면 지금 대본을 그 요청대로 고침) */
export async function runShootScript(id: string, feedback = "") {
  const s = await getShoot(id);
  if (!s || s.status !== "scripting") return;
  try {
    const kind = shootKind(s.kind);
    const voice = await q1<{ value: unknown }>("SELECT value FROM settings WHERE key='ig_voice'").catch(() => null);
    const voiceText = typeof voice?.value === "string" ? voice.value : String((voice?.value as { text?: string } | null)?.text ?? "");
    const prev = feedback && s.script ? `\n\n[지금 대본]\n${JSON.stringify({ hooks: s.script.hooks, cuts: s.script.cuts.map(({ clip, from, to, caption }) => ({ clip, from, to, caption })) })}\n\n[수정 요청 — 이 요청을 반영해 대본 전체를 다시 줘. 요청하지 않은 부분은 되도록 그대로 둬]\n${feedback.slice(0, 1000)}` : "";
    const prompt = `[촬영 종류] ${kind.label}
[이 종류의 구성 규칙] ${kind.rule}
[목표 길이] 약 ${s.seconds}초 (컷 길이 합계가 ${Math.round(s.seconds * 0.8)}~${Math.round(s.seconds * 1.15)}초. 쓸 만한 장면이 모자라면 더 짧아도 됨)
[촬영자 메모 — 사실은 여기 적힌 것만]
${s.memo || "(메모 없음)"}
${voiceText.trim() ? `\n[내 말투]\n${voiceText.trim().slice(0, 800)}\n` : ""}
[촬영한 클립들 — AI가 장면 사진을 보고 정리한 것]
${clipsText(s.clips)}${prev}

[답 형식]
{"title":"영상 제목(20자 이내)","hooks":["첫 컷 자막 후보1","후보2","후보3"],"cuts":[{"clip":클립 번호,"from":시작 초,"to":끝 초,"caption":"자막 또는 빈 문자열","note":"이 장면을 고른 이유 한 줄"}],"unused":[{"clip":번호,"reason":"안 쓴 이유"}],"caption":"게시물 캡션 2~4줄","hashtags":["해시태그",...5개],"check":["확인이 필요한 사실"]}`;
    const res = await runStep({ step: "shootscript", purpose: "shoot_script", blog: null, system: SYSTEM, prompt, json: true, maxTokens: 6000, retries: 0 });
    const script: ShootScript = cleanScript({ ...extractJson<Record<string, unknown>>(res.text), model: res.model, substitutedFor: res.substitutedFor }, s.clips);
    if (!script.cuts.length) throw new Error("대본에 쓸 수 있는 컷이 없었어요. '다시 하기'를 눌러 주세요.");
    await setShoot(id, { script, status: "review", failed_at: "", message: `대본 준비 완료 · 컷 ${script.cuts.length}개 · 약 ${Math.round(scriptSeconds(script))}초`, ...(script.title && !feedback && s.title.startsWith(kind.label) ? { title: script.title } : {}) }); // 제목을 안 적었으면 AI 제목으로
    await notify(`📹 대본이 준비됐어요 — ${s.title}\n컷 ${script.cuts.length}개 · 약 ${Math.round(scriptSeconds(script))}초\n후킹: ${script.hooks[0] ?? ""}\n아래에서 확인하고 승인해 주세요.`, id);
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
  const clean = cleanScript({ ...(script as object), model: s.script?.model, substitutedFor: s.script?.substitutedFor }, s.clips);
  if (!clean.cuts.length) throw new Error("컷이 하나는 있어야 해요.");
  await setShoot(id, { script: clean });
  return clean;
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
