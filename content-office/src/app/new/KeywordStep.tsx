"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeywordPick } from "@/lib/keywords";
import { api, useToast } from "@/components/client-utils";
import { Steps } from "@/components/ui";

type BlogLite = { id: string; name: string; color: string; category: string };
type Sources = { ai: boolean; naverAd: boolean; datalab: boolean; youtube: boolean };

const vol = (p: KeywordPick) => (p.volume ? p.volume.total : -1);
const fmtVol = (p: KeywordPick) => (!p.volume ? "-" : p.volume.total === 0 && p.volume.lt10 ? "10 미만" : p.volume.total.toLocaleString());
const trendIcon = (p: KeywordPick) => (!p.trend ? "" : p.trend.dir === "up" ? "▲ 오름" : p.trend.dir === "down" ? "▼ 내림" : "― 보합");

export default function KeywordStep({ blogs, sources }: { blogs: BlogLite[]; sources: Sources }) {
  const router = useRouter();
  const [blogId, setBlogId] = useState(blogs[0]?.id ?? "");
  const [picks, setPicks] = useState<KeywordPick[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  // 트렌드 뷰어 '글감으로'에서 넘어오면 방향 칸을 채워 둠
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("hint");
    if (h) setHint(h);
  }, []);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState<"" | "recommend" | "create" | "add">("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useToast();
  const [showTrend, setShowTrend] = useState(false);
  const [showBench, setShowBench] = useState(false);
  const blog = blogs.find((b) => b.id === blogId);

  const load = useCallback(async () => {
    if (blogId) setPicks(await api<KeywordPick[]>(`/api/keywords?blogId=${blogId}`));
  }, [blogId]);
  useEffect(() => {
    setSel([]);
    void load();
  }, [load]);

  const fresh = useMemo(() => picks.filter((p) => p.status === "new").sort((a, b) => vol(b) - vol(a)), [picks]);
  const used = picks.filter((p) => p.status === "used");

  async function recommend() {
    setBusy("recommend");
    setErr("");
    try {
      const r = await api<{ count: number; provider: string; model: string; substitutedFor: string | null }>("/api/keywords", "POST", { action: "recommend", blogId, hint });
      setToast(`키워드 ${r.count}개를 추천했습니다 (${r.provider}${r.substitutedFor ? ` · ${r.substitutedFor} 대신` : ""})`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }

  async function create() {
    setBusy("create");
    setErr("");
    try {
      const r = await api<{ ids: string[] }>("/api/posts", "POST", { blogId, pickIds: sel });
      router.push(r.ids[0] ? `/posts/${r.ids[0]}` : "/posts");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Steps current={fresh.length ? 2 : 1} />

      <div className="row">
        {blogs.map((b) => (
          <button key={b.id} className={`btn ${blogId === b.id ? "btn-primary" : ""}`} onClick={() => setBlogId(b.id)}>
            <span className="blog-dot" style={{ background: b.color }} /> {b.name}
          </button>
        ))}
      </div>

      {/* ① 키워드 추천 */}
      <section className="card card-pad stack">
        <div className="row between">
          <h2 style={{ fontSize: 16 }}>① 키워드 추천 <span className="small muted">· {blog?.name}</span></h2>
          <div className="row tiny">
            <span className={`badge ${sources.naverAd ? "badge-ok" : ""}`}>네이버 검색량 {sources.naverAd ? "✓" : "미연결"}</span>
            <span className={`badge ${sources.datalab ? "badge-ok" : ""}`}>네이버 추세 {sources.datalab ? "✓" : "미연결"}</span>
            <span className={`badge ${sources.youtube ? "badge-ok" : ""}`}>유튜브 트렌드 {sources.youtube ? "✓" : "미연결"}</span>
            <span className="badge badge-ok">시즌 달력 ✓</span>
          </div>
        </div>
        <p className="small muted">AI가 블로그 분야·다가오는 시즌·유튜브 인기 주제·네이버 유입 트렌드를 보고 키워드를 추천하고, 네이버 실제 검색량과 연관 키워드를 붙여 검색량 순으로 보여줍니다.</p>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" placeholder="원하는 방향 (선택) 예: 겨울 집밥, 초보자용, 아이 반찬" value={hint} onChange={(e) => setHint(e.target.value)} />
          <button className="btn btn-primary" disabled={!!busy || !sources.ai} onClick={recommend}>
            {busy === "recommend" ? <><span className="spinner" /> 추천 중… (30초 정도)</> : "AI 키워드 추천"}
          </button>
        </div>
        {!sources.ai && <div className="notice notice-warn small">AI가 연결되지 않아 추천할 수 없습니다. 설정에서 AI 키를 넣거나 아래에 키워드를 직접 입력하세요.</div>}
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowTrend(!showTrend)}>
          {showTrend ? "▾" : "▸"} 네이버 크리에이터 어드바이저 유입 트렌드 붙여넣기 (선택)
        </button>
        {showTrend && <CreatorPaste blogId={blogId} onDone={(m) => setToast(m)} />}
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowBench(!showBench)}>
          {showBench ? "▾" : "▸"} 🔍 인기 글 분석해서 내 블로그에 적용 (크리에이터 어드바이저 인기 콘텐츠 등)
        </button>
        {showBench && <Benchmark key={blogId} blogId={blogId} onAdded={async (m) => { setToast(m); await load(); }} />}
      </section>

      {/* ② 키워드 선택 */}
      <section className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 16 }}>② 쓸 키워드 고르기 <span className="small muted">({fresh.length}개 중 {sel.length}개 선택)</span></h2>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" style={{ width: 200 }} placeholder="키워드 직접 추가" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && own.trim() && (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click()} />
            <button
              className="btn btn-sm"
              disabled={!own.trim() || !!busy}
              onClick={async () => {
                setBusy("add");
                try {
                  await api("/api/keywords", "POST", { action: "add", blogId, keyword: own });
                  setOwn("");
                  await load();
                } catch (e) {
                  setErr((e as Error).message);
                }
                setBusy("");
              }}
            >
              추가
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" aria-label="모두 선택" checked={!!fresh.length && sel.length === fresh.length} onChange={(e) => setSel(e.target.checked ? fresh.map((p) => p.id) : [])} />
                </th>
                <th>키워드</th>
                <th style={{ textAlign: "right" }}>월간 검색수</th>
                <th>경쟁</th>
                <th>최근 추세</th>
                <th>추천 이유</th>
              </tr>
            </thead>
            <tbody>
              {fresh.map((p) => (
                <tr key={p.id} onClick={() => setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id])} style={{ cursor: "pointer", background: sel.includes(p.id) ? "var(--accent-soft)" : undefined }}>
                  <td><input type="checkbox" checked={sel.includes(p.id)} readOnly aria-label={`${p.keyword} 선택`} /></td>
                  <td>
                    <span className="strong">{p.keyword}</span>{" "}
                    {p.origin === "naver_related" && <span className="badge">네이버 연관</span>}
                    {p.origin === "user" && <span className="badge">직접</span>}
                    {p.season && <span className="badge badge-warn">{p.season}</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtVol(p)}</td>
                  <td>{p.volume?.compIdx ?? "-"}</td>
                  <td style={{ color: p.trend?.dir === "up" ? "var(--ok)" : p.trend?.dir === "down" ? "var(--bad)" : "var(--muted)" }}>{trendIcon(p) || "-"}</td>
                  <td className="wrap small muted">{p.reason}</td>
                </tr>
              ))}
              {!fresh.length && (
                <tr>
                  <td colSpan={6} className="empty">위에서 <b>AI 키워드 추천</b>을 누르거나 키워드를 직접 추가하세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny muted card-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
          검색수: 네이버 검색광고 키워드 도구(최근 30일, PC+모바일) · 추세: 네이버 데이터랩 최근 달 vs 이전 두 달 · 데이터가 없으면 '-'로 둡니다(지어내지 않음).
        </p>
        <div className="sticky-actions row between">
          <button
            className="btn btn-sm btn-ghost"
            disabled={!sel.length}
            onClick={async () => {
              await api("/api/keywords", "POST", { action: "dismiss", blogId, ids: sel });
              setSel([]);
              await load();
            }}
          >
            선택 항목 목록에서 빼기
          </button>
          <button className="btn btn-primary" disabled={!sel.length || !!busy} onClick={create}>
            {busy === "create" ? <span className="spinner" /> : `선택한 ${sel.length}개 키워드로 제목 뽑기 →`}
          </button>
        </div>
      </section>
      {err && <div className="notice notice-bad small">{err}</div>}

      {!!used.length && (
        <details className="card card-pad">
          <summary className="small muted" style={{ cursor: "pointer" }}>이미 글로 만든 키워드 ({used.length})</summary>
          <div className="row" style={{ marginTop: 8 }}>
            {used.map((p) => (
              <a key={p.id} className="badge" href={p.project_id ? `/posts/${p.project_id}` : "#"}>{p.keyword}</a>
            ))}
          </div>
        </details>
      )}
      {toast}
    </div>
  );
}

