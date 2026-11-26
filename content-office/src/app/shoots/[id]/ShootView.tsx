"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import { cutSeconds, cutSpeed, scriptSeconds, SHOOT_SPEEDS, SHOOT_STATUS_LABEL, shootKind, type Shoot, type ShootClip, type ShootCut, type ShootScript } from "@/lib/shoot-types";

type Row = Shoot & { output_video_id: string | null; reel_message: string | null };
const sec = (n: number) => `${n.toFixed(1)}초`;

/** 그 구간에 가장 가까운 장면 사진 */
function frameFor(clip: ShootClip | undefined, cut: ShootCut) {
  const mid = (cut.from + cut.to) / 2;
  return [...(clip?.frames ?? [])].sort((a, b) => Math.abs(a.t - mid) - Math.abs(b.t - mid))[0] ?? null;
}

/** 📹 촬영 하나: 진행 상태 → 대본 확인·고치기·승인 → 완성 영상 */
export default function ShootView({ initial, estimateUsd }: { initial: Row; estimateUsd: number | null }) {
  const [s, setS] = useState(initial);
  const [script, setScript] = useState<ShootScript | null>(initial.script);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const working = s.status === "analyzing" || s.status === "scripting" || s.status === "rendering";
  const cost = estimateUsd != null ? fmtUsd(estimateUsd) : "단가 정보 없음";

  useEffect(() => {
    if (!working) return;
    const t = setInterval(async () => {
      const x = await api<Row>(`/api/shoots/${s.id}`).catch(() => null);
      if (!x) return;
      setS(x);
      if (x.status !== s.status) { setScript(x.script); setDirty(false); }
    }, 4000);
    return () => clearInterval(t);
  }, [working, s.id, s.status]);

  async function act(action: string, extra: Record<string, unknown> = {}, label = "처리 중") {
    setBusy(label);
    setErr("");
    try {
      const x = await api<Row>(`/api/shoots/${s.id}`, "POST", { action, ...extra });
      setS(x);
      setScript(x.script);
      setDirty(false);
      if (action === "revise") setFeedback("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }
  const edit = (fn: (d: ShootScript) => ShootScript) => { setScript((d) => (d ? fn(d) : d)); setDirty(true); };
  const editCut = (i: number, patch: Partial<ShootCut>) => edit((d) => ({ ...d, cuts: d.cuts.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  const move = (i: number, by: number) => edit((d) => { const cuts = [...d.cuts]; const k = i + by; if (k < 0 || k >= cuts.length) return d; [cuts[i], cuts[k]] = [cuts[k], cuts[i]]; return { ...d, cuts }; });

  const review = s.status === "review" && script;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card card-pad stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${s.status === "error" ? "badge-bad" : s.status === "done" ? "badge-ok" : s.status === "review" ? "badge-warn" : "badge-accent"}`}>{working && <span className="spinner" style={{ width: 10, height: 10 }} />} {SHOOT_STATUS_LABEL[s.status]}</span>
          <span className="small">{s.status === "rendering" && s.reel_message ? s.reel_message : s.message}</span>
        </div>
        <span className="small muted">{shootKind(s.kind).label} · 클립 {s.clips.length}개 · 목표 약 {s.seconds}초{s.mosaic ? " · 🫥 얼굴 모자이크" : ""}{s.refs?.length ? ` · 🎯 참고 릴스 ${s.refs.length}개` : ""}</span>
        {s.mosaic && s.status !== "analyzing" && <div className="notice notice-warn small">얼굴 모자이크는 AI가 1초에 2장씩 보고 가린 거라 빠르게 지나가는 얼굴은 놓칠 수 있어요. 올리기 전에 완성 영상을 처음부터 끝까지 확인하세요.</div>}
        {s.memo && <div className="small" style={{ whiteSpace: "pre-wrap" }}>📝 {s.memo}</div>}
        {working && <span className="tiny muted">이 화면을 닫아도 계속돼요. {s.status === "rendering" ? "완성되면" : "대본이 준비되면"} 텔레그램으로 알려 줘요. 맥이 꺼져 있으면 켜질 때 시작돼요.</span>}
        {s.status === "error" && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" disabled={!!busy} onClick={() => act("retry", { confirm: true }, "다시 시작하는 중")}>🔄 {s.failed_at === "render" ? "대본으로 돌아가기" : "멈춘 곳부터 다시 하기"}</button>
            {s.failed_at === "script" && <span className="tiny muted">대본 AI를 한 번 더 불러요 (예상 {cost})</span>}
          </div>
        )}
      </section>

      {err && <div className="notice notice-bad small">{err}</div>}

      {s.status === "done" && s.output_video_id && (
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <b>✅ 완성 영상</b>
          <video src={`/api/videos/${s.output_video_id}/file`} controls playsInline style={{ width: "100%", maxWidth: 320, borderRadius: 12, background: "#000", alignSelf: "center" }} />
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-primary" href={`/api/videos/${s.output_video_id}/file?download=1`}>⬇️ 내려받기</a>
            {s.reel_id && <Link className="btn" href={`/reels/${s.reel_id}`}>✂️ 릴스 편집기에서 열기</Link>}
            <button className="btn" disabled={!!busy} onClick={() => act("retry", { confirm: true }, "대본 여는 중")}>📝 대본 고쳐서 다시 만들기</button>
          </div>
          <span className="tiny muted">배경음악은 넣지 않았어요. 인스타·유튜브·네이버에 올릴 때 그 앱의 음악을 고르면 돼요.</span>
        </section>
      )}

      {script && (s.status === "review" || s.status === "rendering" || s.status === "done") && (
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>🎬 컷 편집 대본 <span className="small muted">컷 {script.cuts.length}개 · 약 {Math.round(scriptSeconds(script))}초</span></b>
            {script.model && <span className="tiny muted">{script.model}{script.substitutedFor ? ` (${script.substitutedFor} 대신)` : ""}</span>}
          </div>

          {(s.variants?.length ?? 0) > 1 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted strong">대본 {s.variants.length}안 — 눌러서 비교하세요</span>
              <div className="row" style={{ gap: 6 }}>
                {s.variants.map((v, i) => (
                  <button key={i} className={`chip ${s.pick === i ? "on" : ""}`} disabled={!review || !!busy} onClick={() => { if (s.pick !== i && (!dirty || confirm("고친 내용을 저장하지 않고 다른 안을 볼까요?"))) void act("pick", { n: i }, "다른 안 여는 중"); }}>
                    {v.name || `${i + 1}안`} · {Math.round(scriptSeconds(v))}초
                  </button>
                ))}
              </div>
              {script.concept && <span className="small">{script.concept}</span>}
            </div>
          )}

          {script.hooks.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted strong">첫 컷 자막 (후킹) — 하나 고르세요</span>
              {script.hooks.map((h, i) => (
                <label key={i} className="row small" style={{ gap: 6 }}>
                  <input type="radio" name="hook" checked={script.hook === i} disabled={!review} onChange={() => edit((d) => ({ ...d, hook: i }))} />
                  <input className="input" style={{ flex: 1, minWidth: 0 }} value={h} disabled={!review} maxLength={60} onChange={(e) => edit((d) => ({ ...d, hooks: d.hooks.map((x, k) => (k === i ? e.target.value : x)) }))} aria-label={`후킹 후보 ${i + 1}`} />
                </label>
              ))}
            </div>
          )}

          <div className="stack" style={{ gap: 8 }}>
            {script.cuts.map((c, i) => {
              const clip = s.clips[c.clip - 1];
              const f = frameFor(clip, c);
              return (
                <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "nowrap", borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
                  {f ? <img src={`/api/img/${f.img}.jpg`} alt={f.desc ?? `컷 ${i + 1} 장면`} style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 8, flex: "none", background: "#000" }} /> : <div style={{ width: 64, height: 96, borderRadius: 8, background: "var(--panel-2)", flex: "none" }} />}
                  <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <div className="row small" style={{ gap: 6 }}>
                      <b>컷 {i + 1}</b>
                      <span className="badge">클립 {c.clip}</span>
                      {review ? (
                        <>
                          <input className="input" type="number" step={0.1} min={0} max={clip?.duration ?? undefined} value={c.from} onChange={(e) => editCut(i, { from: Number(e.target.value) })} style={{ width: 68, padding: "2px 6px" }} aria-label={`컷 ${i + 1} 시작 초`} />
                          <span>~</span>
                          <input className="input" type="number" step={0.1} min={0} max={clip?.duration ?? undefined} value={c.to} onChange={(e) => editCut(i, { to: Number(e.target.value) })} style={{ width: 68, padding: "2px 6px" }} aria-label={`컷 ${i + 1} 끝 초`} />
                          <span className="muted">초 (클립 길이 {sec(clip?.duration ?? 0)})</span>
                          <select className="select" value={cutSpeed(c)} onChange={(e) => editCut(i, { speed: Number(e.target.value) })} style={{ width: "auto", padding: "2px 6px" }} aria-label={`컷 ${i + 1} 배속`}>
                            {SHOOT_SPEEDS.map((v) => <option key={v} value={v}>{v === 1 ? "보통 속도" : v < 1 ? `느리게 ${v}배` : `빠르게 ${v}배`}</option>)}
                          </select>
                          <span className="muted">→ 화면에 {sec(Math.max(0, cutSeconds(c)))}{cutSpeed(c) !== 1 ? " · 소리 꺼짐" : ""}</span>
                        </>
                      ) : <span className="muted">{sec(c.from)} ~ {sec(c.to)}{cutSpeed(c) !== 1 ? ` · ${cutSpeed(c)}배속` : ""}</span>}
                    </div>
                    {review
                      ? <input className="input" value={i === 0 && script.hooks.length ? script.hooks[script.hook] ?? "" : c.caption} disabled={i === 0 && script.hooks.length > 0} maxLength={60} placeholder="자막 없음" onChange={(e) => editCut(i, { caption: e.target.value })} aria-label={`컷 ${i + 1} 자막`} />
                      : <div className="small">{(i === 0 ? script.hooks[script.hook] : "") || c.caption || <span className="muted">자막 없음</span>}</div>}
                    {c.note && <span className="tiny muted">{c.note}</span>}
                    {review && (
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`컷 ${i + 1} 위로`}>↑</button>
                        <button className="btn btn-ghost btn-sm" disabled={i === script.cuts.length - 1} onClick={() => move(i, 1)} aria-label={`컷 ${i + 1} 아래로`}>↓</button>
                        <button className="btn btn-ghost btn-sm btn-danger" disabled={script.cuts.length <= 1} onClick={() => edit((d) => ({ ...d, cuts: d.cuts.filter((_, k) => k !== i) }))}>빼기</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {script.unused.length > 0 && (
            <div className="small muted">
              <b>안 쓴 클립</b>
              {script.unused.map((u) => <div key={u.clip}>클립 {u.clip}: {u.reason}</div>)}
            </div>
          )}
          {script.check.length > 0 && (
            <div className="notice notice-warn small">
              <b>확인이 필요해요</b> (메모에 없어 자막에 넣지 않았어요)
              {script.check.map((x, i) => <div key={i}>· {x}</div>)}
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <span className="small muted strong">올릴 때 쓸 글 (플랫폼별)</span>
            {[
              { label: "📷 인스타 릴스", text: `${script.caption}${script.hashtags.length ? `\n\n${script.hashtags.join(" ")}` : ""}`.trim() },
              { label: "▶️ 유튜브 쇼츠", text: script.shorts ? `${script.shorts.title}\n\n${script.shorts.desc}`.trim() : "" },
              { label: "🟢 네이버 클립", text: script.clip ? `${script.clip.title}\n\n${script.clip.desc}`.trim() : "" },
            ].filter((x) => x.text).map((x) => (
              <div key={x.label} className="stack" style={{ gap: 4, background: "var(--panel-2)", borderRadius: 10, padding: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b className="small">{x.label}</b>
                  <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(x.text)}>📋 복사</button>
                </div>
                <div className="small" style={{ whiteSpace: "pre-wrap" }}>{x.text}</div>
              </div>
            ))}
          </div>

          {review && (
            <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" disabled={!!busy} onClick={() => act("approve", { script }, "영상 만들기 시작하는 중")}>{busy ? <><span className="spinner" /> {busy}</> : "✅ 이 대본으로 만들기"}</button>
                {dirty && <button className="btn" disabled={!!busy} onClick={() => act("save", { script }, "저장 중")}>고친 내용 저장</button>}
                <span className="tiny muted">승인하면 맥에서 바로 잘라 붙여요. AI 비용은 들지 않아요. 텔레그램 알림의 버튼으로도 승인할 수 있어요.</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="small muted strong">✏️ AI에게 수정 요청</span>
                <textarea className="textarea" rows={2} value={feedback} maxLength={1000} onChange={(e) => setFeedback(e.target.value)} placeholder="예: 먹는 장면을 더 앞으로, 자막은 더 담백하게, 20초로 줄여 줘" aria-label="수정 요청" />
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" disabled={!!busy || !feedback.trim()} onClick={() => act("revise", { feedback, confirm: true }, "수정 요청 보내는 중")}>🔄 이 요청으로 대본 다시 받기</button>
                  <span className="tiny muted">대본 AI를 한 번 더 불러요 (예상 {cost}){(s.variants?.length ?? 0) > 1 ? " · 지금 보는 안만 고쳐요" : ""}{dirty ? " · 직접 고친 내용은 사라져요" : ""}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {s.clips.some((c) => c.frames?.length) && (
        <details className="card card-pad">
          <summary className="small"><b>🎞 올린 클립과 AI가 본 장면</b></summary>
          <div className="stack" style={{ gap: 12, marginTop: 10 }}>
            {s.clips.map((c, i) => (
              <div key={c.videoId} className="stack" style={{ gap: 4 }}>
                <div className="small"><b>클립 {i + 1}</b> <span className="muted">{sec(c.duration ?? 0)} · {c.name}{c.faces !== undefined ? (c.faces ? ` · 🫥 얼굴 ${c.faces}곳 가림` : " · 얼굴 없음") : ""}</span></div>
                {c.summary && <div className="small">{c.summary}</div>}
                {c.quality && <div className="small" style={{ color: "var(--warn)" }}>⚠ {c.quality}</div>}
                <div className="row" style={{ gap: 4, flexWrap: "nowrap", overflowX: "auto" }}>
                  {(c.frames ?? []).map((f) => <img key={f.img} src={`/api/img/${f.img}.jpg`} alt={f.desc ?? `${f.t}초 장면`} title={`${f.t}초 ${f.desc ?? ""}`} style={{ width: 54, height: 80, objectFit: "cover", borderRadius: 6, flex: "none" }} />)}
                </div>
                {!!c.transcript?.length && <div className="tiny muted">말소리: {c.transcript.map((x) => x.text).join(" ").slice(0, 200)}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
