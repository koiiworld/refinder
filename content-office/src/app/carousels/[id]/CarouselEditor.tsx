"use client";

import Link from "next/link";
import HashtagInput from "@/components/HashtagInput";
import { formatHashtags, hashtagTokens } from "@/lib/caption-styles";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import type { Carousel, CarouselStyle, Slide } from "@/lib/carousel";
import CardZoom from "../CardZoom";
import CarouselTextAI from "../CarouselTextAI";
import DesignPicker from "../DesignPicker";
import BlogPostPicker from "../BlogPostPicker";
import { canvasBlob, FONT, renderSlide } from "../render";

const TEMPLATES: { id: CarouselStyle["template"]; label: string }[] = [
  { id: "photo", label: "📷 사진 꽉 채움" },
  { id: "clean", label: "⬜ 깔끔한 흰 배경" },
  { id: "bold", label: "🟧 컬러 배경 큰 글씨" },
];
const KIND: Record<Slide["kind"], string> = { cover: "표지", content: "내용", cta: "마무리(저장·태그)" };

function useImages(id: string, count: number, version: number) {
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      Array.from({ length: count }, (_, n) =>
        new Promise<HTMLImageElement | null>((ok) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => ok(null);
          im.src = `/api/carousels/${id}/img/${n}?v=${version}`;
        }),
      ),
    ).then((list) => alive && setImgs(list));
    return () => {
      alive = false;
    };
  }, [id, count, version]);
  return imgs;
}

function Preview({ slide, index, total, img, style, fontReady, onCanvas }: { slide: Slide; index: number; total: number; img: HTMLImageElement | null; style: CarouselStyle; fontReady: boolean; onCanvas: (i: number, c: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderSlide(ref.current, slide, index, total, img, style);
  }, [slide, index, total, img, style, fontReady]);
  useEffect(() => {
    onCanvas(index, ref.current);
    return () => onCanvas(index, null);
  }, [index, onCanvas]);
  return <canvas ref={ref} style={{ width: "100%", height: "auto", borderRadius: 10, display: "block", border: "1px solid var(--line)" }} aria-label={`${index + 1}장 미리보기`} />;
}

