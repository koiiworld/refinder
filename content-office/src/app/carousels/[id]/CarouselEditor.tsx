"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/client-utils";
import type { Carousel, CarouselStyle, Slide } from "@/lib/carousel";
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

export default function CarouselEditor({ initial, recent = [] }: { initial: Carousel; recent?: { title: string; url: string; blog: string }[] }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [slides, setSlides] = useState<Slide[]>(initial.slides);
  const [style, setStyle] = useState<CarouselStyle>({ template: initial.style?.template ?? "photo", accent: initial.style?.accent ?? "#ff6b35", handle: initial.style?.handle ?? "" });
  const [caption, setCaption] = useState(initial.caption);
  const [tags, setTags] = useState(initial.hashtags.map((h) => "#" + h).join(" "));
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "ai" | "export" | "upload" | "import">("");
  const [importUrl, setImportUrl] = useState(recent[0]?.url ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [imgVer, setImgVer] = useState(0);
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
      const next = await api<Carousel>(`/api/carousels/${c.id}`, "PUT", { title: c.title, slides, caption, hashtags: tags.split(/[\s,]+/).filter(Boolean), style });
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
    const text = `${caption.trim()}\n\n${tags.trim()}`.trim();
    await navigator.clipboard.writeText(text);
    setMsg({ ok: true, text: "캡션+해시태그를 복사했어요." });
  }

  async function remove() {
    if (!confirm("이 캐러셀을 지울까요?")) return;
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
            <button key={t.id} className={`btn btn-sm ${style.template === t.id ? "btn-primary" : ""}`} onClick={() => { setStyle({ ...style, template: t.id }); setDirty(true); }}>{t.label}</button>
          ))}
          <label className="small row" style={{ gap: 4 }}>강조색 <input type="color" value={style.accent} onChange={(e) => { setStyle({ ...style, accent: e.target.value }); setDirty(true); }} aria-label="강조색" /></label>
          <input className="input" style={{ maxWidth: 180 }} placeholder="@인스타 계정 (선택)" value={style.handle} onChange={(e) => { setStyle({ ...style, handle: e.target.value }); setDirty(true); }} aria-label="인스타 계정" />
        </div>
        {!!c.style?.hooks?.length && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="tiny muted">표지 문구 다른 후보 (누르면 바뀌어요)</div>
            <div className="row" style={{ gap: 6 }}>
              {c.style.hooks.map((h) => <button key={h} className="btn btn-sm btn-ghost" onClick={() => edit(0, { headline: h })}>{h.replace(/\n/g, " ")}</button>)}
            </div>
          </div>
        )}
        <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <input className="input" placeholder="AI에게 수정 요청 (예: 표지를 더 자극적으로 / 7장으로 줄여줘 / 준비물 체크리스트 추가)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <button className="btn" disabled={!!busy} onClick={regenerate}>{busy === "ai" ? <><span className="spinner" /> 만드는 중…</> : "🔄 AI 다시 만들기"}</button>
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between">
          <b className="small">사진 ({c.images.length})</b>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "upload" ? <span className="spinner" /> : "📷 내 사진 올리기"}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void upload(Array.from(e.target.files))} />
        </div>
        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
          {recent.length ? (
            <select className="input" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} aria-label="사진 가져올 블로그 글">
              {recent.map((p) => <option key={p.url} value={p.url}>[{p.blog}] {p.title}</option>)}
              <option value="">직접 주소 넣기…</option>
            </select>
          ) : null}
          {(!recent.length || !importUrl || !recent.some((p) => p.url === importUrl)) && (
            <input className="input" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="블로그 글 주소" aria-label="블로그 글 주소" />
          )}
          <button className="btn btn-sm" disabled={!!busy || !importUrl.trim()} onClick={importPhotos}>{busy === "import" ? <span className="spinner" /> : "📥 블로그 글 사진 가져오기"}</button>
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
                <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button>
                <button className="btn btn-sm btn-ghost" disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button>
                <button className="btn btn-sm btn-ghost" disabled={slides.length <= 2} onClick={() => { setSlides(slides.filter((_, k) => k !== i)); setDirty(true); }} aria-label="삭제">✕</button>
              </div>
            </div>
            <Preview slide={s} index={i} total={slides.length} img={s.image != null ? imgs[s.image] ?? null : null} style={style} fontReady={fontReady} onCanvas={onCanvas} />
            <textarea className="textarea" style={{ minHeight: 56, fontWeight: 700 }} value={s.headline} onChange={(e) => edit(i, { headline: e.target.value })} placeholder="큰 글씨 (줄바꿈 가능)" aria-label={`${i + 1}장 큰 글씨`} />
            <textarea className="textarea" style={{ minHeight: 56 }} value={s.body} onChange={(e) => edit(i, { body: e.target.value })} placeholder="작은 글씨 (선택)" aria-label={`${i + 1}장 작은 글씨`} />
            <select className="input" value={s.image ?? ""} onChange={(e) => edit(i, { image: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`${i + 1}장 사진`}>
              <option value="">사진 없음</option>
              {c.images.map((im, n) => <option key={n} value={n}>사진 {n + 1}{im.alt ? ` · ${im.alt.slice(0, 20)}` : ""}</option>)}
            </select>
          </section>
        ))}
        <button
          className="card card-pad"
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
        <input className="input" value={tags} onChange={(e) => { setTags(e.target.value); setDirty(true); }} placeholder="#해시태그 3~5개" aria-label="해시태그" />
        <p className="tiny muted" style={{ margin: 0 }}>첫 줄이 피드에서 보이는 후킹 문구예요. 해시태그는 요즘 3~5개만 붙이는 추세예요.</p>
      </section>

      <div className="row">
        <button className="btn btn-ghost" onClick={remove}>🗑 이 캐러셀 지우기</button>
      </div>
    </div>
  );
}
