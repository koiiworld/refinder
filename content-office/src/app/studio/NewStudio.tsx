"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {fmtUsd} from "@/components/ui";
import { api } from "@/components/client-utils";

export default function NewStudio({ styles, imageModels, defaultPrompt = "" }: { defaultPrompt?: string; styles: { id: string; label: string }[]; imageModels: { id: string; label: string; note?: string }[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [seconds, setSeconds] = useState(20);
  const [style, setStyle] = useState("real");
  const [subjectMode,setSubjectMode]=useState<"food"|"character">("food");
  const [imageModel, setImageModel] = useState("google:gemini-3.1-flash-image");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [feedback,setFeedback]=useState(""),[preview,setPreview]=useState<{prompt:string;changes:string[]}|null>(null),[previous,setPrevious]=useState<string|null>(null);
  async function rewrite(){setErr("");setBusy(true);try{const est=await api<{total:number|null;steps:{model:string;provider:string}[]}>("/api/studio/rewrite");if(!confirm(`문구·구성을 다시 생성할까요?\n${est.steps[0]?.provider}/${est.steps[0]?.model}\n예상 비용: ${est.total===null?"단가 미등록으로 계산할 수 없어요":fmtUsd(est.total)} (추정치, 실제 청구는 다를 수 있어요)\n이미지·영상은 생성하지 않으며, 원래 입력은 유지해요.`))return;setBusy(true);setPreview(await api("/api/studio/rewrite","POST",{confirm:true,prompt,feedback,seconds,style,subjectMode}));}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: string }>("/api/studio", "POST", { prompt, seconds, style, imageModel,subjectMode });
      router.push(`/studio/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 10, marginBottom: 16 }}>
      <b className="small">① 어떤 영상을 만들까요?</b>
      <div className="row"><button className={`btn btn-sm ${subjectMode==="food"?"btn-primary":""}`} disabled={busy} onClick={()=>{setSubjectMode("food");setStyle("real");}}>🍲 음식 클로즈업</button><button className={`btn btn-sm ${subjectMode==="character"?"btn-primary":""}`} disabled={busy} onClick={()=>{setSubjectMode("character");setStyle("3d");}}>인물·캐릭터</button></div>
      <p className="tiny muted">{subjectMode==="food"?"음식·재료·조리 과정만 확대해서 보여주는 실사 레시피 영상이에요. 사람·손·캐릭터 제작 없이 장면 이미지부터 시작해요.":"같은 인물·캐릭터를 장면마다 유지하는 영상이에요."}</p>
      <textarea
        className="textarea"
        style={{ minHeight: 90 }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={subjectMode==="food"?"예: 닭한마리 레시피를 음식만 확대해서 보여주는 20초 릴스. 냄비 속 재료 → 끓는 육수 → 완성한 한 그릇 순서. 사람·손·캐릭터 없이 음식 클로즈업으로.":"예: 귀여운 감자 캐릭터가 에어프라이어로 감자튀김 만드는 법을 알려주는 20초 릴스."}
        aria-label="영상 아이디어"
      />
      <label className="label">다시 생성할 방향<textarea className="textarea" aria-label="영상 문구·구성 수정 요청" value={feedback} disabled={busy} onChange={e=>setFeedback(e.target.value)} placeholder="예: 대사는 덜 뻔하게, 조리 과정을 먼저 보여주고 마지막에 완성 장면으로 마무리"/></label>
      <div className="row"><button className="btn btn-sm" disabled={busy||!prompt.trim()} onClick={rewrite}>문구·구성 다시 생성</button>{previous!==null&&<button className="btn btn-sm" disabled={busy} onClick={()=>{setPrompt(previous);setPrevious(null);setPreview(null);}}>이전 입력으로 되돌리기</button>}</div>
      {preview&&<section className="card card-pad stack" style={{gap:8}}><b className="small">새 문구·구성 미리보기</b><textarea className="textarea" style={{minHeight:180}} aria-label="새 영상 문구·구성" value={preview.prompt} onChange={e=>setPreview({...preview,prompt:e.target.value})}/>{preview.changes.map((x,i)=><p key={i} className="tiny muted">· {x}</p>)}<div className="row"><button className="btn btn-primary btn-sm" disabled={busy||!preview.prompt.trim()} onClick={()=>{setPrevious(prompt);setPrompt(preview.prompt);setPreview(null);}}>이 안을 영상 아이디어에 적용</button><button className="btn btn-sm" disabled={busy} onClick={()=>setPreview(null)}>새 안 닫기</button></div></section>}
      <div className="row" style={{ gap: 8 }}>
        <span className="small">길이</span>
        {[15, 20, 30, 45].map((s) => (
          <button key={s} className={`btn btn-sm ${seconds === s ? "btn-primary" : ""}`} onClick={() => setSeconds(s)}>{s}초</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="small">그림체</span>
        {styles.filter(s=>subjectMode!=="food"||s.id==="real").map((s) => (
          <button key={s.id} className={`btn btn-sm ${style === s.id ? "btn-primary" : ""}`} onClick={() => setStyle(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <span className="small" style={{ flexShrink: 0 }}>이미지 모델</span>
        <select className="input" value={imageModel} onChange={(e) => setImageModel(e.target.value)} aria-label="이미지 모델" style={{ maxWidth: 360 }}>
          {imageModels.map((m) => <option key={m.id} value={m.id}>{m.label}{m.note ? ` · ${m.note}` : ""}</option>)}
        </select>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{subjectMode==="food"?"캐릭터 단계 없이 음식 장면 이미지를 만든 뒤 짧은 조리 영상으로 연결해요.":"Gemini 이미지 모델은 캐릭터 그림을 참고로 넣어 장면마다 같은 인물을 그려요."} 장면 영상은 Higgsfield(Wan 2.6)로 만들어요.</p>
      {err && <div className="notice notice-bad small">{err}</div>}
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || !prompt.trim()} onClick={start}>{busy ? <><span className="spinner" /> AI가 기획 중… (20초쯤)</> : "🎬 기획 시작"}</button>
    </section>
  );
}