export default function CarouselEditor({ initial, recent = [], types = [] }: { initial: Carousel; recent?: { title: string; url: string; blog: string }[]; types?: { id: string; label: string; range: string }[] }) {
  const router = useRouter();
  const [zoomIndex,setZoomIndex]=useState<number|null>(null);
  const [c, setC] = useState(initial);
  const [slides, setSlides] = useState<Slide[]>(initial.slides);
  const [style, setStyle] = useState<CarouselStyle>({ ...initial.style, template: initial.style?.template ?? "photo", accent: initial.style?.accent ?? "#ff6b35", handle: initial.style?.handle ?? "" });
  const [caption, setCaption] = useState(initial.caption);
  const [tags, setTags] = useState(initial.hashtags.map((h) => "#" + h).join(" "));
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "ai" | "export" | "upload" | "import" | "hooks" | "text">("");
  const ctype = c.style?.contentType ?? "general";
  const [importUrl, setImportUrl] = useState(recent[0]?.url ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [imgVer, setImgVer] = useState(0);
  const [hex, setHex] = useState(initial.style?.accent ?? "#ff6b35");
  const [fontReady, setFontReady] = useState(false);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgs = useImages(c.id, c.images.length, imgVer);
  const onCanvas = useMemo(() => (i: number, el: HTMLCanvasElement | null) => { canvases.current[i] = el; }, []);

  useEffect(() => {
    document.fonts?.load(`800 80px ${FONT}`).then(() => document.fonts.load(`500 40px ${FONT}`)).finally(() => setFontReady(true));
  }, []);

  function apply(next: Carousel) {
    setC(next);
    setSlides(next.slides);
    setCaption(next.caption);
    setTags(next.hashtags.map((h) => "#" + h).join(" "));
    setDirty(false);
  }
  const setAccent = (accent: string) => {
    setStyle(cur=>({...cur,accent,design:cur.design ? {...cur.design,accent} : cur.design}));
    setHex(accent); setDirty(true);
  };
  const edit = (i: number, patch: Partial<Slide>) => {
    setSlides((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const move = (i: number, d: number) => {
    setSlides((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setDirty(true);
  };

  async function save(silent = false) {
    setBusy("save");
    try {
      const next = await api<Carousel>(`/api/carousels/${c.id}`, "PUT", { title: c.title, slides, caption, hashtags: hashtagTokens(tags), style });
      apply(next);
      if (!silent) setMsg({ ok: true, text: "저장했어요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function regenerate() {
    if (dirty && !confirm("고친 내용이 AI 결과로 바뀝니다. 계속할까요?")) return;
    setBusy("ai");
    setMsg(null);
    try {
      await api(`/api/carousels/${c.id}`, "PUT", { style });
      apply(await api<Carousel>(`/api/carousels/${c.id}`, "POST", { action: "regenerate", feedback }));
      setFeedback("");
      setMsg({ ok: true, text: "AI가 다시 만들었어요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function upload(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 6);
    if (!list.length) return;
    setBusy("upload");
    try {
      for (const f of list) {
        const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
        const r = await api<{ index: number; carousel: Carousel }>(`/api/carousels/${c.id}`, "POST", { action: "upload", dataUrl });
        setC((cur) => ({ ...cur, images: r.carousel.images }));
      }
      setImgVer((v) => v + 1);
      setMsg({ ok: true, text: `사진 ${list.length}장을 올렸어요. 장마다 '사진'에서 고르세요.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  }

  /** 콘텐츠 유형 바꾸기 → 전에 만든 적 있으면 그대로 불러옴(AI 비용 없음), 처음이면 AI가 만듦 */
  async function changeType(id: string) {
    if (id === ctype) return;
    const made = !!c.style?.versions?.[id as keyof NonNullable<typeof c.style.versions>];
    setBusy("ai");
    setMsg(null);
    try {
      await api(`/api/carousels/${c.id}`, "PUT", { style });
      const r = await api<Carousel & { reused: boolean }>(`/api/carousels/${c.id}`, "POST", { action: "switch_type", type: id, slides, caption, hashtags: hashtagTokens(tags) });
      apply(r);
      setMsg({ ok: true, text: r.reused ? `전에 만든 '${types.find((t) => t.id === id)?.label}' 버전을 불러왔어요 (AI 비용 없음).` : `'${types.find((t) => t.id === id)?.label}' 구성으로 새로 만들었어요.` });
      void made;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function newHooks() {
    setBusy("hooks");
    try {
      setC(await api<Carousel>(`/api/carousels/${c.id}`, "POST", { action: "hooks" }));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function importPhotos() {
    if (!importUrl.trim()) return;
    setBusy("import");
    setMsg(null);
    try {
      const r = await api<{ added: number; carousel: Carousel }>(`/api/carousels/${c.id}`, "POST", { action: "import_images", url: importUrl.trim() });
      setC((cur) => ({ ...cur, images: r.carousel.images }));
      setImgVer((v) => v + 1);
      setMsg({ ok: true, text: `블로그 사진 ${r.added}장을 가져왔어요. 장마다 '사진'에서 고르거나, AI 다시 만들기를 누르면 AI가 사진을 배치해요.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function exportAll(mode: "share" | "download") {
    setBusy("export");
    setMsg(null);
    try {
      if (dirty) await save(true);
      const files: File[] = [];
      for (let i = 0; i < slides.length; i++) {
        const cv = canvases.current[i];
        if (!cv) continue;
        files.push(new File([await canvasBlob(cv)], `carousel-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" }));
      }
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (mode === "share" && nav.canShare?.({ files })) {
        await navigator.share({ files, title: c.title });
      } else {
        for (const f of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          await new Promise((r) => setTimeout(r, 300));
          URL.revokeObjectURL(a.href);
        }
        setMsg({ ok: true, text: `${files.length}장을 내려받았어요. 순서대로 인스타에 올리면 돼요.` });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy("");
  }

  async function copyCaption() {
    const text = `${caption.trim()}\n\n${formatHashtags(tags, false)}`.trim();
    await navigator.clipboard.writeText(text);
    setMsg({ ok: true, text: "캡션+해시태그를 복사했어요." });
  }

  async function remove() {
    if (!confirm("이 캐러셀을 휴지통으로 옮길까요? (30일 안에 되살릴 수 있어요)")) return;
    await api(`/api/carousels/${c.id}`, "DELETE");
    router.push("/carousels");
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;600;800;900&display=swap" />
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between">
          <div className="small muted">
            {c.project_id ? <Link href={`/posts/${c.project_id}`} style={{ color: "var(--accent)" }}>← 원본 블로그 글</Link> : "주제로 만든 캐러셀"} · 장 {slides.length}개{c.ai?.model && ` · ${c.ai.provider}/${c.ai.model}`}
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => exportAll("share")}>{busy === "export" ? <span className="spinner" /> : "📤 사진에 저장·공유"}</button>
            <button className="btn" disabled={!!busy} onClick={() => exportAll("download")}>⬇️ 하나씩 내려받기</button>
            <button className="btn" disabled={!!busy || !dirty} onClick={() => save()}>{busy === "save" ? <span className="spinner" /> : dirty ? "💾 저장" : "저장됨"}</button>
          </div>
        </div>
        {msg && <div className={`notice ${msg.ok ? "notice-ok" : "notice-bad"} small`}>{msg.text}</div>}
        <div className="row" style={{ gap: 8 }}>
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`btn btn-sm ${style.template === t.id ? "btn-primary" : ""}`} onClick={() => { setStyle({ ...style, template: t.id, design: null, designRef: "" }); setDirty(true); }}>{t.label}</button>
          ))}
          <span className="small row" style={{ gap: 4, flexWrap: "nowrap" }}>
            강조색
            <input type="color" value={style.accent} onChange={(e) => { setAccent(e.target.value); }} aria-label="강조색 고르기" />
            <input
              className="input"
              style={{ width: 92, fontFamily: "monospace", padding: "4px 8px" }}
              value={hex}
              onChange={(e) => {
                const v = e.target.value.trim();
                setHex(v);
                const m = /^#?([0-9a-f]{6})$/i.exec(v);
                if (m) { setAccent(`#${m[1].toLowerCase()}`); }
              }}
              placeholder="#ff6b35"
              aria-label="강조색 HEX"
              title="HEX 색상 코드 (예: #ff6b35)"
            />
            {["#ff6b35", "#2f6bff", "#16a34a", "#e11d48", "#111827", "#f59e0b"].map((col) => (
              <button key={col} type="button" onClick={() => { setAccent(col); }} aria-label={`강조색 ${col}`} title={col} style={{ width: 18, height: 18, borderRadius: 9, border: style.accent === col ? "2px solid var(--text)" : "1px solid var(--line)", background: col, cursor: "pointer", padding: 0 }} />
            ))}
          </span>
          <input className="input" style={{ maxWidth: 180 }} placeholder="@인스타 계정 (선택)" value={style.handle} onChange={(e) => { setStyle({ ...style, handle: e.target.value }); setDirty(true); }} aria-label="인스타 계정" />
        </div>
        {!!types.length && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="tiny muted">콘텐츠 유형 · ✓ 표시는 만들어 둔 버전이 있어 AI 비용 없이 불러와요</div>
            <div className="row" style={{ gap: 6 }}>
              {types.map((t) => (
                <button key={t.id} className={`btn btn-sm ${ctype === t.id ? "btn-primary" : ""}`} disabled={!!busy} onClick={() => changeType(t.id)} title={c.style?.versions?.[t.id as keyof NonNullable<typeof c.style.versions>] ? "만들어 둔 버전 불러오기 (AI 비용 없음)" : `추천 ${t.range} · 처음이라 AI가 만들어요`}>
                  {t.label} <span className="tiny" style={{ opacity: 0.75 }}>{t.range}</span>{ctype !== t.id && c.style?.versions?.[t.id as keyof NonNullable<typeof c.style.versions>] ? <span className="tiny"> ✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        {!!c.style?.hooks?.length && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="tiny muted row" style={{ gap: 6 }}>
              표지 문구 다른 후보 (누르면 바뀌어요)
              <button className="btn btn-sm btn-ghost" style={{ padding: "0 8px" }} disabled={!!busy} onClick={newHooks} title="표지 문구 다시 받기" aria-label="표지 문구 다시 받기">{busy === "hooks" ? <span className="spinner" /> : "↻ 다시 받기"}</button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {c.style.hooks.map((h) => <button key={h} className="btn btn-sm btn-ghost" onClick={() => edit(0, { headline: h })}>{h.replace(/\n/g, " ")}</button>)}
            </div>
          </div>
        )}
        <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <input className="input" placeholder="AI에게 수정 요청 (예: 표지에서 얻는 정보를 더 명확히 / 7장으로 줄여줘 / 준비물 체크리스트 추가)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <button className="btn" disabled={!!busy} onClick={regenerate}>{busy === "ai" ? <><span className="spinner" /> 만드는 중…</> : "🔄 AI 다시 만들기"}</button>
        </div>
      </section>

      {slides[0] && <DesignPicker total={slides.length} style={style} slide={slides[0]} img={slides[0].image != null ? imgs[slides[0].image] ?? null : null} disabled={!!busy} onChoose={next=>{setStyle(next);setHex(next.accent);setDirty(true);}} />}
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between">
          <b className="small">사진 ({c.images.length})</b>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "upload" ? <span className="spinner" /> : "📷 내 사진 올리기"}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void upload(Array.from(e.target.files))} />
        </div>
        <div className="stack" style={{gap:8}}>
          <BlogPostPicker id={c.id} recent={recent} value={importUrl} onChange={setImportUrl}/>
          {recent.some(p=>p.url===importUrl)&&<p className="small" style={{margin:0,overflowWrap:'anywhere'}}>선택한 글: {recent.find(p=>p.url===importUrl)?.title}</p>}
          <div className="row" style={{gap:6}}>
            <input className="input" style={{flex:1,minWidth:0}} value={importUrl} onChange={e=>setImportUrl(e.target.value)} placeholder="또는 블로그 글 주소 붙여넣기" aria-label="블로그 글 주소" />
            <button className="btn btn-sm" disabled={!!busy || !importUrl.trim()} onClick={importPhotos}>{busy === "import" ? <span className="spinner" /> : "📥 블로그 글 사진 가져오기"}</button>
          </div>
        </div>
        {c.images.length ? (
          <div className="row" style={{ gap: 6 }}>
            {c.images.map((im, n) => (
              <div key={n} style={{ position: "relative" }} title={im.alt}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/carousels/${c.id}/img/${n}?v=${imgVer}`} alt={im.alt} style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 6, display: "block" }} />
                <span className="tiny" style={{ position: "absolute", left: 3, top: 2, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 4, padding: "0 4px" }}>{n + 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="tiny muted" style={{ margin: 0 }}>사진이 없으면 글자 중심 카드로 만들어져요. 직접 찍은 사진을 올리면 저장·공유가 더 잘 나와요.</p>
        )}
      </section>

      <div className="carousel-grid">
        {slides.map((s, i) => (
          <section key={i} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row between">
              <b className="small">{i + 1}장 · {KIND[s.kind]}</b>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" disabled={!!busy||i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button>
                <button className="btn btn-sm btn-ghost" disabled={!!busy||i === slides.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button>
                <button className="btn btn-sm btn-ghost" disabled={!!busy||slides.length <= 2} onClick={() => { setSlides(slides.filter((_, k) => k !== i)); setDirty(true); }} aria-label="삭제">✕</button>
              </div>
            </div>
            <button type="button" aria-label={`${i+1}장 크게 보기`} onClick={()=>setZoomIndex(i)} style={{border:0,padding:0,background:'transparent',cursor:'zoom-in',width:'100%'}}><Preview slide={s} index={i} total={slides.length} img={s.image != null ? imgs[s.image] ?? null : null} style={style} fontReady={fontReady} onCanvas={onCanvas} /></button>
            <textarea className="textarea" style={{ minHeight: 56, fontWeight: 700 }} value={s.headline} onChange={(e) => edit(i, { headline: e.target.value })} placeholder="큰 글씨 (줄바꿈 가능)" aria-label={`${i + 1}장 큰 글씨`} />
            <textarea className="textarea" style={{ minHeight: 56 }} value={s.body} onChange={(e) => edit(i, { body: e.target.value })} placeholder="작은 글씨 (선택)" aria-label={`${i + 1}장 작은 글씨`} />
            <select className="input" value={s.image ?? ""} onChange={(e) => edit(i, { image: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`${i + 1}장 사진`}>
              <option value="">사진 없음</option>
              {c.images.map((im, n) => <option key={n} value={n}>사진 {n + 1}{im.alt ? ` · ${im.alt.slice(0, 20)}` : ""}</option>)}
            </select>
            <CarouselTextAI id={c.id} kind="slide" index={i} slides={slides} disabled={!!busy} onBusy={b=>setBusy(b?'text':'')} onApply={draft=>{setSlides(current=>current.map((slide,n)=>n===i?{...slide,headline:draft.headline??slide.headline,body:draft.body??slide.body}:slide));setDirty(true);}}/>
          </section>
        ))}
        <button
          className="card card-pad"
          disabled={!!busy}
          style={{ borderStyle: "dashed", minHeight: 120, cursor: "pointer", background: "var(--panel-2)" }}
          onClick={() => { const n = [...slides]; n.splice(Math.max(1, n.length - 1), 0, { kind: "content", headline: "새 장", body: "", image: null }); setSlides(n); setDirty(true); }}
        >
          + 장 추가
        </button>
      </div>

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between">
          <b className="small">캡션 · 해시태그</b>
          <button className="btn btn-sm" onClick={copyCaption}>📋 캡션 복사</button>
        </div>
        <textarea className="textarea" style={{ minHeight: 160 }} value={caption} onChange={(e) => { setCaption(e.target.value); setDirty(true); }} aria-label="캡션" />
        <HashtagInput value={tags} onChange={(v) => { setTags(v); setDirty(true); }} placeholder="#해시태그 입력 후 스페이스 (3~5개)" />
        <CarouselTextAI id={c.id} kind="caption" slides={slides} caption={caption} hashtags={hashtagTokens(tags)} disabled={!!busy} onBusy={b=>setBusy(b?'text':'')} onApply={draft=>{setCaption(draft.caption??caption);setTags((draft.hashtags??[]).map(t=>'#'+t).join(' '));setDirty(true);}}/>
        <p className="tiny muted" style={{ margin: 0 }}>첫 줄이 피드에서 보이는 후킹 문구예요. 해시태그는 요즘 3~5개만 붙이는 추세예요.</p>
      </section>

      {zoomIndex!==null&&slides[zoomIndex]&&<CardZoom slides={slides} index={zoomIndex} img={slides[zoomIndex].image!=null?imgs[slides[zoomIndex].image!]??null:null} style={style} fontReady={fontReady} onIndex={setZoomIndex} onClose={()=>setZoomIndex(null)}/>}
      <div className="row">
        <button className="btn btn-ghost" onClick={remove}>🗑 이 캐러셀 지우기</button>
      </div>
    </div>
  );
}
