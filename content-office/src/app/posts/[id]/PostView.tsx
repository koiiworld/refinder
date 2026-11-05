"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PostBundle } from "@/lib/post-bundle";
import type { PostExtras, PostPlan } from "@/lib/posts-types";
import { stageLabel, stageStep } from "@/lib/steps";
import { api, useToast } from "@/components/client-utils";
import { BlogTag, fmtDate, fmtUsd, Steps } from "@/components/ui";
import DocEditor from "@/components/DocEditor";
import BackButton from "@/components/BackButton";
import { HF_IMAGE_MODELS } from "@/lib/hf-models";

type Review = {
  summary: string;
  score: number | null;
  issues: { type: string; severity: string; quote: string; comment: string; suggestion: string; fixed?: boolean }[];
  lastFix?: { at: string; changes: string[] };
  imageChecks?: { index: number; ok: boolean; note: string }[];
  provider: string;
  model: string;
  substitutedFor?: string | null;
  reviewedAt: string;
  imagesSeen?: number;
};

export default function PostView({ initial, higgsfield }: { initial: PostBundle; higgsfield: boolean }) {
  const router = useRouter();
  const [b, setB] = useState<PostBundle>(initial);
  const [toast, setToast] = useToast();
  const p = b.project;
  const plan = p.plan as unknown as PostPlan | null;
  const extras = (p.package as unknown as PostExtras | null) ?? { hashtags: [], images: [] };
  const review = p.review as unknown as Review | null;
  const running = p.status === "running" || b.jobs.length > 0;
  // 본문 편집은 AI가 본문을 바꾸는 동안(글 쓰기·지적 수정)만 잠금. 검수 중이나 이미지 만들기 전에도 직접 고칠 수 있음
  const aiEditing = b.jobs.some((j) => ["write", "fix"].includes(j.type));
  const generating = extras.images.some((im) => im.mediaJobId && !im.url);
  const doc = b.document;
  const title = doc?.title || plan?.selectedTitle || p.title;
  const choosing = !!plan && p.stage === "titles" && !running && p.status !== "error";
  // 제목 입력칸: 서버 제목이 바뀌면(저장·다시 뽑기) 따라감
  const [titleDraft, setTitleDraft] = useState(title);
  useEffect(() => setTitleDraft(title), [title]);

  const refresh = useCallback(async () => {
    try {
      setB(await api<PostBundle>(`/api/posts/${p.id}`));
    } catch {
      /* 다음에 재시도 */
    }
  }, [p.id]);
  useEffect(() => {
    if (!running && !generating) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [running, generating, refresh]);

  async function act(payload: Record<string, unknown>, msg?: string) {
    try {
      setB(await api<PostBundle>(`/api/posts/${p.id}`, "POST", payload));
      if (msg) setToast(msg);
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  }
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setToast(`${what} 복사됨`);
  };

  const current = p.stage === "published" ? 8 : p.stage === "ready" ? 7 : stageStep(p.stage);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
        <BackButton href="/posts" label="진행 현황으로" />
        <div className="row small muted">
          <Link href="/posts">진행 현황</Link> / {b.blog && <BlogTag name={b.blog.name} color={b.blog.color} />} · 키워드 <b>{p.topic}</b>
        </div>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <h1 style={{ fontSize: 20, flex: "1 1 300px" }} className="wrap-any">{title}</h1>
          <span className={`badge ${p.status === "error" ? "badge-bad" : p.stage === "ready" ? "badge-warn" : p.stage === "published" ? "badge-ok" : "badge-accent"}`}>
            {running && <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />} {stageLabel(p.stage, p.status)}
          </span>
        </div>
        <Steps current={current} error={p.status === "error"} />
        {running && <div className="notice small">AI가 {stageLabel(p.stage)} 중입니다. 이 화면을 닫아도 계속 진행됩니다. {p.status_message}</div>}
        {p.status === "error" && (
          <div className="notice notice-bad small stack" style={{ gap: 8 }}>
            <span>{p.status_message}</span>
            <div className="row">
              <button className="btn btn-sm" onClick={() => act({ action: "rerun", step: !plan ? "titles" : !doc?.content_html ? "write" : "review" }, "다시 실행합니다.")}>이어서 다시 실행</button>
            </div>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {/* ③ 제목 */}
        <Section n={3} title="SEO 제목" ai={plan?.ai} right={plan && !running && <button className="btn btn-sm" onClick={() => confirm("제목 후보를 새로 뽑을까요?") && act({ action: "rerun", step: "titles" }, "제목 후보를 다시 뽑습니다.")}>후보 다시 뽑기</button>}>
          {!plan ? (
            <p className="small muted">{running ? "AI가 네이버 연관 키워드 검색량을 보고 제목 후보를 만들고 있습니다…" : "아직 제목이 없습니다."}</p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {choosing && <div className="notice small">후보를 누르거나 &apos;선택한 제목&apos; 칸에 원하는 대로 고친 뒤 <b>이 제목으로 글 쓰기</b>를 누르세요. 칸에 적힌 제목 그대로 글을 씁니다.</div>}
              <TitlePicker plan={plan} current={title} draft={titleDraft} setDraft={setTitleDraft} choosing={choosing} disabled={running} onPick={(payload) => act({ action: "select_title", ...payload }, "제목을 저장했습니다.")} />
              {choosing && (
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={running || !titleDraft.trim()} onClick={() => act({ action: "write", title: titleDraft.trim() }, "글 작성을 시작합니다.")}>
                  이 제목으로 글 쓰기 →
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ④ 글 */}
        <Section n={4} title="글 (해시태그 포함)" ai={extras.writer}>
          {doc?.content_html || (plan && !choosing) ? (
            <div className="stack">
              <DocEditor
                key={p.id}
                projectId={p.id}
                serverDoc={doc}
                locked={aiEditing}
                lockedReason="AI가 본문을 쓰거나 고치는 중이라 편집이 잠깁니다. 끝나면 자동으로 풀립니다."
                connections={b.connections}
                onSaved={() => void refresh()}
              />
              <Hashtags tags={extras.hashtags} disabled={running} onSave={(hashtags) => act({ action: "hashtags", hashtags }, "해시태그를 저장했습니다.")} />
              {doc?.content_html && <EditRequest busy={running} lastEdit={extras.lastEdit ?? null} onRun={(note) => act({ action: "edit_request", note }, "수정 요청사항을 AI가 반영하고 있습니다.")} />}
              {doc?.content_html && !running && <Rewrite onRun={(feedback) => act({ action: "rerun", step: "write", feedback }, "글을 다시 씁니다.")} />}
            </div>
          ) : (
            <p className="small muted">③에서 제목을 고르고 &apos;이 제목으로 글 쓰기&apos;를 누르면 AI가 글을 씁니다.</p>
          )}
        </Section>

        {/* ⑤ 이미지 */}
        <Section n={5} title={extras.images.some((im) => im.kind === "official") ? "이미지 (공식 홈페이지)" : "이미지 (Higgsfield)"}>
          {!extras.images.length ? (
            <p className="small muted">글이 완성되면 AI가 이미지 프롬프트를 만들어 둡니다.</p>
          ) : (
            <div className="stack">
              {extras.images.some((im) => im.kind === "official") ? (
                <p className="small muted">
                  이 블로그는 <b>제조사 공식 홈페이지 이미지</b>를 씁니다. AI가 적어 둔 공식 페이지 주소를 확인(필요하면 수정)하고 &quot;공식 이미지 찾기&quot;를 누른 뒤, 맞는 사진을 골라 &quot;본문에 넣기&quot;를 누르세요. 출처 표기는 사진 아래에 함께 들어갑니다.
                </p>
              ) : (
              <p className="small muted">
                AI가 글 내용에 맞는 이미지 프롬프트를 만들었습니다. <b>생성은 자동으로 하지 않습니다</b>. 필요한 것만 "생성"을 누르세요(Higgsfield 크레딧 차감). 생성되면 "본문에 넣기"로 글의 [이미지 N] 자리에 넣습니다.
                {!higgsfield && " · 지금은 Higgsfield가 연결되지 않아 프롬프트를 복사해서 Higgsfield 사이트에서 만들 수 있습니다."}
              </p>
              )}
              {extras.images.map((im, i) => (
                im.kind === "official" ? (
                  <OfficialImageCard key={i} index={i} im={im} disabled={running} act={act} />
                ) : (
                  <ImageCard key={i} projectId={p.id} index={i} im={im} higgsfield={higgsfield} disabled={running} act={act} copy={copy} />
                )
              ))}
            </div>
          )}
        </Section>

        {/* ⑥ 검수 */}
        <Section
          n={6}
          title="글·이미지 검수"
          ai={review ? { provider: review.provider, model: review.model, substitutedFor: review.substitutedFor ?? null } : undefined}
          right={doc?.content_html && !running && <button className="btn btn-sm" onClick={() => act({ action: "rerun", step: "review" }, "다시 검수합니다.")}>다시 검수</button>}
        >
          {!review ? (
            <p className="small muted">{running ? "글이 완성되면 검수합니다." : "아직 검수 전입니다."}</p>
          ) : (
            <ReviewView
              review={review}
              rereview={p.needs_rereview}
              imagesNow={extras.images.filter((i) => i.url).length}
              busy={running}
              fixing={b.jobs.some((j) => j.type === "fix")}
              reviewing={b.jobs.some((j) => j.type === "review")}
              onFix={(indexes) => act({ action: "fix_issues", indexes }, `지적 ${indexes.length}건을 AI가 고치고 있습니다.`)}
              onRereview={() => act({ action: "rerun", step: "review" }, "다시 검수합니다.")}
            />
          )}
        </Section>

        {/* ⑦ 발행 */}
        <Section n={7} title="발행 (직접)">
          {!doc?.content_html ? (
            <p className="small muted">글이 완성되면 여기서 복사·다운로드해 블로그에 올리세요.</p>
          ) : (
            <Publish
              title={title}
              html={doc.content_html}
              hashtags={extras.hashtags}
              blogUrl={b.blog?.url}
              projectId={p.id}
              published={p.stage === "published"}
              publishedUrl={extras.publishedUrl ?? null}
              publishedAt={extras.publishedAt ?? null}
              disabled={running}
              copy={copy}
              act={act}
            />
          )}
        </Section>
      </div>

      <div className="row" style={{ marginTop: 28, justifyContent: "flex-end" }}>
        <button
          className="btn btn-sm btn-danger"
          onClick={async () => {
            if (!confirm("이 글을 휴지통으로 옮길까요? 휴지통에서 되살리거나 완전히 삭제할 수 있습니다.")) return;
            await api(`/api/posts/${p.id}`, "DELETE");
            router.push("/posts");
            router.refresh();
          }}
        >
          🗑 휴지통으로
        </button>
      </div>
      {toast}
    </div>
  );
}

function Section({ n, title, ai, right, children }: { n: number; title: string; ai?: { provider: string; model: string; substitutedFor: string | null } | null; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16 }}>{"①②③④⑤⑥⑦"[n - 1]} {title}</h2>
        <div className="row">
          {ai && <span className="tiny muted">{ai.provider}/{ai.model}{ai.substitutedFor ? ` · ${ai.substitutedFor} 대신 사용` : ""}</span>}
          {right}
        </div>
      </div>
      <div className="card-pad">{children}</div>
    </section>
  );
}

function TitlePicker({ plan, current, draft, setDraft, choosing, disabled, onPick }: { plan: PostPlan; current: string; draft: string; setDraft: (t: string) => void; choosing: boolean; disabled: boolean; onPick: (p: { index?: number; title?: string }) => void }) {
  const dirty = draft.trim() !== current.trim();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <span className="label">선택한 제목 — 후보를 누르면 여기에 들어오고, 원하는 대로 고칠 수 있어요 (예: 모델명을 상위 모델로)</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ fontWeight: 600 }} placeholder="제목을 직접 입력하거나 아래 후보를 누르세요" value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} aria-label="선택한 제목" />
          {!choosing && dirty && (
            <button className="btn btn-sm btn-primary" disabled={disabled || !draft.trim()} onClick={() => onPick({ title: draft.trim() })}>제목 저장</button>
          )}
        </div>
        <span className="tiny muted">
          {draft.trim().length}자{draft.trim().length > 40 ? " · 40자가 넘으면 검색 결과에서 잘릴 수 있어요" : ""}
          {!choosing && dirty ? " · 저장 전입니다 (본문은 바뀌지 않음)" : ""}
        </span>
      </div>
      {plan.candidates.map((c, i) => (
        <label key={i} className="card card-pad row" style={{ flexWrap: "nowrap", alignItems: "flex-start", cursor: disabled ? "default" : "pointer", borderColor: c.title === draft ? "var(--accent)" : undefined, background: c.title === draft ? "var(--accent-soft)" : undefined, padding: 10 }}>
          <input
            type="radio"
            name="title"
            checked={c.title === draft}
            disabled={disabled}
            onChange={() => {
              setDraft(c.title);
              if (!choosing) onPick({ index: i });
            }}
            style={{ marginTop: 3 }}
          />
          <div>
            <div className="strong small">{c.title} {i === plan.best && <span className="badge badge-accent">AI 추천</span>}</div>
            <div className="tiny muted">{c.reason}</div>
          </div>
        </label>
      ))}
      {plan.bestReason && <p className="tiny muted">AI가 고른 이유: {plan.bestReason}</p>}
      {!!plan.related.length && (
        <div>
          <div className="label">참고한 네이버 연관 키워드 (월간 검색수)</div>
          <div className="row">{plan.related.map((r) => <span key={r.keyword} className="badge">{r.keyword} · {r.total.toLocaleString()}</span>)}</div>
        </div>
      )}
    </div>
  );
}

