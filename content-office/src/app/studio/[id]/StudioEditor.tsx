"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import type { StudioProject, StudioScene } from "@/lib/studio";

const CLIP_DONE = (s: StudioScene) => !!s.video?.url;
const CLIP_RUNNING = (s: StudioScene) => !!s.video?.jobId && !s.video?.url && !["failed", "nsfw", "canceled", "error"].includes(String(s.video?.status));

export default function StudioEditor({ initial, styles, imageModels }: { initial: StudioProject; styles: { id: string; label: string }[]; imageModels: { id: string; label: string }[] }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [dirty, setDirty] = useState(false);
  const [charReq, setCharReq] = useState("");
  const [recs, setRecs] = useState<{ id: string; reason: string }[] | null>(null);
  const [est, setEst] = useState<{ perClip: number | null; total: number | null; count: number } | null>(null);

  const food=s.options.subjectMode==="food";
  const running = s.scenes.some(CLIP_RUNNING) || s.status === "rendering";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const x = await api<StudioProject>(`/api/studio/${s.id}`).catch(() => null);
      if (x) setS((cur) => (dirty ? { ...x, scenes: x.scenes.map((sc, i) => ({ ...sc, visual: cur.scenes[i]?.visual ?? sc.visual, motion: cur.scenes[i]?.motion ?? sc.motion, caption: cur.scenes[i]?.caption ?? sc.caption })) } : x));
    }, 5000);
    return () => clearInterval(t);
  }, [running, s.id, dirty]);

  useEffect(() => {
    if (!s.scenes.some((x) => x.image?.url)) return;
    api<typeof est>(`/api/studio/${s.id}`, "POST", { action: "estimate" }).then(setEst).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, s.scenes.filter((x) => x.image?.url).length, s.scenes.filter((x) => x.video?.url).length]);

  async function act(key: string, body: Record<string, unknown>, okText?: string) {
    setBusy(key);
    setMsg(null);
    try {
      if (dirty) await saveEdits(true);
      const x = await api<StudioProject & { notice?: string }>(`/api/studio/${s.id}`, "POST", body);
      setS(x);
      if (x.notice) setMsg({ ok: true, text: x.notice });
      else if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }
  async function saveEdits(silent = false) {
    const x = await api<StudioProject>(`/api/studio/${s.id}`, "PUT", { character: s.character, scenes: s.scenes, plan: s.plan, options: s.options });
    setS(x);
    setDirty(false);
    if (!silent) setMsg({ ok: true, text: "저장했어요." });
  }
  const editScene = (i: number, patch: Partial<StudioScene>) => {
    setS({ ...s, scenes: s.scenes.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
    setDirty(true);
  };
  async function allImages() {
    for (const [i, sc] of s.scenes.entries()) {
      if (sc.image?.url) continue;
      await act(`img${i}`, { action: "scene_image", index: i });
    }
  }
  async function allClips() {
    if (!confirm(`영상이 없는 장면 ${est?.count ?? ""}개를 Higgsfield로 만들까요?${est?.total != null ? `\n예상 비용: ${fmtUsd(est.total)}` : ""}`)) return;
    for (const [i, sc] of s.scenes.entries()) {
      if (!sc.image?.url || sc.video?.url || CLIP_RUNNING(sc)) continue;
      await act(`clip${i}`, { action: "scene_clip", index: i });
    }
  }

  const imgCount = s.scenes.filter((x) => x.image?.url).length;
  const clipCount = s.scenes.filter(CLIP_DONE).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {msg && <div className={`notice ${msg.ok ? "notice-ok" : "notice-bad"} small`}>{msg.text}</div>}
      {s.status === "error" && s.message && <div className="notice notice-bad small">{s.message}</div>}

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between">
          <b className="small">① 기획 · {styles.find((x) => x.id === s.options.style)?.label} · 장면 {s.scenes.length}개 × {s.options.clipSeconds}초{s.plan.ai ? ` · ${s.plan.ai}` : ""}</b>
          {dirty && <button className="btn btn-sm btn-primary" onClick={() => saveEdits()}>💾 고친 내용 저장</button>}
        </div>
        <div className="small"><b>후킹</b> · {s.plan.hook}</div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <input className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="기획 수정 요청 (예: 더 웃기게 / 마지막에 반전 / 장면 수 줄여줘)" aria-label="기획 수정 요청" />
          <button className="btn btn-sm" disabled={!!busy} onClick={() => act("replan", { action: "replan", feedback }, "기획을 다시 만들었어요.")}>{busy === "replan" ? <span className="spinner" /> : "🔄 다시 기획"}</button>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>다시 기획하면 만든 장면 이미지·영상은 비워져요. 캐릭터는 요청에 캐릭터 이야기가 없으면 그대로 둬요.</p>
      </section>

      {!food&&<section className="card card-pad stack" style={{ gap: 10 }}>
        <b className="small">② 캐릭터 · {s.character.name}</b>
        <div className="studio-char">
          <div className="studio-thumb">
            {s.character.image?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.character.image.url} alt={s.character.name} />
            ) : (
              <span className="tiny muted">아직 없음</span>
            )}
          </div>
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <div className="small">{s.character.description}</div>
            <textarea className="textarea" style={{ minHeight: 90, fontSize: 13 }} value={s.character.prompt} onChange={(e) => { setS({ ...s, character: { ...s.character, prompt: e.target.value } }); setDirty(true); }} aria-label="캐릭터 프롬프트" />
            <div className="row" style={{ gap: 6 }}>
              <select className="input" style={{ maxWidth: 260 }} value={s.options.imageModel} onChange={(e) => { setS({ ...s, options: { ...s.options, imageModel: e.target.value } }); setDirty(true); }} aria-label="이미지 모델">
                {imageModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => act("char", { action: "character" }, "캐릭터를 만들었어요.")}>{busy === "char" ? <><span className="spinner" /> 그리는 중…</> : s.character.image?.url ? "🎨 다시 그리기" : "🎨 캐릭터 만들기"}</button>
              <button
                className="btn btn-sm"
                disabled={!!busy}
                title="프롬프트를 보고 어울리는 모델 추천 (무료 Gemini)"
                onClick={async () => {
                  setBusy("rec");
                  try {
                    setRecs((await api<{ picks: { id: string; reason: string }[] }>(`/api/studio/${s.id}`, "POST", { action: "recommend_model", target: "character" })).picks);
                  } catch (e) {
                    setMsg({ ok: false, text: (e as Error).message });
                  }
                  setBusy("");
                }}
              >
                {busy === "rec" ? <span className="spinner" /> : "🤖 모델 추천"}
              </button>
            </div>
            {s.character.image?.url && <span className="tiny muted">지금 그림: {imageModels.find((m) => m.id === s.character.image?.model)?.label ?? s.character.image?.model}{s.character.image?.model === s.options.imageModel ? " · 같은 모델·같은 프롬프트면 비슷하게 나와요. ✏️ 프롬프트 수정으로 바꿔 보세요." : ""}</span>}
            {recs && (
              <div className="stack" style={{ gap: 4 }}>
                {recs.map((r, k) => (
                  <button key={r.id} type="button" className={`rec-pick${s.options.imageModel === r.id ? " on" : ""}`} onClick={() => { setS({ ...s, options: { ...s.options, imageModel: r.id } }); setDirty(true); }}>
                    <b className="small">{k + 1}. {imageModels.find((m) => m.id === r.id)?.label ?? r.id}</b>
                    <span className="tiny">{r.reason}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
              <input className="input" value={charReq} placeholder="✏️ 프롬프트 수정: 예) 더 통통하게, 모자 씌우기, 배경 빼기 (한국어 OK)" onChange={(e) => setCharReq(e.target.value)} aria-label="캐릭터 프롬프트 수정 요청" />
              <button className="btn btn-sm" disabled={!!busy || !charReq.trim()} onClick={async () => { await act("cedit", { action: "prompt_edit", target: "character", request: charReq }); setCharReq(""); }}>{busy === "cedit" ? <span className="spinner" /> : "고치기"}</button>
            </div>
            <span className="tiny muted">프롬프트를 한국어로 직접 고쳐도 돼요. 그릴 때 영어로 바꿔서 보내요.</span>
          </div>
        </div>
      </section>}
      {food&&<p className="notice small">🍲 음식 클로즈업 · 캐릭터 제작 없이 음식·조리 장면 이미지를 만든 뒤 장면 영상으로 이어가세요.</p>}
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between">
          <b className="small">③ 장면 이미지 ({imgCount}/{s.scenes.length}) · ④ 장면 영상 ({clipCount}/{s.scenes.length})</b>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" disabled={!!busy || (!food&&!s.character.image?.url) || imgCount === s.scenes.length} onClick={allImages}>🖼 남은 이미지 모두</button>
            <button className="btn btn-sm" disabled={!!busy || !imgCount || clipCount === s.scenes.length} onClick={allClips}>🎞 남은 영상 모두{est?.total != null ? ` (${fmtUsd(est.total)})` : ""}</button>
          </div>
        </div>
        {!food&&!s.character.image?.url && <div className="tiny muted">캐릭터를 먼저 만들면 장면마다 같은 인물로 그려요.</div>}
        {est?.perClip != null && <div className="tiny muted">장면 영상 1개 예상 {fmtUsd(est.perClip)} (Higgsfield Wan 2.6 · {s.options.clipSeconds}초 · {s.options.resolution})</div>}
        <div className="studio-scenes">
          {s.scenes.map((sc, i) => (
            <div key={i} className="card card-pad stack" style={{ gap: 6, padding: 10 }}>
              <b className="tiny">장면 {sc.n} · {sc.seconds}초</b>
              <div className="studio-thumb" style={{ aspectRatio: "9 / 16" }}>
                {sc.video?.url ? (
                  <video src={sc.video.url} muted loop playsInline autoPlay controls={false} />
                ) : sc.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sc.image.url} alt={`장면 ${sc.n}`} />
                ) : (
                  <span className="tiny muted">이미지 없음</span>
                )}
                {sc.caption && <span className="studio-cap">{sc.caption}</span>}
                {CLIP_RUNNING(sc) && <span className="studio-badge"><span className="spinner" /> 영상 만드는 중</span>}
              </div>
              <input className="input" style={{ fontSize: 13 }} value={sc.caption} onChange={(e) => editScene(i, { caption: e.target.value })} placeholder="자막" aria-label={`장면 ${sc.n} 자막`} />
              <details>
                <summary className="tiny muted" style={{ cursor: "pointer" }}>화면·움직임 프롬프트</summary>
                <textarea className="textarea" style={{ minHeight: 70, fontSize: 12 }} value={sc.visual} onChange={(e) => editScene(i, { visual: e.target.value })} aria-label="화면 프롬프트" />
                <textarea className="textarea" style={{ minHeight: 44, fontSize: 12 }} value={sc.motion} onChange={(e) => editScene(i, { motion: e.target.value })} aria-label="움직임 프롬프트" />
              </details>
              {sc.video?.error && !sc.video.url && <div className="tiny" style={{ color: "var(--bad)" }}>{sc.video.error}</div>}
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" disabled={!!busy} title="이 장면 그림 설명을 한국어로 고쳐 달라고 하기" onClick={() => { const r = window.prompt("이 장면을 어떻게 바꿀까요? (예: 밤으로, 더 가까이)"); if (r?.trim()) void act(`edit${i}`, { action: "prompt_edit", index: i, request: r }); }}>{busy === `edit${i}` ? <span className="spinner" /> : "✏️"}</button>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => act(`img${i}`, { action: "scene_image", index: i })}>{busy === `img${i}` ? <span className="spinner" /> : sc.image?.url ? "🖼 다시" : "🖼 이미지"}</button>
                <button className="btn btn-sm" disabled={!!busy || !sc.image?.url || CLIP_RUNNING(sc)} onClick={() => act(`clip${i}`, { action: "scene_clip", index: i })}>{busy === `clip${i}` ? <span className="spinner" /> : sc.video?.url ? "🎞 다시" : "🎞 영상"}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <b className="small">⑤ 합치기</b>
        <label className="small row" style={{ gap: 6 }}>
          <input type="checkbox" checked={s.options.captions} onChange={(e) => { setS({ ...s, options: { ...s.options, captions: e.target.checked } }); setDirty(true); }} /> 자막 얹기
        </label>
        <p className="tiny muted" style={{ margin: 0 }}>영상이 있는 장면은 영상으로, 이미지만 있는 장면은 사진에 천천히 확대 효과를 넣어 이어 붙여요. 세로 1080×1920으로 맞춰 영상공장에 저장돼요.</p>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary" disabled={!!busy || s.status === "rendering" || !imgCount} onClick={() => act("render", { action: "render" }, "합치기 시작! 이 화면을 닫아도 계속돼요.")}>{s.status === "rendering" ? <><span className="spinner" /> {s.message || "합치는 중…"}</> : "🎬 영상 합치기"}</button>
          {s.video_id && <Link className="btn" href={`/videos/${s.video_id}`}>▶ 완성 영상 보기·편집</Link>}
        </div>
        {(s.plan.caption || !!s.plan.hashtags?.length) && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="tiny muted">게시물 캡션</div>
            <textarea className="textarea" style={{ minHeight: 80, fontSize: 13 }} readOnly value={`${s.plan.caption}\n\n${(s.plan.hashtags ?? []).map((h) => "#" + h).join(" ")}`} onFocus={(e) => e.currentTarget.select()} aria-label="캡션" />
          </div>
        )}
      </section>
    </div>
  );
}
