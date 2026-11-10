"use client";
import { useState } from "react";
import { api } from "@/components/client-utils";
import { fmtUsd } from "@/components/ui";
import { HOOKS, IG_TOOLS, parseViralRows, type IgTool } from "@/lib/ig-ops-types";

type Run = { id: string; tool: IgTool; title: string; input: Record<string, unknown>; result: Record<string, any>; model: string; created_at: string };
const FIELDS: Record<IgTool, { key: string; label: string; ph: string; rows?: number; type?: "number" }[]> = {
  reel: [
    { key: "idea", label: "릴스 아이디어 (실제 있었던 일·숫자일수록 좋아요)", ph: "예) 닭한마리 집에서 15분 만에. 육수 대신 사골곰탕 팩 써서 시간 반으로 줄임", rows: 4 },
    { key: "seconds", label: "목표 길이(초)", ph: "30", type: "number" },
  ],
  reply: [
    { key: "post", label: "게시물 내용 (짧게)", ph: "예) 닭한마리 레시피 캐러셀, 댓글에 '레시피' 쓰면 DM 보내기로 함", rows: 2 },
    { key: "comments", label: "댓글들 (한 줄에 하나, '아이디: 내용')", ph: "minji: 레시피\nfoodlover: 칼국수 면은 뭐 쓰셨어요?\nshop_ad: 맞팔해요~", rows: 8 },
  ],
  profile: [
    { key: "about", label: "무엇을 하는 계정인지", ph: "예) 집밥 레시피 계정, 블로그(알고키친)로 연결", rows: 2 },
    { key: "text", label: "프로필 내용 붙여넣기 (캡처가 있으면 생략 가능)", ph: "이름 칸, 아이디, 소개글, 링크, 하이라이트 이름…", rows: 4 },
    { key: "handle", label: "아이디", ph: "@algo_kitchen" },
  ],
  plan: [
    { key: "week", label: "주 시작일", ph: "예) 11/17(월)" },
    { key: "offer", label: "무엇을 누구에게", ph: "예) 바쁜 맞벌이 부부에게 30분 집밥 레시피 (블로그·애드포스트 수익)", rows: 2 },
    { key: "themes", label: "알려지고 싶은 주제 3~4개", ph: "예) 한그릇 요리, 제철 반찬, 아이 간식", rows: 2 },
    { key: "happened", label: "이번 주 실제로 있었던 일 (게시물 재료)", ph: "예) 김장 20kg 함 · 닭한마리 글 조회수 1위 · 에어프라이어 실패담", rows: 4 },
    { key: "accounts", label: "보이고 싶은 계정들 (선택)", ph: "@계정1 @계정2 …", rows: 2 },
  ],
  viral: [
    { key: "niche", label: "내 분야", ph: "예) 집밥 레시피", rows: 1 },
    { key: "rows", label: "영상 목록 — 한 줄에 '계정 | 조회수 | 첫 문장(내용)'. 계정마다 3개 이상", ph: "cook_a | 120000 | 이거 하나면 반찬 끝\ncook_a | 15000 | 오늘 저녁 메뉴\ncook_a | 9000 | 간단 계란말이\ncook_b | 3.2만 | 냉장고 털이 3분", rows: 8 },
  ],
};
const TYPE_KO: Record<string, string> = { KEYWORD: "키워드", LEAD: "잠재 고객", SUBSTANCE: "의견·정보", QUESTION: "질문", SUPPORT: "응원", NOISE: "무시", PROOF: "증거", TEACH: "알려주기", OPINION: "의견", STORY: "이야기", OFFER: "제안" };
const hookName = (n: number) => HOOKS.find((h) => h[0] === Number(n))?.[1] ?? "";

async function shrink(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

function Copy({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { alert("복사하지 못했어요."); } }}>{done ? "복사됨 ✓" : label}</button>;
}

