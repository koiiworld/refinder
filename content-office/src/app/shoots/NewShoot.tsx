"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import { MAX_SHOOT_CLIPS, SHOOT_KINDS, SHOOT_LENGTHS, type ShootKindId } from "@/lib/shoot-types";

type Est = { model: string; usd: number | null } | null;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)}MB`;

/** 새 촬영 올리기: 종류 · 메모 · 영상 여러 개 → 올리면 영상 확인·대본까지 자동 (올리기 = 대본 AI 비용 승인) */
export default function NewShoot({ estimate }: { estimate: Est }) {
  const router = useRouter();
  const [kind, setKind] = useState<ShootKindId>("food");
  const [memo, setMemo] = useState("");
  const [seconds, setSeconds] = useState<number>(30);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const k = SHOOT_KINDS.find((x) => x.id === kind)!;

  function pick(list: FileList | null) {
    if (!list) return;
    const add = Array.from(list).filter((f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    setFiles((cur) => [...cur, ...add.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, MAX_SHOOT_CLIPS));
  }

  async function start() {
    setErr("");
    const big = files.find((f) => f.size > 300 * 1024 * 1024);
    if (big) return setErr(`${big.name} 이(가) 300MB를 넘어요. 더 짧게 찍은 영상으로 올려 주세요.`);
    try {
      const videoIds: string[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`영상 올리는 중 ${i + 1}/${files.length} (${mb(f.size)})`);
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
        const d = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !d.id) throw new Error(`${f.name}: ${d.error ?? `올리기 실패 (${res.status})`}`);
        videoIds.push(d.id);
      }
      setBusy("영상 확인 시작하는 중");
      const r = await api<{ id: string }>("/api/shoots", "POST", { videoIds, kind, memo, seconds, confirm: true });
      router.push(`/shoots/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <b>새 촬영 올리기</b>
      <div className="row" style={{ gap: 6 }}>
        {SHOOT_KINDS.map((x) => <button key={x.id} className={`chip ${kind === x.id ? "on" : ""}`} onClick={() => setKind(x.id)}>{x.label}</button>)}
      </div>
      <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={`메모 (${k.hint})\n가격·위치·이름 같은 사실은 여기 적은 것만 자막에 써요.`} aria-label="촬영 메모" />
      <div className="row" style={{ gap: 8 }}>
        <span className="small muted">길이</span>
        <div className="seg">{SHOOT_LENGTHS.map((n) => <button key={n} className={seconds === n ? "on" : ""} onClick={() => setSeconds(n)}>약 {n}초</button>)}</div>
      </div>
      <label className="btn" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
        🎞 영상 고르기 (여러 개)
        <input type="file" accept="video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </label>
      {files.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {files.map((f, i) => (
            <div key={f.name + f.size} className="row small" style={{ gap: 6 }}>
              <span className="badge">클립 {i + 1}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55vw" }}>{f.name}</span>
              <span className="muted">{mb(f.size)}</span>
              {!busy && <button className="btn btn-ghost btn-sm" onClick={() => setFiles((c) => c.filter((x) => x !== f))} aria-label={`${f.name} 빼기`}>✕</button>}
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={!!busy || !files.length} onClick={start}>{busy ? <><span className="spinner" /> {busy}</> : "📤 올리고 대본 받기"}</button>
        <span className="small muted">대본 AI 예상 비용 {estimate?.usd != null ? fmtUsd(estimate.usd) : "단가 정보 없음"}{estimate ? ` · ${estimate.model}` : ""} — 올리면 승인한 것으로 처리해요. 영상 확인은 무료 AI예요.</span>
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <span className="tiny muted">한 번에 {MAX_SHOOT_CLIPS}개, 클립당 300MB까지. 50MB가 넘는 클립은 화질을 조금 줄여 저장해요. 올린 뒤 화면을 닫아도 계속되고, 대본이 준비되면 텔레그램으로 알려 줘요. 맥이 꺼져 있으면 켜질 때 시작돼요.</span>
    </section>
  );
}