function Hashtags({ tags, disabled, onSave }: { tags: string[]; disabled: boolean; onSave: (t: string[]) => void }) {
  const [text, setText] = useState(tags.map((t) => "#" + t).join(" "));
  useEffect(() => setText(tags.map((t) => "#" + t).join(" ")), [tags]);
  const dirty = text !== tags.map((t) => "#" + t).join(" ");
  return (
    <div className="field">
      <span className="label">해시태그</span>
      <textarea className="textarea" style={{ minHeight: 56 }} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
      {dirty && (
        <button className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => onSave(text.split(/[\s,]+/).filter(Boolean))}>해시태그 저장</button>
      )}
    </div>
  );
}

function EditRequest({ busy, lastEdit, onRun }: { busy: boolean; lastEdit: { at: string; note: string; changes: string[] } | null; onRun: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  return (
    <div className="card card-pad stack" style={{ gap: 8, background: "var(--panel-2)" }}>
      <span className="label" style={{ margin: 0 }}>✏️ 수정 요청사항 (읽어 보고 고칠 부분을 적으면 AI가 그 부분만 고칩니다)</span>
      <textarea
        className="textarea"
        style={{ minHeight: 80 }}
        placeholder={"예) 재료에 초콜릿 몰드(틀)가 빠졌어요. 재료 목록에 추가하고 만드는 순서에도 몰드에 붓는 단계를 넣어 주세요.\n예) 도입부를 두 문장으로 줄여 주세요."}
        value={note}
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={async () => { if (await onRun(note)) setNote(""); }}>
          {busy ? <><span className="spinner" /> AI 작업 중…</> : "이 내용으로 수정하기"}
        </button>
        <span className="tiny muted">요청과 관계없는 문장·말투·이미지는 그대로 둡니다. 이전 글은 버전 기록에 남아요.</span>
      </div>
      {lastEdit && (
        <div className="notice notice-ok small">
          <b>마지막 반영</b> · {fmtDate(lastEdit.at)} — “{lastEdit.note}”
          {lastEdit.changes.map((c, i) => <div key={i} className="tiny">{c}</div>)}
        </div>
      )}
    </div>
  );
}

function Rewrite({ onRun }: { onRun: (feedback: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fb, setFb] = useState("");
  if (!open) return <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>AI에게 글 다시 쓰게 하기</button>;
  return (
    <div className="card card-pad stack" style={{ background: "var(--panel-2)", gap: 8 }}>
      <textarea className="textarea" placeholder="어떻게 고칠지 적어주세요 (예: 더 짧게, 재료 표 추가, 말투 더 친근하게)" value={fb} onChange={(e) => setFb(e.target.value)} />
      <p className="tiny muted">직접 고친 글이 있으면 덮어쓰지 않고 'AI 제안'으로 보관되어 비교 후 적용할 수 있습니다.</p>
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={!fb.trim()} onClick={() => { onRun(fb); setOpen(false); setFb(""); }}>다시 쓰기</button>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>취소</button>
      </div>
    </div>
  );
}

function ImageCard({ projectId, index, im, higgsfield, disabled, act, copy }: { projectId: string; index: number; im: PostExtras["images"][number]; higgsfield: boolean; disabled: boolean; act: (p: Record<string, unknown>, m?: string) => Promise<boolean>; copy: (t: string, w: string) => void }) {
  const [prompt, setPrompt] = useState(im.prompt);
  useEffect(() => setPrompt(im.prompt), [im.prompt]);
  const generating = !!im.mediaJobId && !im.url;
  // 모델: 이 이미지에서 마지막으로 쓴 것 → 이 기기에서 마지막으로 고른 것 → SOUL
  const [model, setModel] = useState(() => {
    if (im.model) return im.model;
    try {
      return localStorage.getItem("hf-image-model") || "soul-standard";
    } catch {
      return "soul-standard";
    }
  });
  const [price, setPrice] = useState<{ model: string; aspect: string; usd: number | null } | null>(null);
  useEffect(() => {
    if (!higgsfield) return;
    let alive = true;
    api<{ usd: number }>(`/api/posts/${projectId}`, "POST", { action: "estimate_image", index, model })
      .then((r) => alive && setPrice({ model, aspect: im.aspect, usd: r.usd }))
      .catch(() => alive && setPrice({ model, aspect: im.aspect, usd: null }));
    return () => {
      alive = false;
    };
  }, [model, im.aspect, index, projectId, higgsfield]);
  const pickModel = (m: string) => {
    setModel(m);
    try {
      localStorage.setItem("hf-image-model", m);
    } catch {
      /* 저장 못 해도 동작 */
    }
  };
  const label = HF_IMAGE_MODELS.find((m) => m.id === model)?.label ?? model;
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between">
        <span className="strong small">이미지 {index + 1} · {im.alt}</span>
        <div className="row" style={{ gap: 4 }}>
          <select className="select" style={{ width: 90 }} value={im.aspect} disabled={disabled || generating} onChange={(e) => act({ action: "image_prompt", index, aspect: e.target.value })} aria-label="비율">
            {["1:1", "4:3", "3:4", "2:3", "3:2", "16:9", "9:16"].map((a) => <option key={a}>{a}</option>)}
          </select>
          {im.inserted && <span className="badge badge-ok">본문에 넣음</span>}
        </div>
      </div>
      <textarea className="textarea mono" style={{ minHeight: 64, fontSize: 12 }} value={prompt} disabled={disabled || generating} onChange={(e) => setPrompt(e.target.value)} aria-label="이미지 프롬프트" />
      <div className="row">
        {prompt !== im.prompt && <button className="btn btn-sm" onClick={() => act({ action: "image_prompt", index, prompt }, "프롬프트를 저장했습니다.")}>프롬프트 저장</button>}
        <button className="btn btn-sm" onClick={() => copy(prompt, "프롬프트")}>프롬프트 복사</button>
        {higgsfield && (
          <select className="select" style={{ width: 230 }} value={model} disabled={disabled || generating} onChange={(e) => pickModel(e.target.value)} aria-label="Higgsfield 모델">
            {HF_IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
            ))}
          </select>
        )}
        {higgsfield && (
          <button
            className="btn btn-sm btn-primary"
            disabled={disabled || generating || prompt !== im.prompt}
            onClick={() =>
              confirm(`이미지 ${index + 1}을 ${label}(으)로 생성할까요?${price?.model === model && price.usd != null ? `\n예상 비용: ${fmtUsd(price.usd)}` : ""}\nHiggsfield 크레딧이 차감됩니다.`) &&
              act({ action: "generate_image", index, model }, "이미지 생성을 시작했습니다.")
            }
          >
            {generating ? <><span className="spinner" /> 생성 중…</> : im.url ? "다시 생성" : "Higgsfield로 생성"}
          </button>
        )}
        {im.url && <button className="btn btn-sm btn-ok" disabled={disabled} onClick={() => act({ action: "insert_image", index }, "본문에 넣었습니다.")}>{im.inserted ? "다시 넣기" : "본문에 넣기"}</button>}
      </div>
      {higgsfield && (
        <div className="tiny muted">
          {price?.model === model ? (price.usd != null ? `예상 비용 ${fmtUsd(price.usd)} / 1장 (Higgsfield 견적, ${im.aspect})` : "예상 비용을 불러오지 못했습니다") : "예상 비용 확인 중…"}
          {im.url && im.model && ` · 지금 이미지: ${HF_IMAGE_MODELS.find((m) => m.id === im.model)?.label ?? im.model}`}
        </div>
      )}
      {im.url && (
        <div className="stack" style={{ gap: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.url} alt={im.alt} style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, alignSelf: "flex-start" }} />
          <span className="tiny muted">Higgsfield 서버에 약 7일 보관됩니다. 발행 전에 블로그에 올리거나 내려받아 두세요. <a href={im.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>원본 열기</a></span>
        </div>
      )}
    </div>
  );
}

