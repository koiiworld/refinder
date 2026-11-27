"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import { isVideoFile, MAX_SHOOT_CLIPS, MAX_SHOOT_REFS, SHOOT_KINDS, SHOOT_LENGTHS, type ShootKindId } from "@/lib/shoot-types";

type Est = { model: string; usd: number | null } | null;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)}MB`;

/** 새 촬영 올리기: 종류 · 메모 · 영상 여러 개 → 올리면 영상 확인·대본까지 자동 (올리기 = 대본 AI 비용 승인) */
export default function NewShoot({ estimate, faceEstimate, viewEstimate, studies }: { estimate: Est; faceEstimate: Est; viewEstimate: Est; studies: { id: string; title: string; sub: string }[] }) {
  const [refs, setRefs] = useState<string[]>([]);
  const [refUrls, setRefUrls] = useState("");
  const urlList = refUrls.split(/\s+/).filter((u) => /^https?:\/\//.test(u));
  const [mosaic, setMosaic] = useState(false);
  const router = useRouter();
  const [kind, setKind] = useState<ShootKindId>("food");
  const [memo, setMemo] = useState("");
  const [seconds, setSeconds] = useState<number>(30);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const k = SHOOT_KINDS.find((x) => x.id === kind)!;

  const done = useRef<Record<string, string>>({}); // 올라간 클립 (파일 → 영상 번호)
  const [over, setOver] = useState(false);
  const [note, setNote] = useState("");

  function pick(list: FileList | File[] | null) {
    if (!list) return;
    const all = Array.from(list);
    const add = all.filter(isVideoFile);
    const skipped = all.filter((f) => !isVideoFile(f));
    const next = [...files, ...add.filter((f) => !files.some((c) => c.name === f.name && c.size === f.size))];
    // 맥 사진 앱은 브라우저로 영상을 끌어오면 영상 대신 미리보기 사진(JPEG)만 넘겨줌 → 되는 방법 안내
    const photoOnly = skipped.some((f) => /^image\//.test(f.type) || /\.(jpe?g|heic|png)$/i.test(f.name));
    setNote([skipped.length ? `영상이 아니라서 뺐어요: ${skipped.map((f) => f.name).slice(0, 3).join(", ")}${skipped.length > 3 ? ` 외 ${skipped.length - 3}개` : ""}` : "",
      photoOnly ? "맥 사진 앱에서 영상을 끌어오면 영상 대신 사진(JPEG)만 넘어와요. 점선 칸을 눌러 열리는 창의 왼쪽 '미디어 → 사진'에서 영상을 고르거나, 사진 앱에서 영상을 바탕화면으로 먼저 끌어낸 뒤 그 파일을 끌어오세요." : "", next.length > MAX_SHOOT_CLIPS ? `한 번에 ${MAX_SHOOT_CLIPS}개까지라 뒤의 ${next.length - MAX_SHOOT_CLIPS}개는 뺐어요.` : ""].filter(Boolean).join(" "));
    setFiles(next.slice(0, MAX_SHOOT_CLIPS));
  }
  // 칸 밖에 떨어뜨려도 브라우저가 영상을 새 창으로 열어 버리지 않게
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);
  function drop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    // 사진 앱에서 끌어오면 files 가 비고 items 로만 올 때가 있어 둘 다 봄
    const dt = e.dataTransfer;
    const fromItems = Array.from(dt.items ?? []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
    const list = dt.files?.length ? Array.from(dt.files) : fromItems;
    if (!list.length) return setNote("끌어온 것에서 파일을 찾지 못했어요. 사진 앱에서는 영상을 잠깐 누른 채로 끌어오거나, 영상 고르기 버튼을 써 주세요.");
    pick(list);
  }

  async function start() {
    setErr("");
    const big = files.find((f) => f.size > 300 * 1024 * 1024);
    if (big) return setErr(`${big.name} 이(가) 300MB를 넘어요. 더 짧게 찍은 영상으로 올려 주세요.`);
    try {
      const videoIds: string[] = [];
      for (const [i, f] of files.entries()) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        // 이미 올라간 클립은 다시 올리지 않음 (중간에 끊겨 다시 눌렀을 때)
        if (!done.current[key]) {
          // 서버가 잠깐 재시작 중이면 연결이 끊김 → 기다렸다가 2번 더 시도
          for (let attempt = 1; ; attempt++) {
            setBusy(`영상 올리는 중 ${i + 1}/${files.length} (${mb(f.size)})${attempt > 1 ? ` · 연결이 끊겨 다시 시도 ${attempt}/3` : ""}`);
            try {
              const fd = new FormData();
              fd.append("file", f);
              const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
              const d = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
              if (res.ok && d.id) { done.current[key] = d.id; break; }
              if (res.status < 500) throw Object.assign(new Error(`${f.name}: ${d.error ?? `올리기 실패 (${res.status})`}`), { final: true });
              throw new Error(`${f.name}: 서버 오류 (${res.status})`);
            } catch (e) {
              if ((e as { final?: boolean }).final || attempt >= 3) throw (e as { final?: boolean }).final ? e : new Error(`클립 ${i + 1}(${f.name})을 올리다 서버와 연결이 끊겼어요. 앞의 ${i}개는 올라가 있으니, 잠시 뒤 '올리고 대본 받기'를 다시 누르면 이 클립부터 이어서 올려요.`);
              await new Promise((r) => setTimeout(r, 15_000));
            }
          }
        }
        videoIds.push(done.current[key]);
      }
      setBusy("영상 확인 시작하는 중");
      const r = await api<{ id: string }>("/api/shoots", "POST", { videoIds, kind, memo, seconds, mosaic, refs, refUrls: urlList, confirm: true });
      router.push(`/shoots/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 10, outline: over ? "2px dashed var(--accent)" : undefined, outlineOffset: -4, background: over ? "var(--accent-soft)" : undefined }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={drop}>
      <b>새 촬영 올리기</b>
      <div className="row" style={{ gap: 6 }}>
        {SHOOT_KINDS.map((x) => <button key={x.id} className={`chip ${kind === x.id ? "on" : ""}`} onClick={() => setKind(x.id)}>{x.label}</button>)}
      </div>
      <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={`메모 (${k.hint})\n가격·위치·이름 같은 사실은 여기 적은 것만 자막에 써요.`} aria-label="촬영 메모" />
      <div className="row" style={{ gap: 8 }}>
        <span className="small muted">길이</span>
        <div className="seg">{SHOOT_LENGTHS.map((n) => <button key={n} className={seconds === n ? "on" : ""} onClick={() => setSeconds(n)}>약 {n}초</button>)}</div>
      </div>
      <label style={{ border: "2px dashed var(--line)", borderRadius: 12, padding: "18px 12px", textAlign: "center", cursor: "pointer", display: "block" }}>
        <div><b>{over ? "여기에 놓으세요" : "🎞 영상을 여기로 끌어다 놓거나 눌러서 고르기"}</b></div>
        <div className="tiny muted" style={{ marginTop: 4 }}>여러 개 한꺼번에 · 폴더(Finder·탐색기)에서 끌어오기 · 맥 사진 앱의 영상은 눌러서 고르기 → 미디어 → 사진 · mp4·mov(아이폰)·m4v·webm·mkv·avi·3gp</div>
        <input type="file" accept="video/*,.mp4,.mov,.m4v,.qt,.webm,.mkv,.avi,.3gp,.3g2,.mts,.m2ts,.mpg,.mpeg" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </label>
      {note && <div className="notice notice-warn small">{note}</div>}
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
      <details>
        <summary className="small"><b>🎯 참고 릴스 (레퍼런스)</b> <span className="muted">— 다른 사람 릴스의 구성·호흡·자막 말투를 따라 대본을 짜요{refs.length + urlList.length ? ` · ${Math.min(MAX_SHOOT_REFS, refs.length + urlList.length)}개 고름` : ""}</span></summary>
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {studies.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {studies.map((x) => <button key={x.id} className={`chip ${refs.includes(x.id) ? "on" : ""}`} title={x.sub} onClick={() => setRefs((r) => (r.includes(x.id) ? r.filter((y) => y !== x.id) : r.length + urlList.length >= MAX_SHOOT_REFS ? r : [...r, x.id]))}>{x.title}</button>)}
            </div>
          )}
          <textarea className="textarea" rows={2} value={refUrls} onChange={(e) => setRefUrls(e.target.value)} placeholder={"새 릴스·쇼츠 링크 붙여넣기 (한 줄에 하나)\nhttps://www.instagram.com/reel/..."} aria-label="참고 릴스 링크" />
          <span className="tiny muted">최대 {MAX_SHOOT_REFS}개. 위 목록은 릴스 분석에서 이미 분석해 둔 영상이에요. 새 링크는 맥이 받아서 분석한 뒤(무료 AI) 대본에 반영하느라 몇 분 더 걸려요. 구성과 말투만 참고하고 문구·내용은 베끼지 않아요.</span>
        </div>
      </details>
      <label className="row small" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap" }}>
        <input type="checkbox" checked={mosaic} disabled={!!busy} onChange={(e) => setMosaic(e.target.checked)} style={{ marginTop: 2 }} />
        <span>
          <b>🫥 얼굴 모자이크</b> — 영상에 보이는 사람 얼굴을 전부 가려요 (Claude가 얼굴 위치를 찾고 맥이 가림)
          {mosaic && <span className="muted" style={{ display: "block", marginTop: 2 }}>추가 비용: 15초 클립 하나에 약 {faceEstimate?.usd != null ? fmtUsd(faceEstimate.usd) : "단가 정보 없음"}{faceEstimate ? ` · ${faceEstimate.model}` : ""} (길이에 비례). AI가 1초에 2장씩 보고 가리기 때문에 빠르게 지나가는 얼굴은 놓칠 수 있어요. 올리기 전에 완성 영상을 꼭 확인하세요.</span>}
        </span>
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={!!busy || !files.length} onClick={start}>{busy ? <><span className="spinner" /> {busy}</> : "📤 올리고 대본 받기"}</button>
        <span className="small muted">대본 AI 예상 비용 {estimate?.usd != null ? fmtUsd(estimate.usd) : "단가 정보 없음"}{estimate ? ` · ${estimate.model}` : ""} — 올리면 승인한 것으로 처리해요. 영상 확인은 클립당 약 {viewEstimate?.usd != null ? fmtUsd(viewEstimate.usd) : "?"}{viewEstimate ? ` (${viewEstimate.model})` : ""}.</span>
      </div>
      {err && <div className="notice notice-bad small">{err}</div>}
      <span className="tiny muted">한 번에 {MAX_SHOOT_CLIPS}개, 클립당 300MB까지. 50MB가 넘는 클립은 화질을 조금 줄여 저장해요. 올린 뒤 화면을 닫아도 계속되고, 대본이 준비되면 텔레그램으로 알려 줘요. 맥이 꺼져 있으면 켜질 때 시작돼요.</span>
    </section>
  );
}
