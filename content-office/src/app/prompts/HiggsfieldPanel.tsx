"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtDate } from "@/components/ui";

type Job = {
  id: string;
  model: string;
  media: "image" | "video";
  status: string;
  urls: string[];
  error: string | null;
  expires_at: string | null;
  input: Record<string, unknown>;
  created_at: string;
};

const TERMINAL = ["completed", "failed", "nsfw", "canceled", "error"];
const STATUS_LABEL: Record<string, [string, string]> = {
  queued: ["대기 중", "badge-accent"],
  in_progress: ["생성 중", "badge-accent"],
  completed: ["완료", "badge-ok"],
  failed: ["실패 (청구 없음)", "badge-bad"],
  nsfw: ["차단됨 (청구 없음)", "badge-bad"],
  canceled: ["취소됨", ""],
};

export default function HiggsfieldPanel({ promptId, prompt, negative, defaultMedia, connected }: { promptId: string; prompt: string; negative: string; defaultMedia: "image" | "video"; connected: boolean }) {
  const [mode, setMode] = useState<"image" | "video">(defaultMedia);
  const [aspect, setAspect] = useState("9:16");
  const [res, setRes] = useState("720p");
  const [imageUrl, setImageUrl] = useState("");
  const [duration, setDuration] = useState(5);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setJobs(await api<Job[]>(`/api/media?promptId=${promptId}`));
    } catch {
      /* 무시 */
    }
  }, [promptId]);
  useEffect(() => void load(), [load]);

  // 진행 중인 작업은 4초마다 상태 갱신
  const active = jobs.filter((j) => !TERMINAL.includes(j.status));
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(async () => {
      const updated = await Promise.all(active.map((j) => api<Job>(`/api/media/${j.id}`).catch(() => j)));
      setJobs((list) => list.map((j) => updated.find((u) => u.id === j.id) ?? j));
    }, 4000);
    return () => clearInterval(t);
  }, [active.map((j) => j.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const images = jobs.filter((j) => j.media === "image" && j.status === "completed").flatMap((j) => j.urls);

  async function generate() {
    const what = mode === "image" ? "이미지 1장" : `영상 ${duration}초`;
    if (!confirm(`Higgsfield에서 ${what}을 생성합니다. Higgsfield 크레딧이 차감됩니다. 진행할까요?`)) return;
    setBusy(true);
    setErr("");
    try {
      const body =
        mode === "image"
          ? { model: "soul-standard", promptId, prompt, aspect_ratio: aspect, resolution: res }
          : { model: "wan-2.6-i2v", promptId, prompt, image_url: imageUrl, duration, resolution: res, negative_prompt: negative };
      const job = await api<Job>("/api/media", "POST", body);
      setJobs((l) => [job, ...l]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="card card-pad stack" style={{ gap: 10, borderColor: "var(--accent)" }}>
      <div className="row between">
        <span className="strong">Higgsfield로 바로 생성</span>
        <span className={`badge ${connected ? "badge-ok" : "badge-warn"}`}>{connected ? "API 연결됨" : "API 미연결"}</span>
      </div>
      {!connected ? (
        <p className="small muted">설정 &gt; AI 연결에서 Higgsfield 키(HIGGSFIELD_API_KEY=키ID:시크릿)를 넣으면 여기서 바로 생성할 수 있습니다. 지금은 위 프롬프트를 복사해 Higgsfield 사이트에 붙여 넣으세요.</p>
      ) : (
        <>
          <div className="row">
            <button className={`btn btn-sm ${mode === "image" ? "btn-primary" : ""}`} onClick={() => { setMode("image"); setRes("720p"); }}>이미지 (SOUL)</button>
            <button className={`btn btn-sm ${mode === "video" ? "btn-primary" : ""}`} onClick={() => { setMode("video"); setRes("720p"); }}>영상 (Wan 2.6 · 이미지→영상)</button>
          </div>
          {mode === "image" ? (
            <div className="row">
              <label className="small">비율{" "}
                <select className="select" style={{ width: 110 }} value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {["9:16", "16:9", "1:1", "4:3", "3:4", "2:3", "3:2"].map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label className="small">해상도{" "}
                <select className="select" style={{ width: 100 }} value={res} onChange={(e) => setRes(e.target.value)}>
                  <option>720p</option><option>1080p</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <p className="tiny muted">영상은 시작 이미지가 필요합니다. 먼저 이미지를 만들고 아래 결과에서 '이 이미지로 영상'을 누르거나, 이미지 주소(https)를 붙여 넣으세요. 화면 비율은 시작 이미지를 따릅니다.</p>
              <input className="input" placeholder="시작 이미지 URL (https://...)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              {!!images.length && (
                <div className="row">
                  {images.slice(0, 6).map((u) => (
                    <button key={u} type="button" onClick={() => setImageUrl(u)} style={{ padding: 0, border: imageUrl === u ? "2px solid var(--accent)" : "1px solid var(--line)", borderRadius: 6, background: "none", cursor: "pointer" }} aria-label="시작 이미지로 선택">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 5, display: "block" }} />
                    </button>
                  ))}
                </div>
              )}
              <div className="row">
                <label className="small">길이{" "}
                  <select className="select" style={{ width: 90 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    <option value={5}>5초</option><option value={10}>10초</option><option value={15}>15초</option>
                  </select>
                </label>
                <label className="small">해상도{" "}
                  <select className="select" style={{ width: 100 }} value={res} onChange={(e) => setRes(e.target.value)}>
                    <option>480p</option><option>720p</option><option>1080p</option>
                  </select>
                </label>
              </div>
              {negative && <p className="tiny muted">제외 프롬프트도 함께 전달됩니다.</p>}
            </div>
          )}
          {err && <div className="notice notice-bad small">{err}</div>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !prompt.trim() || (mode === "video" && !imageUrl)} onClick={generate}>
              {busy ? <span className="spinner" /> : mode === "image" ? "이미지 생성" : "영상 생성"}
            </button>
            <span className="tiny muted">생성할 때마다 Higgsfield 크레딧이 차감됩니다. 실패·차단된 생성은 청구되지 않습니다.</span>
          </div>
        </>
      )}

      {!!jobs.length && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="label" style={{ margin: 0 }}>생성 결과</div>
          {jobs.map((j) => {
            const [label, cls] = STATUS_LABEL[j.status] ?? [j.status, ""];
            return (
              <div key={j.id} className="card card-pad stack" style={{ gap: 6 }}>
                <div className="row between">
                  <div className="row">
                    <span className={`badge ${cls}`}>{!TERMINAL.includes(j.status) && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />}{label}</span>
                    <span className="tiny muted">{j.media === "image" ? "이미지 · SOUL" : `영상 · Wan 2.6 · ${j.input.duration}초`} · {fmtDate(j.created_at)}</span>
                  </div>
                  {j.status === "queued" && (
                    <button className="btn btn-sm" onClick={async () => { try { const u = await api<Job>(`/api/media/${j.id}`, "POST", { action: "cancel" }); setJobs((l) => l.map((x) => (x.id === u.id ? u : x))); } catch (e) { setErr((e as Error).message); } }}>취소</button>
                  )}
                </div>
                {j.error && <div className="small" style={{ color: "var(--bad)" }}>{j.error}</div>}
                {j.urls.map((u) => (
                  <div key={u} className="stack" style={{ gap: 6 }}>
                    {j.media === "video" ? (
                      <video src={u} controls playsInline style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 8, background: "#000" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u} alt="생성된 이미지" style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 8, alignSelf: "flex-start" }} />
                    )}
                    <div className="row">
                      <a className="btn btn-sm" href={u} target="_blank" rel="noreferrer" download>원본 열기·저장</a>
                      {j.media === "image" && <button className="btn btn-sm" onClick={() => { setMode("video"); setImageUrl(u); }}>이 이미지로 영상</button>}
                      <span className="tiny muted">Higgsfield 서버에 약 7일 보관{j.expires_at ? ` (만료 ${fmtDate(j.expires_at)})` : ""} · 필요하면 저장해 두세요</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