function CreatorPaste({ blogId, onDone }: { blogId: string; onDone: (m: string) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function readImages(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    if (!imgs.length) return;
    setErr("");
    setNote("");
    setReading(true);
    try {
      const images = await Promise.all(imgs.map((f) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); })));
      const r = await api<{ text: string; provider: string; model: string }>("/api/research/creator/image", "POST", { blogId, images });
      if (!r.text) setErr("캡처에서 검색어 목록을 찾지 못했습니다. 유입 검색어 목록이 보이게 다시 캡처해 주세요.");
      else {
        setText((t) => (t.trim() ? `${t.trim()}\n${r.text}` : r.text));
        setNote(`캡처 ${imgs.length}장에서 읽었습니다 (${r.provider}/${r.model}). 틀린 글자가 있으면 고친 뒤 '저장'을 누르세요.`);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setReading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 8 }}>
      <p className="tiny muted">
        <a href="https://creator-advisor.naver.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>크리에이터 어드바이저 ↗</a> 트렌드·유입 검색어 화면을 <b>캡처해서 올리거나</b>(여기에 붙여넣기 ⌘V도 됨), 목록을 복사해 붙여 넣으세요. 다음 키워드 추천부터 14일간 반영합니다.
      </p>
      <div
        className="card"
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void readImages(Array.from(e.dataTransfer.files)); }}
        style={{ borderStyle: "dashed", padding: 14, textAlign: "center", cursor: "pointer", background: "var(--panel)" }}
      >
        {reading ? <span className="small"><span className="spinner" /> AI가 캡처에서 검색어를 읽는 중…</span> : <span className="small">📷 캡처 이미지를 끌어다 놓거나 <b style={{ color: "var(--accent)" }}>눌러서 선택</b> (최대 4장)</span>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void readImages(Array.from(e.target.files))} />
      </div>
      <textarea
        className="textarea"
        placeholder={"1 김장 양념 비율\n2 절임배추 ▲3\n3 굴보쌈 NEW"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => f.type.startsWith("image/"))) {
            e.preventDefault();
            void readImages(files);
          }
        }}
      />
      {note && <div className="notice notice-ok small">{note}</div>}
      {err && <div className="notice notice-bad small">{err}</div>}
      <button
        className="btn btn-sm"
        style={{ alignSelf: "flex-start" }}
        disabled={!text.trim() || reading}
        onClick={async () => {
          setErr("");
          try {
            const r = await api<{ count: number }>("/api/research/creator", "POST", { blogId, text });
            setText("");
            setNote("");
            onDone(`유입 트렌드 ${r.count}개를 저장했습니다. 다음 추천에 반영됩니다.`);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        저장
      </button>
    </div>
  );
}

type BenchResult = {
  fetched: { url: string; title: string; stats: { chars: number; headings: number; images: number; lists: number; tables: number }; error?: string }[];
  analysis: {
    posts: { title: string; titlePattern: string; hook: string; structure: string; whyPopular: string; keywords: string[] }[];
    common: string[];
    apply: { titleIdeas: { title: string; keyword: string; reason: string }[]; keywords: { keyword: string; reason: string }[]; tips: string[] };
  };
  volumes: Record<string, number | null>;
  ai: { provider: string; model: string };
  at: string;
};

function Benchmark({ blogId, onAdded }: { blogId: string; onAdded: (m: string) => Promise<void> }) {
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [r, setR] = useState<BenchResult | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    api<BenchResult | null>(`/api/research/benchmark?blogId=${blogId}`).then((x) => x && setR(x)).catch(() => {});
  }, [blogId]);

  async function analyze() {
    setBusy(true);
    setErr("");
    try {
      setR(await api<BenchResult>("/api/research/benchmark", "POST", { blogId, urls: urls.split(/\s+/).filter(Boolean) }));
      setAdded([]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  async function addKeyword(k: string) {
    try {
      await api("/api/keywords", "POST", { action: "add", blogId, keyword: k });
      setAdded((a) => [...a, k]);
      await onAdded(`"${k}"를 ② 키워드 목록에 추가했습니다.`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const vol = (k: string) => (r?.volumes?.[k] != null ? `월 ${Number(r.volumes[k]).toLocaleString("ko-KR")}` : "");

  return (
    <div className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 10 }}>
      <p className="tiny muted" style={{ margin: 0 }}>
        잘 되는 글의 주소를 한 줄에 하나씩 넣으세요 (네이버 블로그·티스토리 공개 글, 최대 5개). AI가 제목 공식·도입·구성·인기 이유를 분석하고, 이 블로그에 맞는 제목·키워드·작성 팁을 제안합니다. 내용은 베끼지 않고 <b>방식만</b> 가져옵니다.
      </p>
      <textarea className="textarea" placeholder={"https://blog.naver.com/아이디/글번호\nhttps://blog.naver.com/아이디/글번호"} value={urls} disabled={busy} onChange={(e) => setUrls(e.target.value)} />
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={busy || !urls.trim()} onClick={analyze}>{busy ? <><span className="spinner" /> 글을 읽고 분석하는 중… (30초~1분)</> : "분석하기"}</button>
        <span className="tiny muted">AI 비용이 조금 듭니다 (키워드 추천 담당 AI)</span>
      </div>
      {err && <div className="notice notice-bad small" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}
      {r && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="tiny muted">{fmtWhen(r.at)} 분석 · {r.ai.provider}/{r.ai.model}</div>

          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b className="small">✨ 이 블로그에 적용할 제목 아이디어</b>
            {r.analysis.apply.titleIdeas.map((t, i) => (
              <div key={i} className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 8, borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small strong">{t.title}</div>
                  <div className="tiny muted">{t.reason}</div>
                </div>
                {t.keyword && (
                  <button className="btn btn-sm" style={{ flexShrink: 0 }} disabled={added.includes(t.keyword)} onClick={() => addKeyword(t.keyword)} title="② 키워드 목록에 추가">
                    {added.includes(t.keyword) ? "추가됨" : `+ ${t.keyword}`} {vol(t.keyword) && <span className="tiny muted">{vol(t.keyword)}</span>}
                  </button>
                )}
              </div>
            ))}
          </div>

          {!!r.analysis.apply.keywords.length && (
            <div className="card card-pad stack" style={{ gap: 6 }}>
              <b className="small">🔑 노려 볼 키워드 <span className="tiny muted">(누르면 ② 목록에 추가 · 월간 검색수는 네이버 실제 값)</span></b>
              <div className="row" style={{ gap: 6 }}>
                {r.analysis.apply.keywords.map((k) => (
                  <button key={k.keyword} className="btn btn-sm" disabled={added.includes(k.keyword)} onClick={() => addKeyword(k.keyword)} title={k.reason}>
                    {added.includes(k.keyword) ? "✓ " : "+ "}{k.keyword} {vol(k.keyword) && <span className="tiny muted">{vol(k.keyword)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!!r.analysis.apply.tips.length && (
            <div className="card card-pad stack" style={{ gap: 4 }}>
              <b className="small">📝 글 쓸 때 따라 할 팁</b>
              {r.analysis.apply.tips.map((t, i) => <div key={i} className="small">• {t}</div>)}
              <div className="tiny muted">글을 쓴 뒤 ④의 &apos;수정 요청사항&apos;에 붙여 넣으면 그대로 반영할 수 있어요.</div>
            </div>
          )}

          {!!r.analysis.common.length && (
            <div className="card card-pad stack" style={{ gap: 4 }}>
              <b className="small">📊 인기 글 공통 패턴</b>
              {r.analysis.common.map((c, i) => <div key={i} className="small">• {c}</div>)}
            </div>
          )}

          <details className="fold">
            <summary className="small" style={{ color: "var(--accent)", cursor: "pointer" }}>글별 분석 보기 ({r.fetched.length}개)</summary>
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              {r.fetched.map((f, i) => {
                const a = r.analysis.posts[r.fetched.filter((x, j) => j < i && !x.error).length];
                return (
                  <div key={f.url} className="card card-pad stack" style={{ gap: 4 }}>
                    <a href={f.url} target="_blank" rel="noreferrer" className="small strong" style={{ color: "var(--accent)" }}>{f.title || f.url} ↗</a>
                    {f.error ? (
                      <div className="tiny" style={{ color: "var(--bad)" }}>읽지 못함: {f.error}</div>
                    ) : (
                      <>
                        <div className="tiny muted">본문 {f.stats.chars.toLocaleString()}자 · 소제목 {f.stats.headings}개 · 사진 {f.stats.images}장 · 목록 {f.stats.lists}줄 · 표 {f.stats.tables}개</div>
                        {a && (
                          <>
                            <div className="small"><b>제목 공식</b> {a.titlePattern}</div>
                            <div className="small"><b>도입</b> {a.hook}</div>
                            <div className="small"><b>구성</b> {a.structure}</div>
                            <div className="small"><b>인기 이유</b> {a.whyPopular}</div>
                            {!!a.keywords?.length && <div className="tiny muted">노리는 키워드: {a.keywords.join(", ")}</div>}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
