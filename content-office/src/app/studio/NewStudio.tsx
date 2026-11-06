"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";

export default function NewStudio({ styles, imageModels }: { styles: { id: string; label: string }[]; imageModels: { id: string; label: string; note?: string }[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(20);
  const [style, setStyle] = useState("3d");
  const [imageModel, setImageModel] = useState("google:gemini-3.1-flash-image");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/studio", "POST", { prompt, seconds, style, imageModel });
      router.push(`/studio/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 10, marginBottom: 16 }}>
      <b className="small">① 어떤 영상을 만들까요?</b>
      <textarea
        className="textarea"
        style={{ minHeight: 90 }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={"예: 귀여운 감자 캐릭터가 에어프라이어로 감자튀김 만드는 법을 알려주는 20초 릴스. 마지막에 '저장해두세요'로 끝나게."}
        aria-label="영상 아이디어"
      />
      <div className="row" style={{ gap: 8 }}>
        <span className="small">길이</span>
        {[15, 20, 30, 45].map((s) => (
          <button key={s} className={`btn btn-sm ${seconds === s ? "btn-primary" : ""}`} onClick={() => setSeconds(s)}>{s}초</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="small">그림체</span>
        {styles.map((s) => (
          <button key={s.id} className={`btn btn-sm ${style === s.id ? "btn-primary" : ""}`} onClick={() => setStyle(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <span className="small" style={{ flexShrink: 0 }}>이미지 모델</span>
        <select className="input" value={imageModel} onChange={(e) => setImageModel(e.target.value)} aria-label="이미지 모델" style={{ maxWidth: 360 }}>
          {imageModels.map((m) => <option key={m.id} value={m.id}>{m.label}{m.note ? ` · ${m.note}` : ""}</option>)}
        </select>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>Gemini 이미지 모델은 캐릭터 그림을 참고로 넣어 장면마다 같은 인물을 그려요(추천). 장면 영상은 Higgsfield(Wan 2.6)로 만들어요.</p>
      {err && <div className="notice notice-bad small">{err}</div>}
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || !prompt.trim()} onClick={start}>{busy ? <><span className="spinner" /> AI가 기획 중… (20초쯤)</> : "🎬 기획 시작"}</button>
    </section>
  );
}