function OfficialImageCard({ index, im, disabled, act }: { index: number; im: PostExtras["images"][number]; disabled: boolean; act: (p: Record<string, unknown>, m?: string) => Promise<boolean> }) {
  const [pageUrl, setPageUrl] = useState(im.pageUrl ?? "");
  const [credit, setCredit] = useState(im.credit ?? "");
  const [direct, setDirect] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPageUrl(im.pageUrl ?? ""), [im.pageUrl]);
  useEffect(() => setCredit(im.credit ?? ""), [im.credit]);
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${im.product || im.alt} 공식 홈페이지`)}`;
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row between">
        <span className="strong small">이미지 {index + 1} · {im.product || im.alt}</span>
        {im.inserted && <span className="badge badge-ok">본문에 넣음</span>}
      </div>
      <div className="tiny muted">{im.alt}</div>
      <div className="field">
        <span className="label">공식 페이지 주소 {im.pageUrl ? "(AI 추정 — 맞는지 확인하세요)" : ""}</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" inputMode="url" placeholder="https://www.apple.com/kr/..." value={pageUrl} disabled={disabled || busy} onChange={(e) => setPageUrl(e.target.value)} />
          <button
            className="btn btn-sm btn-primary"
            disabled={disabled || busy || !pageUrl.trim()}
            onClick={async () => {
              setBusy(true);
              await act({ action: "find_images", index, pageUrl, credit }, "공식 페이지에서 이미지를 찾았습니다.");
              setBusy(false);
            }}
          >
            {busy ? <span className="spinner" /> : "공식 이미지 찾기"}
          </button>
        </div>
        <a className="tiny" href={search} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>공식 페이지 검색해 보기 ↗</a>
      </div>
      {!!im.candidates?.length && (
        <div>
          <div className="label">사진을 눌러 고르세요 ({im.candidates.length}개)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {im.candidates.map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => act({ action: "pick_image", index, url: c, credit }, "이미지를 골랐습니다.")}
                style={{ padding: 0, border: c === im.url ? "3px solid var(--accent)" : "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "#fff", cursor: "pointer", aspectRatio: "1 / 1" }}
                aria-label="이 이미지 고르기"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span className="label">또는 이미지 주소 직접 넣기 (공식 사이트에서 이미지 우클릭 → 이미지 주소 복사)</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" inputMode="url" placeholder="https://.../product.jpg" value={direct} disabled={disabled} onChange={(e) => setDirect(e.target.value)} />
          <button className="btn btn-sm" disabled={disabled || !direct.trim()} onClick={async () => { if (await act({ action: "pick_image", index, url: direct, credit }, "이미지를 골랐습니다.")) setDirect(""); }}>
            사용
          </button>
        </div>
      </div>
      <div className="field">
        <span className="label">출처 표기 (사진 아래에 들어감)</span>
        <input className="input" placeholder="출처: Apple" value={credit} disabled={disabled} onChange={(e) => setCredit(e.target.value)} onBlur={() => credit !== (im.credit ?? "") && act({ action: "image_credit", index, credit })} />
      </div>
      {im.url && (
        <div className="stack" style={{ gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.url} alt={im.alt} referrerPolicy="no-referrer" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, alignSelf: "flex-start", background: "#fff" }} />
          <div className="row">
            <button className="btn btn-sm btn-ok" disabled={disabled} onClick={() => act({ action: "insert_image", index }, "본문에 넣었습니다.")}>{im.inserted ? "다시 넣기" : "본문에 넣기"}</button>
            <a className="btn btn-sm" href={im.url} target="_blank" rel="noreferrer">원본 열기 ↗</a>
          </div>
          <span className="tiny muted">공식 사이트 이미지를 그대로 연결합니다. 블로그에 올릴 때는 이미지를 저장해 직접 올리는 것이 안전합니다(사이트가 주소를 바꾸면 이미지가 안 보일 수 있음).</span>
        </div>
      )}
    </div>
  );
}

function ReviewView({ review, rereview, imagesNow, busy, fixing, reviewing, onFix, onRereview }: { review: Review; rereview: boolean; imagesNow: number; busy: boolean; fixing: boolean; reviewing: boolean; onFix: (indexes: number[]) => void; onRereview: () => void }) {
  const sev: Record<string, string> = { high: "badge-bad", medium: "badge-warn", low: "" };
  const open = review.issues.map((it, i) => (it.fixed ? -1 : i)).filter((i) => i >= 0);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <button className="btn btn-sm btn-primary" disabled={busy || !open.length} onClick={() => confirm(`남은 지적 ${open.length}건을 AI가 본문에 반영할까요?\n지적과 관계없는 부분은 그대로 둡니다.`) && onFix(open)}>
          {fixing ? <><span className="spinner" /> AI가 고치는 중…</> : `✏️ 지적 모두 AI로 수정 (${open.length})`}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={onRereview}>
          {reviewing ? <><span className="spinner" /> 검수 중…</> : "🔄 다시 검수"}
        </button>
      </div>
      {review.lastFix?.changes?.length ? (
        <div className="notice notice-ok small">
          <b>AI가 고친 내용</b> · {fmtDate(review.lastFix.at)}
          {review.lastFix.changes.map((c, i) => <div key={i} className="tiny">{c}</div>)}
          <div className="tiny">고친 글이 괜찮은지 &apos;다시 검수&apos;로 확인해 보세요. 이전 글은 버전 기록에 남아 있습니다.</div>
        </div>
      ) : null}
      {(rereview || imagesNow > (review.imagesSeen ?? 0)) && (
        <div className="notice notice-warn small">{rereview ? "검수 뒤에 글을 고쳤어요." : "검수 뒤에 이미지를 새로 만들었어요."} '다시 검수'를 누르면 최신 글·이미지로 검수합니다.</div>
      )}
      <div className="row between">
        <p className="small" style={{ flex: 1 }}>{review.summary}</p>
        {review.score !== null && <span className="badge badge-accent">점수 {review.score}/100</span>}
      </div>
      {review.issues.map((it, i) => (
        <div key={i} className="card card-pad stack" style={{ gap: 4, padding: 10 }}>
          <div className="row"><span className={`badge ${sev[it.severity] ?? ""}`}>{it.severity}</span><span className="badge">{it.type}</span></div>
          {it.quote && <div className="tiny muted">“{it.quote}”</div>}
          <div className="small">{it.comment}</div>
          {it.suggestion && <div className="small" style={{ color: "var(--ok)" }}>→ {it.suggestion}</div>}
          <div className="row" style={{ marginTop: 4 }}>
            {it.fixed ? (
              <span className="badge badge-ok">✅ AI가 수정함 · 다시 검수로 확인</span>
            ) : (
              <button className="btn btn-sm" disabled={busy} onClick={() => onFix([i])}>✏️ 수정 요청</button>
            )}
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onRereview}>🔄 다시 검수</button>
          </div>
        </div>
      ))}
      {!review.issues.length && <p className="small muted">지적 사항 없음</p>}
      {!!review.imageChecks?.length && (
        <div>
          <div className="label">이미지 확인 ({review.imagesSeen ?? 0}장 직접 확인)</div>
          {review.imageChecks.map((c, i) => <div key={i} className="small">{c.ok ? "✅" : "⚠️"} 이미지 {c.index}: {c.note}</div>)}
        </div>
      )}
      <p className="tiny muted">AI는 웹 검색 없이 검수합니다. '확인 필요' 항목은 직접 확인하세요. · {fmtDate(review.reviewedAt)}</p>
    </div>
  );
}