function Result({ run }: { run: Run }) {
  const r = run.result ?? {};
  if (run.tool === "reel") {
    const hooks: any[] = r.hooks ?? [];
    const script = (r.beats ?? []).map((b: any) => b.say).join("\n");
    return <div className="stack" style={{ gap: 10 }}>
      {!!r.questions?.filter(Boolean).length && <div className="notice small"><b>더 알려 주면 좋아요</b><ul style={{ margin: "4px 0 0 18px" }}>{r.questions.filter(Boolean).map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
      <b className="small">후킹 3개 (점수 높은 순으로 대본 작성)</b>
      {hooks.map((h, i) => <div key={i} className="card card-pad small" style={{ background: i === r.best ? "var(--accent-soft)" : undefined }}>
        <div className="row between"><span>#{h.formula} {hookName(h.formula)} · <b>{h.score}점</b>{i === r.best ? " · 선택" : ""}</span><Copy text={h.spoken} /></div>
        <div style={{ fontSize: 15, fontWeight: 700, margin: "4px 0" }}>🗣 {h.spoken}</div>
        <div>📺 화면: {h.onScreen}</div><div className="muted tiny">{h.why}</div>
      </div>)}
      <div className="row between"><b className="small">대본 · 약 {r.seconds}초</b><Copy text={script} label="대본 복사" /></div>
      <table className="table small"><thead><tr><th style={{ width: 80 }}>시간</th><th>말(자막)</th><th>화면 글자</th></tr></thead>
        <tbody>{(r.beats ?? []).map((b: any, i: number) => <tr key={i}><td>{b.from}~{b.to}초</td><td>{b.say}</td><td>{b.screen}</td></tr>)}</tbody></table>
      {r.cta && <p className="small">🔚 {r.cta}</p>}
      {r.caption && <div className="stack" style={{ gap: 4 }}><div className="row between"><b className="small">캡션</b><Copy text={r.caption} /></div><p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.caption}</p></div>}
    </div>;
  }
  if (run.tool === "reply") {
    const items: any[] = r.items ?? [];
    return <div className="stack" style={{ gap: 8 }}>
      {r.summary && <p className="small muted" style={{ margin: 0 }}>{r.summary}</p>}
      {items.map((x, i) => <div key={i} className="card card-pad small stack" style={{ gap: 4 }}>
        <div className="row between"><span><span className="chip">{TYPE_KO[x.type] ?? x.type}</span> <b>{x.who}</b> {x.comment}</span>{x.reply && <Copy text={x.reply} label="답글 복사" />}</div>
        {x.reply ? <div>↳ {x.reply}</div> : <div className="muted">↳ 답글 안 달기 (필요하면 숨기기)</div>}
        {x.reelIdea && <div className="tiny" style={{ color: "var(--accent)" }}>💡 {x.reelIdea}</div>}
      </div>)}
    </div>;
  }
  if (run.tool === "profile") {
    const rw = r.rewrites ?? {};
    return <div className="stack" style={{ gap: 10 }}>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{r.total}<span className="small muted"> / 100점</span></div>
      {!!r.top3?.length && <div className="notice small"><b>먼저 고칠 3가지</b><ol style={{ margin: "4px 0 0 18px" }}>{r.top3.map((t: string, i: number) => <li key={i}>{t}</li>)}</ol></div>}
      <table className="table small"><thead><tr><th>항목</th><th style={{ width: 70 }}>점수</th><th>설명</th></tr></thead>
        <tbody>{(r.items ?? []).map((x: any) => <tr key={x.id}><td>{x.label}</td><td><b>{x.score}</b>/{x.max}</td><td className={x.seen ? "" : "muted"}>{x.note}</td></tr>)}</tbody></table>
      {([["name", "이름 칸"], ["bio", "소개글"], ["highlights", "하이라이트 이름"], ["pinned", "고정 게시물 3개"]] as const).map(([k, label]) => !!rw[k]?.length && <div key={k} className="stack" style={{ gap: 4 }}>
        <b className="small">{label}</b>{rw[k].map((t: string, i: number) => <div key={i} className="row between small" style={{ gap: 8 }}><span style={{ whiteSpace: "pre-wrap" }}>{t}</span><Copy text={t} /></div>)}
      </div>)}
    </div>;
  }
  if (run.tool === "plan") {
    const e = r.engage ?? {};
    return <div className="stack" style={{ gap: 10 }}>
      <table className="table small"><thead><tr><th>요일</th><th>시간</th><th>형식</th><th>종류</th><th>후킹</th><th>각도</th></tr></thead>
        <tbody>{(r.days ?? []).map((d: any, i: number) => <tr key={i}><td>{d.day}</td><td>{d.time}</td><td>{d.format}</td><td>{TYPE_KO[d.type] ?? d.type ?? ""}</td><td>{d.formula ? `#${d.formula} ${hookName(d.formula)}` : ""}</td><td>{d.angle}</td></tr>)}</tbody></table>
      {r.stories && <p className="small"><b>스토리</b> {r.stories}</p>}
      <div className="small"><b>매일 20분 소통 (게시 전)</b>
        {([["reach", "노출 5"], ["peers", "동료 3"], ["buyers", "고객 2"]] as const).map(([k, l]) => <div key={k}>· {l}: {(e[k] ?? []).join(", ")}</div>)}</div>
      {r.tip && <p className="small muted">💡 {r.tip}</p>}
    </div>;
  }
  // viral
  return <div className="stack" style={{ gap: 10 }}>
    {r.summary && <div className="notice small">{r.summary}</div>}
    {(r.top ?? []).map((v: any, i: number) => { const a = (r.items ?? []).find((x: any) => Number(x.n) === i + 1) ?? {}; return <div key={i} className="card card-pad small stack" style={{ gap: 4 }}>
      <div><b>{v.multiple}배</b> · @{v.account} (조회 {v.views.toLocaleString()} / 평소 {Math.round(v.median).toLocaleString()}) {a.formula ? `· #${a.formula} ${hookName(a.formula)}` : ""}</div>
      {v.text && <div className="muted">“{v.text}”</div>}{a.why && <div>{a.why}</div>}
      {(a.mine ?? []).map((m: string, k: number) => <div key={k} className="row between" style={{ gap: 8 }}><span>✏️ {m}</span><Copy text={m} /></div>)}
    </div>; })}
    <details><summary className="small">전체 순위 ({(r.ranked ?? []).length}개)</summary>
      <table className="table small"><tbody>{(r.ranked ?? []).map((v: any, i: number) => <tr key={i}><td>{v.multiple}배</td><td>@{v.account}</td><td>{v.views.toLocaleString()}</td><td>{v.text}</td></tr>)}</tbody></table></details>
  </div>;
}

export default function IgOps({ initialRuns, initialVoice }: { initialRuns: Run[]; initialVoice: string }) {
  const [tool, setTool] = useState<IgTool>("reel");
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [form, setForm] = useState<Record<string, string>>({ seconds: "30" });
  const [images, setImages] = useState<string[]>([]);
  const [voice, setVoice] = useState(initialVoice);
  const [voiceMsg, setVoiceMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(initialRuns[0]?.id ?? null);
  const meta = IG_TOOLS.find((t) => t.id === tool)!;
  const mine = runs.filter((r) => r.tool === tool);
  const viralPreview = tool === "viral" ? parseViralRows(form.rows ?? "") : [];

  async function run() {
    setBusy(true); setError("");
    try {
      const est = await api<{ total: number | null; steps: { provider: string; model: string }[] }>(`/api/instagram?estimate=${tool}`);
      if (!confirm(`${meta.label}을(를) 만들까요?\n${est.steps[0]?.provider}/${est.steps[0]?.model}\n예상 비용: ${est.total === null ? "단가 미등록으로 계산할 수 없어요" : fmtUsd(est.total)} (추정치)`)) return;
      const keys = FIELDS[tool].map((f) => f.key);
      const payload = Object.fromEntries(keys.map((k) => [k, form[k] ?? ""]));
      const r = await api<Run>("/api/instagram", "POST", { action: "run", tool, confirm: true, ...payload, images: tool === "profile" ? images : [] });
      setRuns((old) => [r, ...old]); setOpen(r.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function trash(id: string) {
    if (!confirm("이 기록을 휴지통으로 옮길까요?\n휴지통에서 30일 안에 되살릴 수 있어요.")) return;
    try { await api("/api/trash", "POST", { action: "trash", ids: [id] }); setRuns((old) => old.filter((r) => r.id !== id)); } catch (e) { alert((e as Error).message); }
  }

  return <div className="stack" style={{ gap: 14 }}>
    <details className="card card-pad">
      <summary><b>🗣 내 말투</b> <span className="small muted">{voice ? "저장됨 · 모든 도구가 이 말투로 써요" : "아직 없음 — 채우면 대본·답글이 내 말처럼 나와요"}</span></summary>
      <textarea className="textarea" style={{ minHeight: 120, marginTop: 8 }} value={voice} onChange={(e) => { setVoice(e.target.value); setVoiceMsg(""); }} placeholder={"예) 반말 섞인 친근한 존댓말(~해요, ~거든요). 'ㅎㅎ'는 가끔. 과장 X.\n자주 쓰는 말: '진짜 간단해요', '저는 이렇게 해요'\n절대 안 쓰는 말: '꿀팁 대방출', '역대급'\n보는 사람: 퇴근 후 저녁 고민하는 30대 맞벌이"} />
      <div className="row" style={{ marginTop: 6 }}><button className="btn btn-sm" onClick={async () => { try { const r = await api<{ voice: string }>("/api/instagram", "POST", { action: "voice", text: voice }); setVoice(r.voice); setVoiceMsg("저장했어요."); } catch (e) { setVoiceMsg((e as Error).message); } }}>말투 저장</button><span className="small muted">{voiceMsg}</span></div>
    </details>

    <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="tablist">
      {IG_TOOLS.map((t) => <button key={t.id} role="tab" aria-selected={tool === t.id} className={`btn btn-sm ${tool === t.id ? "btn-primary" : ""}`} onClick={() => { setTool(t.id); setError(""); setOpen(runs.find((r) => r.tool === t.id)?.id ?? null); }}>{t.label}</button>)}
    </div>

    <section className="card card-pad stack" style={{ gap: 8 }}>
      <p className="small muted" style={{ margin: 0 }}>{meta.sub}</p>
      {FIELDS[tool].map((f) => <label key={f.key} className="field" style={{ margin: 0 }}>
        <span className="label">{f.label}</span>
        {f.rows ? <textarea className="textarea" style={{ minHeight: f.rows * 24 + 16 }} value={form[f.key] ?? ""} placeholder={f.ph} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          : <input className="input" type={f.type ?? "text"} value={form[f.key] ?? ""} placeholder={f.ph} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
      </label>)}
      {tool === "profile" && <div className="stack" style={{ gap: 6 }}>
        <span className="label">프로필 캡처 (최대 4장: 상단 + 피드 첫 2줄이면 충분)</span>
        <input type="file" accept="image/*" multiple onChange={async (e) => { const files = [...(e.target.files ?? [])].slice(0, 4); setImages(await Promise.all(files.map(shrink))); }} />
        {!!images.length && <div className="row" style={{ gap: 6 }}>{images.map((u, i) => <img key={i} src={u} alt={`캡처 ${i + 1}`} style={{ height: 90, borderRadius: 6, border: "1px solid var(--line)" }} />)}<button className="btn btn-sm btn-ghost" onClick={() => setImages([])}>지우기</button></div>}
      </div>}
      {tool === "viral" && (form.rows ?? "").trim() && <p className="tiny muted" style={{ margin: 0 }}>읽은 영상 {viralPreview.length}개 · 계정 {new Set(viralPreview.map((v) => v.account)).size}개. 계정마다 평소 조회수(중앙값)를 앱이 계산하고, 3배 넘는 것만 AI가 분석해요.</p>}
      <div className="row"><button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? "만드는 중…" : `✨ ${meta.label.replace(/^\S+\s/, "")} 만들기`}</button></div>
      {error && <p role="alert" className="notice notice-bad small">{error}</p>}
    </section>

    {!!mine.length && <section className="stack" style={{ gap: 8 }}>
      <b className="small">기록 {mine.length}개</b>
      {mine.map((r) => <div key={r.id} className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ textAlign: "left", flex: 1, justifyContent: "flex-start" }} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "▼" : "▶"} {r.title || meta.label} <span className="tiny muted">· {new Date(r.created_at).toLocaleString("ko-KR")} · {r.model}</span></button>
          <button className="btn btn-sm btn-ghost" aria-label="휴지통으로" onClick={() => trash(r.id)}>🗑</button>
        </div>
        {open === r.id && <Result run={r} />}
      </div>)}
    </section>}
  </div>;
}