function Publish(props: { title: string; html: string; hashtags: string[]; blogUrl?: string; projectId: string; published: boolean; publishedUrl: string | null; publishedAt: string | null; disabled: boolean; copy: (t: string, w: string) => void; act: (p: Record<string, unknown>, m?: string) => Promise<boolean> }) {
  const [url, setUrl] = useState(props.publishedUrl ?? "");
  const tags = props.hashtags.map((t) => "#" + t).join(" ");
  const base = `/api/projects/${props.projectId}/export`;
  const placeholders = (props.html.match(/\[이미지\s*\d+[^\]]*\]/g) ?? []).length;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {placeholders > 0 && <div className="notice notice-warn small">본문에 아직 이미지가 안 들어간 자리 {placeholders}곳이 있어요. ⑤에서 이미지를 넣거나 블로그 편집기에서 직접 넣으세요.</div>}
      <div className="row">
        <button className="btn" onClick={() => props.copy(props.title, "제목")}>제목 복사</button>
        <button className="btn" onClick={() => props.copy(props.html, "본문(HTML)")}>본문 복사</button>
        <button className="btn" onClick={() => props.copy(tags, "해시태그")}>해시태그 복사</button>
        <a className="btn" href={`${base}?format=html`}>HTML 다운로드</a>
        <a className="btn" href={`${base}?format=md`}>마크다운 다운로드</a>
        {props.blogUrl && <a className="btn" href={props.blogUrl} target="_blank" rel="noreferrer">내 블로그 열기 ↗</a>}
      </div>
      <p className="tiny muted">네이버 블로그·티스토리는 자동 발행 API가 없어 직접 붙여 넣어 발행합니다. 본문 복사 후 블로그 글쓰기 화면에 붙여 넣으세요.</p>
      {props.published ? (
        <div className="notice notice-ok small row between">
          <span>✅ 발행 완료 {props.publishedAt && `· ${fmtDate(props.publishedAt)}`} {props.publishedUrl && <a href={props.publishedUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>글 보기</a>}</span>
          <button className="btn btn-sm" onClick={() => props.act({ action: "unpublish" }, "발행 완료를 취소했습니다.")}>발행 취소 표시</button>
        </div>
      ) : (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" placeholder="발행한 글 주소 (선택)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-ok" disabled={props.disabled} onClick={() => props.act({ action: "publish", url }, "발행 완료로 표시했습니다.")}>⑦ 발행 완료</button>
        </div>
      )}
    </div>
  );
}
