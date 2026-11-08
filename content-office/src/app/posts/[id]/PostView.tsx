"use client";

import TitleRulesEditor from "@/components/TitleRulesEditor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PostBundle } from "@/lib/post-bundle";
import type { PostExtras, PostOutline, PostPlan } from "@/lib/posts-types";
import { stageLabel, stageStep } from "@/lib/steps";
import { placeholderNumbers, readiness, READY_LABEL, type Readiness } from "@/lib/readiness";
import { api, Modal, useToast } from "@/components/client-utils";
import { BlogTag, fmtDate, fmtUsd, Steps } from "@/components/ui";
import DocEditor from "@/components/DocEditor";
import BackButton from "@/components/BackButton";
import { IMAGE_MODELS, IMAGE_PROVIDER_NAMES, imageModel } from "@/lib/image-models";
import RefPicker from "@/components/RefPicker";

type Review = {
  summary: string;
  score: number | null;
  issues: { type: string; severity: string; quote: string; comment: string; suggestion: string; fixed?: boolean; userNote?: string }[];
  lastFix?: { at: string; changes: string[]; general?: string };
  generalNote?: string;
  imageChecks?: { index: number; ok: boolean; note: string }[];
  provider: string;
  model: string;
  substitutedFor?: string | null;
  reviewedAt: string;
  imagesSeen?: number;
};

type KitInfo = { refs: string[]; style: string; soulId: string | null; on: boolean };
type SoulInfo = { id: string; name: string; version: string };

export default function PostView({ initial, higgsfield, kit, souls = [] }: { initial: PostBundle; higgsfield: boolean; kit?: KitInfo; souls?: SoulInfo[] }) {
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
  const imageProviders: Record<string, boolean> = {
    higgsfield,
    openai: !!b.connections.find((c) => c.provider === "openai")?.connected,
    google: !!b.connections.find((c) => c.provider === "google-image")?.connected,
  };
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

  const [replanning, setReplanning] = useState(false);
  async function act(payload: Record<string, unknown>, msg?: string) {
    try {
      const r = await api<PostBundle & { notice?: string }>(`/api/posts/${p.id}`, "POST", payload);
      setB(r);
      if (r.notice) setToast(r.notice);
      else if (msg) setToast(msg);
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
          <TitleRulesEditor key={p.blog_id} blogId={p.blog_id} disabled={running}/>
          {!plan ? (
            <p className="small muted">{running ? "AI가 네이버 연관 키워드 검색량을 보고 제목 후보를 만들고 있습니다…" : "아직 제목이 없습니다."}</p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {choosing && <div className="notice small">후보를 누르거나 &apos;선택한 제목&apos; 칸에 원하는 대로 고친 뒤 <b>이 제목으로 글 쓰기</b>를 누르세요. 칸에 적힌 제목 그대로 글을 씁니다.</div>}
              <TitlePicker plan={plan} current={title} draft={titleDraft} setDraft={setTitleDraft} choosing={choosing} disabled={running} onPick={(payload) => act({ action: "select_title", ...payload }, "제목을 저장했습니다.")} />
              {choosing && !plan.outline && (
                <WriteStart
                  projectId={p.id}
                  disabled={running || !titleDraft.trim()}
                  onOutline={() => act({ action: "outline", title: titleDraft.trim() }, "기획안(목차·근거)을 만들고 있어요.")}
                  onWrite={() => act({ action: "write", title: titleDraft.trim() }, "글 작성을 시작합니다.")}
                />
              )}
              {plan.outline && !plan.outline.approved && !running && p.stage === "titles" && (
                <OutlineCard
                  projectId={p.id}
                  outline={plan.outline}
                  onApprove={(outline) => act({ action: "approve_outline", outline }, "기획안을 승인했어요. 글 작성을 시작합니다.")}
                  onVerify={(outline, indexes, sectionIndexes) => act({ action: "verify_claims", outline, indexes, sectionIndexes })}
                  onRedo={() => act({ action: "outline", title: titleDraft.trim() || title }, "기획안을 다시 만들고 있어요.")}
                />
              )}
              {plan.outline?.approved && <div className="tiny muted">✅ 승인한 기획안(목차 {plan.outline.sections.length}개 · 주장 {plan.outline.claims.length}개)대로 글을 써요.</div>}
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
                onWholeRequest={(note) => act({ action: "edit_request", note }, "말로 요청한 수정사항을 AI가 글 전체에서 찾아 반영하고 있습니다.")}
              />
              <VersionHistory projectId={p.id} revision={doc?.revision ?? 0} disabled={running} onRestored={() => void refresh()} />
              <Hashtags tags={extras.hashtags} disabled={running} onSave={(hashtags) => act({ action: "hashtags", hashtags }, "해시태그를 저장했습니다.")} />
              {doc?.content_html && <EditRequest busy={running} lastEdit={extras.lastEdit ?? null} onRun={(note) => act({ action: "edit_request", note }, "수정 요청사항을 AI가 반영하고 있습니다.")} />}
              {doc?.content_html && !running && <Rewrite onRun={(feedback) => act({ action: "rerun", step: "write", feedback }, "글을 다시 씁니다.")} />}
            </div>
          ) : (
            <p className="small muted">③에서 제목을 고르고 &apos;이 제목으로 글 쓰기&apos;를 누르면 AI가 글을 씁니다.</p>
          )}
        </Section>

        {/* ⑤ 이미지 */}
        <Section n={5} title={extras.images.some((im) => im.kind === "official") ? "이미지 (공식 홈페이지)" : "이미지 (Higgsfield · ChatGPT · Gemini)"}>
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
                AI가 글 내용에 맞는 이미지 프롬프트를 만들었습니다. <b>생성은 자동으로 하지 않습니다</b>. 이미지마다 모델(Higgsfield · ChatGPT · Gemini)을 고르고 &quot;이미지 만들기&quot;를 누르세요(고른 곳의 크레딧 차감). 다 되면 &quot;본문에 넣기&quot;로 글의 [이미지 N] 자리에 넣습니다.
                {!Object.values(imageProviders).some(Boolean) && " · 지금은 이미지 AI가 연결되지 않아 프롬프트를 복사해서 각 사이트에서 만들 수 있습니다."}
              </p>
              )}
              {!extras.images.every((im) => im.kind === "official") && (
                <div className="card card-pad stack" style={{ gap: 6, padding: 12, background: "var(--panel-2)" }}>
                  <div className="row between" style={{ gap: 6 }}>
                    <b className="small">🎨 이 글의 이미지 컨셉 (모든 이미지 공통)</b>
                    <button className="btn btn-sm" disabled={running || replanning} onClick={async () => { if (!confirm("글 전체를 다시 읽고 이미지 컨셉·재료·프롬프트를 새로 잡을까요?\n이미 만든 이미지는 그대로 두고 프롬프트만 바뀌어요. (글 AI 사용)")) return; setReplanning(true); await act({ action: "replan_images" }, ""); setReplanning(false); }}>
                      {replanning ? <><span className="spinner" /> 글 읽고 컨셉 잡는 중…</> : extras.imageConcept ? "🔄 컨셉 다시 잡기" : "🎨 컨셉 잡기"}
                    </button>
                  </div>
                  {extras.imageConcept ? (
                    <>
                      <div className="small">{extras.imageConcept.summary}</div>
                      {!!extras.imageConcept.ingredients.length && <div className="tiny"><b>재료·등장</b> {extras.imageConcept.ingredients.join(" · ")}</div>}
                      {!!extras.imageConcept.steps.length && (
                        <details>
                          <summary className="tiny" style={{ cursor: "pointer" }}>순서 {extras.imageConcept.steps.length}단계 보기</summary>
                          <ol className="tiny" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{extras.imageConcept.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                        </details>
                      )}
                      <div className="tiny muted">글 전체를 읽고 컨셉 → 재료(분량까지) → 이미지마다 프롬프트 순서로 만들었어요. 모든 프롬프트에 같은 컨셉이 들어가고, 2번째 이미지부터는 1번 이미지를 레퍼런스로 같이 보내요. ({extras.imageConcept.provider}/{extras.imageConcept.model})</div>
                    </>
                  ) : (
                    <div className="tiny muted">아직 컨셉을 잡지 않은 글이에요. &quot;컨셉 잡기&quot;를 누르면 글 전체를 읽고 같은 컨셉·같은 재료로 이미지 프롬프트를 다시 만들어요.</div>
                  )}
                </div>
              )}
              {extras.images.map((im, i) => (
                <div key={i} className="stack" style={{ gap: 4 }}>
                  {i > 0 && im.kind !== "official" && !im.manual && (
                    <label className="tiny row" style={{ gap: 6, justifyContent: "flex-end" }} title="먼저 만든 1번 이미지를 레퍼런스로 같이 보내 같은 그릇·요리·분위기로 만들어요">
                      <input type="checkbox" checked={im.matchFirst !== false} disabled={running} onChange={(e) => void act({ action: "image_match_first", index: i, on: e.target.checked }, "")} />
                      🔗 1번 이미지와 컨셉 맞추기{!extras.images[0]?.url ? " (1번을 먼저 만들면 적용돼요)" : ""}
                    </label>
                  )}
                  {!!im.shows?.length && im.kind !== "official" && !im.manual && <div className="tiny muted" style={{ textAlign: "right" }}>꼭 보일 것: {im.shows.join(" · ")}</div>}
                  <label className="tiny row" style={{ gap: 6, justifyContent: "flex-end" }} title="체크하면 이 자리는 앱에서 넣지 않고, 블로그 편집기에서 직접 사진을 넣어요 (발행 준비 판정에서 빠져요)">
                    <input type="checkbox" checked={!!im.manual} disabled={running} onChange={(e) => void act({ action: "image_manual", index: i, manual: e.target.checked }, e.target.checked ? `이미지 ${i + 1}은 블로그 편집기에서 직접 넣는 걸로 표시했어요.` : `이미지 ${i + 1}은 앱에서 넣는 걸로 바꿨어요.`)} />
                    📷 이미지 {i + 1}: 블로그 편집기에서 직접 넣을게요
                  </label>
                  {im.manual ? (
                    <div className="card card-pad small muted" style={{ padding: 10 }}>이미지 {i + 1} 자리는 블로그 편집기에서 직접 넣어요. 본문의 [이미지 {i + 1}] 표시 자리에 사진을 넣고 표시는 지우세요.</div>
                  ) : im.kind === "official" ? (
                    <OfficialImageCard index={i} im={im} disabled={running} act={act} />
                  ) : (
                    <ImageCard projectId={p.id} blogId={p.blog_id} index={i} im={im} providers={imageProviders} disabled={running} act={act} copy={copy} kit={kit} souls={souls} others={extras.images.flatMap((x, k) => (k !== i && x.url ? [{ url: x.url, label: `이미지 ${k + 1}` }] : []))} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ⑥ 검수 */}
        <Section
          n={6}
          title="글·이미지 검수"
          ai={review ? { provider: review.provider, model: review.model, substitutedFor: review.substitutedFor ?? null } : undefined}
          right={review && doc?.content_html && !running && <button className="btn btn-sm" onClick={() => act({ action: "rerun", step: "review" }, "다시 검수합니다.")}>다시 검수</button>}
        >
          {!review ? (
            running ? (
              <p className="small muted">{b.jobs.some((j) => j.type === "review") ? "검수 중이에요…" : "글을 쓰는 중이에요. 다 쓰면 여기서 직접 검수를 시작해요."}</p>
            ) : doc?.content_html ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small" style={{ margin: 0 }}>글과 이미지를 먼저 읽어 보고 고친 다음, 준비되면 검수를 시작하세요. 검수는 자동으로 하지 않아요.</p>
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => act({ action: "rerun", step: "review" }, "검수를 시작합니다.")}>🔍 검수 시작</button>
              </div>
            ) : (
              <p className="small muted">글이 완성되면 여기서 검수를 시작할 수 있어요.</p>
            )
          ) : (
            <ReviewView
              review={review}
              rereview={p.needs_rereview}
              imagesNow={extras.images.filter((i) => i.url).length}
              busy={running}
              fixing={b.jobs.some((j) => j.type === "fix")}
              reviewing={b.jobs.some((j) => j.type === "review")}
              onFix={(indexes, notes, general) => act({ action: "fix_issues", indexes, notes: Object.fromEntries(Object.entries(notes).filter(([k]) => indexes.includes(Number(k)))), general: general ?? "" }, `${indexes.length ? `지적 ${indexes.length}건` : ""}${indexes.length && general?.trim() ? " + " : ""}${general?.trim() ? "글 전체 수정사항" : ""}을 AI가 고치고 있습니다.`)}
              onNote={(index, note) => void act({ action: "issue_note", index, note })}
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
              ready={readiness({ stage: p.stage, status: p.status, needsRereview: p.needs_rereview, review: p.review as never, images: extras.images, placeholders: placeholderNumbers(doc.content_html), outlinePending: !!(plan as PostPlan & { outline?: { approved?: boolean } } | null)?.outline && !(plan as PostPlan & { outline?: { approved?: boolean } }).outline?.approved })}
              title={title}
              html={doc.content_html}
              hashtags={extras.hashtags}
              blogUrl={b.blog?.url}
              projectId={p.id}
              published={p.stage === "published"}
              publishDate={(p as unknown as { publish_date?: string | null }).publish_date ?? ""}
              publishedUrl={extras.publishedUrl ?? null}
              publishedAt={extras.publishedAt ?? null}
              disabled={running}
              copy={copy}
              act={act}
            />
          )}
        </Section>

        {doc?.content_html && (
          <Link className="btn" style={{ alignSelf: "flex-start" }} href={`/repurpose?post=${p.id}`}>📣 이 글을 다른 채널용으로 바꾸기 →</Link>
        )}
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

/** 단계 칸: 오른쪽 ▼ 로 접고 펴기 (접은 상태는 이 브라우저에 기억) */
function Section({ n, title, ai, right, children }: { n: number; title: string; ai?: { provider: string; model: string; substitutedFor: string | null } | null; right?: React.ReactNode; children: React.ReactNode }) {
  const key = `post-sec-closed:${n}`;
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      setClosed(localStorage.getItem(key) === "1");
    } catch {
      /* 저장소를 못 쓰면 펼친 채로 */
    }
  }, [key]);
  const toggle = () => {
    setClosed((c) => {
      try {
        localStorage.setItem(key, c ? "0" : "1");
      } catch {
        /* 무시 */
      }
      return !c;
    });
  };
  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, cursor: "pointer" }} onClick={toggle}>{"①②③④⑤⑥⑦"[n - 1]} {title}</h2>
        <div className="row">
          {ai && <span className="tiny muted">{ai.provider}/{ai.model}{ai.substitutedFor ? ` · ${ai.substitutedFor} 대신 사용` : ""}</span>}
          {!closed && right}
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggle} aria-expanded={!closed} title={closed ? "펼치기" : "접기"} aria-label={closed ? `${title} 펼치기` : `${title} 접기`} style={{ minWidth: 32 }}>
            <span style={{ display: "inline-block", transition: "transform .15s", transform: closed ? "rotate(-90deg)" : "none" }}>▼</span>
          </button>
        </div>
      </div>
      {/* 접어도 내용은 그대로 둠 (편집기 상태 유지) */}
      <div className="card-pad" style={closed ? { display: "none" } : undefined}>{children}</div>
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

function ImageCard({ projectId, blogId, index, im, providers, disabled, act, copy, kit, souls, others }: { projectId: string; blogId: string; index: number; im: PostExtras["images"][number]; providers: Record<string, boolean>; disabled: boolean; act: (p: Record<string, unknown>, m?: string) => Promise<boolean>; copy: (t: string, w: string) => void; kit?: KitInfo; souls: SoulInfo[]; others: { url: string; label: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [request, setRequest] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [recs, setRecs] = useState<{ id: string; reason: string }[] | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const kitHas = !!kit && (kit.refs.length > 0 || !!kit.style.trim() || !!kit.soulId);
  const useKit = im.useKit !== false;
  const [prompt, setPrompt] = useState(im.prompt);
  useEffect(() => setPrompt(im.prompt), [im.prompt]);
  const [making, setMaking] = useState(false);
  const generating = (!!im.mediaJobId && !im.url) || making;
  const usable = IMAGE_MODELS.filter((m) => providers[m.provider]);
  // 모델: 이 이미지에서 마지막으로 쓴 것 → 이 기기에서 마지막으로 고른 것 → 연결된 첫 모델
  const [model, setModel] = useState(() => {
    if (im.model && imageModel(im.model)) return im.model;
    try {
      const saved = localStorage.getItem("image-model") || localStorage.getItem("hf-image-model");
      if (saved && imageModel(saved)) return saved;
    } catch {
      /* 없으면 기본 */
    }
    return usable[0]?.id ?? "soul-standard";
  });
  const info = imageModel(model);
  const [price, setPrice] = useState<{ model: string; aspect: string; usd: number | null; note?: string; refs?: number } | null>(null);
  useEffect(() => {
    if (!usable.length) return;
    let alive = true;
    api<{ usd: number | null; note?: string; refs?: number }>(`/api/posts/${projectId}`, "POST", { action: "estimate_image", index, model })
      .then((r) => alive && setPrice({ model, aspect: im.aspect, usd: r.usd, note: r.note, refs: r.refs }))
      .catch(() => alive && setPrice({ model, aspect: im.aspect, usd: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, im.aspect, index, projectId, (im.refIds ?? []).join(), im.useKit, im.soulId]);
  const pickModel = (m: string) => {
    setModel(m);
    try {
      localStorage.setItem("image-model", m);
    } catch {
      /* 저장 못 해도 동작 */
    }
  };
  const providerName = info ? IMAGE_PROVIDER_NAMES[info.provider] : "Higgsfield";
  async function generate() {
    const cost = price?.model === model && price.usd != null ? `\n예상 비용: ${fmtUsd(price.usd)}` : "";
    if (!confirm(`이미지 ${index + 1}을 ${providerName} · ${info?.label ?? model}(으)로 만들까요?${cost}\n${providerName} 크레딧(사용량)이 차감됩니다.`)) return;
    setMaking(info?.provider !== "higgsfield");
    await act({ action: "generate_image", index, model }, info?.provider === "higgsfield" ? "이미지 생성을 시작했습니다." : "이미지를 만들었습니다.");
    setMaking(false);
  }
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
      <span className="tiny muted">한국어로 적어도 돼요. 저장하거나 만들 때 영어로 바꿔서 보내요.</span>
      {editing && (
        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
          <input className="input" value={request} autoFocus placeholder="어떻게 바꿀까요? 예: 배경을 밤 도시로, 더 귀엽게, 글자 빼기" onChange={(e) => setRequest(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && request.trim() && document.getElementById(`pe-${index}`)?.click()} aria-label="프롬프트 수정 요청" />
          <button
            id={`pe-${index}`}
            className="btn btn-sm btn-primary"
            disabled={editBusy || !request.trim()}
            onClick={async () => {
              setEditBusy(true);
              if (await act({ action: "prompt_edit", index, request })) { setRequest(""); setEditing(false); }
              setEditBusy(false);
            }}
          >
            {editBusy ? <span className="spinner" /> : "고치기"}
          </button>
        </div>
      )}
      <div className="row">
        {prompt !== im.prompt && <button className="btn btn-sm" onClick={() => act({ action: "image_prompt", index, prompt }, "프롬프트를 저장했습니다.")}>프롬프트 저장</button>}
        <button className="btn btn-sm" disabled={disabled || generating || prompt !== im.prompt} onClick={() => setEditing(!editing)} title="한국어로 바꿀 점을 적으면 AI가 프롬프트를 고쳐요 (무료 Gemini)">✏️ 프롬프트 수정</button>
        <button className="btn btn-sm" onClick={() => copy(prompt, "프롬프트")}>프롬프트 복사</button>
        {usable.length > 0 && (
          <button
            className="btn btn-sm"
            disabled={recBusy || prompt !== im.prompt}
            title="프롬프트·레퍼런스를 보고 연결된 모델 중 3개 추천 (무료 Gemini)"
            onClick={async () => {
              setRecBusy(true);
              try {
                setRecs((await api<{ picks: { id: string; reason: string }[] }>(`/api/posts/${projectId}`, "POST", { action: "recommend_model", index })).picks);
              } catch {
                setRecs([]);
              }
              setRecBusy(false);
            }}
          >
            {recBusy ? <span className="spinner" /> : "🤖 모델 추천"}
          </button>
        )}
        {usable.length > 0 && (
          <select className="select" style={{ width: 270, maxWidth: "100%" }} value={model} disabled={disabled || generating} onChange={(e) => pickModel(e.target.value)} aria-label="이미지 모델">
            {(["higgsfield", "openai", "google"] as const).map((pv) => {
              const list = IMAGE_MODELS.filter((m) => m.provider === pv);
              return (
                <optgroup key={pv} label={`${IMAGE_PROVIDER_NAMES[pv]}${providers[pv] ? "" : " — 연결 안 됨"}`}>
                  {list.map((m) => (
                    <option key={m.id} value={m.id} disabled={!providers[pv]}>{m.label} — {m.note}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}
        {usable.length > 0 && (
          <button className="btn btn-sm btn-primary" disabled={disabled || generating || prompt !== im.prompt || !info || !providers[info.provider]} onClick={() => void generate()}>
            {generating ? <><span className="spinner" /> {making ? "만드는 중… (10~60초)" : "생성 중…"}</> : im.url ? "다시 생성" : "이미지 만들기"}
          </button>
        )}
        {im.url && <button className="btn btn-sm btn-ok" disabled={disabled || generating} onClick={() => act({ action: "insert_image", index }, "본문에 넣었습니다.")}>{im.inserted ? "다시 넣기" : "본문에 넣기"}</button>}
      </div>
      {recs && (
        <div className="stack" style={{ gap: 4 }}>
          {!recs.length && <span className="tiny muted">추천을 받지 못했어요.</span>}
          {recs.map((r, k) => {
            const m = imageModel(r.id);
            return (
              <button key={r.id} type="button" className={`rec-pick${model === r.id ? " on" : ""}`} onClick={() => pickModel(r.id)}>
                <b className="small">{k + 1}. {m?.label ?? r.id}</b> <span className="tiny muted">{m ? IMAGE_PROVIDER_NAMES[m.provider] : ""}</span>
                <span className="tiny">{r.reason}</span>
              </button>
            );
          })}
        </div>
      )}
      <details className="ref-box" open={!!(im.refIds?.length || (kitHas && useKit))}>
        <summary className="small strong">🎨 레퍼런스 · 컨셉 {im.refIds?.length || (kitHas && useKit) ? `(${(im.refIds?.length ?? 0) + (kitHas && useKit ? kit!.refs.length : 0)}장)` : ""}</summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <span className="tiny muted">{info ? (info.refs ? `이 모델은 레퍼런스 사진을 ${info.refs}장까지 써요.` : "이 모델은 레퍼런스 사진을 못 써요 (스타일 문구만 반영). 🤖 모델 추천을 눌러 보세요.") : ""}</span>
          {kitHas ? (
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={useKit} disabled={disabled || generating} onChange={(e) => act({ action: "image_refs", index, useKit: e.target.checked })} />
              블로그 컨셉 키트 쓰기 <span className="tiny muted">(사진 {kit!.refs.length}장{kit!.style.trim() ? ` · 스타일: ${kit!.style.slice(0, 40)}` : ""})</span>
            </label>
          ) : (
            <a className="tiny" href={`/blogs/${blogId}#kit`} style={{ color: "var(--accent)" }}>블로그 설정에서 컨셉 키트 만들기 → 매번 같은 그림체로</a>
          )}
          <RefPicker ids={im.refIds ?? []} max={5} disabled={disabled || generating} candidates={others} onChange={async (ids) => { await act({ action: "image_refs", index, refIds: ids }); }} />
          {info?.soul && (
            <label className="row small" style={{ gap: 6 }}>
              내 캐릭터(Soul ID)
              <select className="select" style={{ maxWidth: 220 }} value={im.soulId === "" ? "__none" : im.soulId ?? "__kit"} disabled={disabled || generating} onChange={(e) => act({ action: "image_refs", index, soulId: e.target.value === "__kit" ? null : e.target.value === "__none" ? "" : e.target.value })}>
                <option value="__kit">키트 기본값{kit?.soulId ? "" : " (없음)"}</option>
                <option value="__none">안 씀</option>
                {souls.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.version})</option>)}
              </select>
              {!souls.length && <a className="tiny" href="/settings#souls" style={{ color: "var(--accent)" }}>캐릭터 만들기</a>}
            </label>
          )}
        </div>
      </details>
      {usable.length > 0 && (
        <div className="tiny muted">
          {price?.model === model ? (price.usd != null ? `예상 비용 ${fmtUsd(price.usd)} / 1장 (Higgsfield 견적, ${im.aspect}${price.refs ? ` · 레퍼런스 ${price.refs}장 포함` : ""})` : price.note ?? "예상 비용을 불러오지 못했습니다") : "예상 비용 확인 중…"}
          {im.url && im.model && ` · 지금 이미지: ${imageModel(im.model)?.label ?? im.model}`}
        </div>
      )}
      {im.url && (
        <div className="stack" style={{ gap: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <ZoomImg src={im.url} alt={im.alt} style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, alignSelf: "flex-start" }} />
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
          <ZoomImg src={im.url} alt={im.alt} referrerPolicy="no-referrer" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, alignSelf: "flex-start", background: "#fff" }} />
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

function ReviewView({ review, rereview, imagesNow, busy, fixing, reviewing, onFix, onNote, onRereview }: { review: Review; rereview: boolean; imagesNow: number; busy: boolean; fixing: boolean; reviewing: boolean; onFix: (indexes: number[], notes: Record<number, string>, general?: string) => void; onNote: (index: number, note: string) => void; onRereview: () => void }) {
  const sev: Record<string, string> = { high: "badge-bad", medium: "badge-warn", low: "" };
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(review.issues.map((it, i) => [i, it.userNote ?? ""])));
  useEffect(() => setNotes(Object.fromEntries(review.issues.map((it, i) => [i, it.userNote ?? ""]))), [review]);
  const open = review.issues.map((it, i) => (it.fixed ? -1 : i)).filter((i) => i >= 0);
  const [general, setGeneral] = useState(review.generalNote ?? "");
  useEffect(() => setGeneral(review.generalNote ?? ""), [review]);
  // 코멘트를 단 지적 (이미 고친 지적이라도 코멘트를 바꿨으면 다시 포함)
  const commented = review.issues.map((it, i) => {
    const n = (notes[i] ?? "").trim();
    return n && (!it.fixed || n !== (it.userNote ?? "").trim()) ? i : -1;
  }).filter((i) => i >= 0);
  const bulkLabel = [commented.length ? `코멘트 ${commented.length}건` : "", general.trim() ? "글 전체 수정사항" : ""].filter(Boolean).join(" + ");
  // ☑ 체크한 지적만 골라 한 번에 AI 수정
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [review]);
  const togglePick = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const allOpenPicked = open.length > 0 && open.every((i) => picked.includes(i));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        {open.length > 0 && (
          <label className="small row" style={{ gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={allOpenPicked} disabled={busy} onChange={() => setPicked(allOpenPicked ? [] : open)} aria-label="남은 지적 모두 선택" /> 모두 선택
          </label>
        )}
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || !picked.length}
          onClick={() => confirm(`선택한 지적 ${picked.length}건을 AI가 본문에 반영할까요?\n적어 둔 내 코멘트도 함께 반영하고, 선택하지 않은 부분은 그대로 둡니다.`) && onFix([...picked].sort((a, b) => a - b), notes)}
        >
          {fixing ? <><span className="spinner" /> AI가 고치는 중…</> : `☑ 선택한 지적 AI로 수정 (${picked.length})`}
        </button>
        <button className="btn btn-sm" disabled={busy || !open.length} onClick={() => confirm(`남은 지적 ${open.length}건을 AI가 본문에 반영할까요?\n적어 둔 내 코멘트도 함께 반영하고, 지적과 관계없는 부분은 그대로 둡니다.`) && onFix(open, notes)}>
          {fixing ? <><span className="spinner" /> AI가 고치는 중…</> : `✏️ 지적 모두 AI로 수정 (${open.length})`}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={onRereview}>
          {reviewing ? <><span className="spinner" /> 검수 중…</> : "🔄 다시 검수"}
        </button>
      </div>
      <div className="card card-pad stack" style={{ gap: 6, padding: 10 }}>
        <button
          className="btn btn-sm btn-primary"
          style={{ alignSelf: "flex-start" }}
          disabled={busy || !bulkLabel}
          onClick={() => confirm(`${bulkLabel}을(를) 한 번에 AI가 본문에 반영할까요?\n내 코멘트는 AI 수정 제안보다 우선하고, 관계없는 부분은 그대로 둡니다.`) && onFix(commented, notes, general)}
        >
          {fixing ? <><span className="spinner" /> AI가 고치는 중…</> : `💬 코멘트 반영해 한꺼번에 고치기${bulkLabel ? ` (${bulkLabel})` : ""}`}
        </button>
        <div className="label" style={{ marginTop: 4 }}>📝 글 전체 수정사항 (선택)</div>
        <textarea
          className="textarea"
          style={{ minHeight: 70, fontSize: 13 }}
          placeholder={"글 전체에 더하거나 빼고 싶은 내용을 적어 주세요. 짧게 적어도 AI가 맥락에 맞는 자리에 넣어요.\n예: 2026년 부모급여 인상 내용 추가해줘 / 마지막 광고 느낌 문단은 빼줘"}
          value={general}
          disabled={busy}
          onChange={(e) => setGeneral(e.target.value)}
          aria-label="글 전체 수정사항"
        />
        <div className="tiny muted">아래 지적마다 코멘트를 달고, 필요하면 여기에 글 전체 수정사항을 적은 뒤 위 버튼을 누르세요. 코멘트를 단 지적 + 글 전체 수정사항이 한 번에 반영돼요.</div>
      </div>
      {review.lastFix?.changes?.length ? (
        <div className="notice notice-ok small">
          <b>AI가 고친 내용</b> · {fmtDate(review.lastFix.at)}
          {review.lastFix.general && <div className="tiny">📝 반영한 글 전체 수정사항: {review.lastFix.general}</div>}
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
      {(() => {
        const card = (i: number) => {
        const it = review.issues[i];
        const note = notes[i] ?? "";
        const noteChanged = note.trim() !== (it.userNote ?? "").trim();
        return (
          <div key={i} className="card card-pad stack" style={{ gap: 4, padding: 10, ...(it.fixed ? { background: "var(--ok-bg, #f3faf5)" } : {}) }}>
            <div className="row">
              <input type="checkbox" checked={picked.includes(i)} disabled={busy} onChange={() => togglePick(i)} aria-label={`지적 ${i + 1} 선택 (일괄 AI 수정)`} />
              <span className={`badge ${sev[it.severity] ?? ""}`}>{it.severity}</span><span className="badge">{it.type}</span>
            </div>
            {it.quote && <div className="tiny muted">“{it.quote}”</div>}
            <div className="small">{it.comment}</div>
            {it.suggestion && <div className="small" style={{ color: "var(--ok)" }}>→ {it.suggestion}</div>}
            <textarea
              className="textarea"
              style={{ minHeight: 44, fontSize: 13, marginTop: 4 }}
              placeholder="💬 내 코멘트 (선택) — 예: 링크는 넣지 말고 확인일만 적어 주세요 / 이 부분은 그대로 둬도 돼요"
              value={note}
              disabled={busy}
              onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))}
              onBlur={() => noteChanged && onNote(i, note)}
              aria-label={`지적 ${i + 1} 내 코멘트`}
            />
            <div className="row" style={{ marginTop: 4 }}>
              {it.fixed && !noteChanged ? (
                <span className="badge badge-ok">✅ 수정 완료</span>
              ) : (
                <button className="btn btn-sm" disabled={busy} onClick={() => onFix([i], { [i]: note })}>{it.fixed ? "✏️ 코멘트대로 다시 수정" : note.trim() ? "✏️ 코멘트 반영해 수정 요청" : "✏️ 수정 요청"}</button>
              )}
              {!it.fixed && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onRereview}>🔄 다시 검수</button>}
            </div>
          </div>
        );
        };
        const done = review.issues.map((it, i) => (it.fixed ? i : -1)).filter((i) => i >= 0);
        return (
          <>
            {open.map(card)}
            {!!done.length && (
              <div className="stack" style={{ gap: 8, marginTop: 6 }}>
                <div className="row between" style={{ borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10 }}>
                  <b className="small">✅ 수정 완료 ({done.length})</b>
                  <button className="btn btn-sm" disabled={busy} onClick={onRereview}>
                    {reviewing ? <><span className="spinner" /> 검수 중…</> : "🔄 다시 검수"}
                  </button>
                </div>
                <div className="tiny muted">AI가 고친 지적이에요. 고친 글이 괜찮은지 &apos;다시 검수&apos;로 확인하세요. 코멘트를 바꾸면 다시 고칠 수 있어요.</div>
                {done.map(card)}
              </div>
            )}
          </>
        );
      })()}
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

function Publish(props: { ready: Readiness; publishDate: string; title: string; html: string; hashtags: string[]; blogUrl?: string; projectId: string; published: boolean; publishedUrl: string | null; publishedAt: string | null; disabled: boolean; copy: (t: string, w: string) => void; act: (p: Record<string, unknown>, m?: string) => Promise<boolean> }) {
  const [url, setUrl] = useState(props.publishedUrl ?? "");
  const tags = props.hashtags.map((t) => "#" + t).join(" ");
  const base = `/api/projects/${props.projectId}/export`;
  const [pd, setPd] = useState(props.publishDate);
  const r = props.ready;
  const ok = r.state === "ready" || r.state === "manual" || r.state === "published";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className={`notice ${ok ? "notice-ok" : "notice-warn"} small stack`} style={{ gap: 4 }}>
        <b>{READY_LABEL[r.state].label}{r.score != null ? ` · 검수 ${r.score}점 · 남은 지적 ${r.openIssues}건` : ""}</b>
        {r.reasons.map((x) => <span key={x}>• {x}</span>)}
        {r.unverified.slice(0, 3).map((u, i) => <span key={i} className="tiny">  ↳ 근거 확인: {u.quote ? `"${u.quote.slice(0, 40)}" — ` : ""}{u.comment.slice(0, 80)}</span>)}
        {r.manualPlaceholders.length > 0 && <span className="tiny">블로그에 붙여 넣은 뒤 [이미지 {r.manualPlaceholders.join("], [이미지 ")}] 자리에 직접 사진을 넣으세요.</span>}
      </div>
      {!props.published && (
        <label className="small row" style={{ gap: 6, flexWrap: "nowrap" }}>
          📅 발행 예정일
          <input className="input" type="date" style={{ maxWidth: 170 }} value={pd} onChange={(e) => setPd(e.target.value)} onBlur={() => pd !== props.publishDate && void props.act({ action: "publish_date", date: pd }, pd ? "발행 예정일을 저장했어요. 캘린더에 표시돼요." : "발행 예정일을 지웠어요.")} aria-label="발행 예정일" />
          <span className="tiny muted">캘린더에 표시돼요</span>
        </label>
      )}
      <div className="row">
        <button className="btn" onClick={() => props.copy(props.title, "제목")}>제목 복사</button>
        <button className="btn" onClick={() => props.copy(props.html, "본문(HTML)")}>본문 복사</button>
        <button className="btn" onClick={() => props.copy(tags, "해시태그")}>해시태그 복사</button>
        <a className="btn" href={`${base}?format=html`}>HTML 다운로드</a>
        <a className="btn" href={`${base}?format=md`}>마크다운 다운로드</a>
        {props.blogUrl && <a className="btn" href={props.blogUrl} target="_blank" rel="noreferrer">내 블로그 열기 ↗</a>}
        <CarouselButton projectId={props.projectId} />
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
          <button className="btn btn-ok" disabled={props.disabled} onClick={() => (ok || confirm(`아직 '${READY_LABEL[r.state].label}' 상태예요.\n${r.reasons.join("\n")}\n\n그래도 발행 완료로 표시할까요?`)) && props.act({ action: "publish", url }, "발행 완료로 표시했습니다.")}>⑦ 발행 완료</button>
        </div>
      )}
    </div>
  );
}

/** 📱 이 글로 인스타 캐러셀 만들기 → 캐러셀 편집 화면으로 */
function CarouselButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ id: string }>("/api/carousels", "POST", { projectId });
          router.push(`/carousels/${r.id}`);
        } catch (e) {
          alert((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {busy ? <><span className="spinner" /> 캐러셀 만드는 중…</> : "📱 인스타 캐러셀 만들기"}
    </button>
  );
}

/** 🕘 원고 버전 기록 · 되돌리기 */
function VersionHistory({ projectId, revision, disabled, onRestored }: { projectId: string; revision: number; disabled: boolean; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ id: string; number: number; title: string; label: string; source: string; model: string | null; created_at: string; chars: number; preview: string }[] | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!open) return;
    api<NonNullable<typeof list>>(`/api/projects/${projectId}/versions`).then(setList).catch(() => setList([]));
  }, [open, projectId, revision]);
  async function restore(id: string, n: number) {
    if (!confirm(`원고를 v${n}로 되돌릴까요?\n지금 원고는 '되돌리기 전' 버전으로 남아요. 검수가 끝난 글이면 '재검수 필요'로 바뀌어요.`)) return;
    setBusy(id);
    try {
      await api(`/api/projects/${projectId}/versions/${id}`, "POST");
      onRestored();
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy("");
  }
  return (
    <details className="fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="small" style={{ color: "var(--accent)", cursor: "pointer" }}>🕘 원고 버전 기록 · 되돌리기</summary>
      {!list ? (
        <div className="small muted" style={{ marginTop: 6 }}><span className="spinner" /> 불러오는 중…</div>
      ) : !list.length ? (
        <div className="small muted" style={{ marginTop: 6 }}>아직 저장된 버전이 없어요.</div>
      ) : (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {list.map((v) => (
            <div key={v.id} className="row between card card-pad" style={{ padding: 8, flexWrap: "nowrap", gap: 8 }}>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="small"><b>v{v.number}</b> · {v.label || v.source}{v.model ? ` · ${v.model}` : ""} · {fmtDate(v.created_at)} · {v.chars.toLocaleString("ko-KR")}자</span>
                <span className="tiny muted ellipsis">{v.preview}</span>
              </div>
              <button className="btn btn-sm" disabled={disabled || !!busy} onClick={() => restore(v.id, v.number)}>{busy === v.id ? <span className="spinner" /> : "되돌리기"}</button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

type Est = { steps: { key: string; label: string; model: string; provider: string; usd: number | null }[]; total: number | null };
function useEstimates(projectId: string) {
  const [e, setE] = useState<{ outline: Est; write: Est } | null>(null);
  useEffect(() => {
    api<{ outline: Est; write: Est }>(`/api/posts/${projectId}`, "POST", { action: "estimate" }).then(setE).catch(() => {});
  }, [projectId]);
  return e;
}
const estLine = (e?: Est | null) => (!e ? "" : e.steps.map((s) => `${s.label}: ${s.model}${s.usd != null ? ` ${fmtUsd(s.usd)}` : ""}`).join(" → "));

/** 제목 다음: 기획안(추천) 또는 바로 쓰기 — 누르기 전에 모델·예상 비용·자동으로 이어질 단계를 보여 줌 */
function WriteStart({ projectId, disabled, onOutline, onWrite }: { projectId: string; disabled: boolean; onOutline: () => void; onWrite: () => void }) {
  const e = useEstimates(projectId);
  return (
    <div className="card card-pad stack" style={{ gap: 8, padding: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={disabled} onClick={onOutline}>📋 기획안 먼저 보기 (목차·근거·이미지 계획){e?.outline.total != null ? ` · 약 ${fmtUsd(e.outline.total)}` : ""}</button>
        <button className="btn" disabled={disabled} onClick={() => confirm(`기획안 없이 바로 글을 쓸까요?\n자동으로 이어지는 단계: ${estLine(e?.write)}`) && onWrite()}>기획안 없이 바로 글 쓰기 →</button>
      </div>
      <span className="tiny muted">기획안: {estLine(e?.outline) || "불러오는 중…"} · 승인하면 이어서 {estLine(e?.write)}{e?.write.total != null ? ` (합계 약 ${fmtUsd(e.write.total)})` : ""}. 예상치는 토큰 × 단가 추정이에요.</span>
    </div>
  );
}

/** ③-2 기획안 확인·수정 → 승인하면 글 작성 */
function OutlineCard({ projectId, outline, onApprove, onRedo, onVerify }: { projectId: string; outline: NonNullable<PostPlan["outline"]>; onApprove: (o: NonNullable<PostPlan["outline"]>) => void; onRedo: () => void; onVerify: (o: NonNullable<PostPlan["outline"]>, indexes: number[], sectionIndexes: number[]) => Promise<boolean> }) {
  const e = useEstimates(projectId);
  const [o, setO] = useState(outline);
  useEffect(() => setO(outline), [outline]);
  const [sel, setSel] = useState<number[]>([]);
  const [selSec, setSelSec] = useState<number[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const removed = o.claims.map((c, i) => ({ c, i })).filter((x) => x.c.removed);
  const removedSec = o.sections.map((x, i) => ({ x, i })).filter((y) => y.x.removed);
  const needSec = o.sections.map((x, i) => (x.check && !x.removed ? i : -1)).filter((i) => i >= 0);
  const needCheck = o.claims.map((c, i) => (c.check && !c.removed ? i : -1)).filter((i) => i >= 0);
  const checks = o.claims.filter((c) => c.check && !c.removed && !c.source.trim()).length;
  async function verify(indexes: number[], sectionIndexes: number[] = [], base = o) {
    setVerifying(sectionIndexes.length > 1 ? "secall" : sectionIndexes.length ? `s${sectionIndexes[0]}` : indexes.length > 1 ? "all" : String(indexes[0]));
    await onVerify(base, indexes, sectionIndexes);
    setVerifying(null);
  }
  // 💬 확인사항별 코멘트 → 그 코멘트대로 다시 확인 (예: 공식 자료로)
  const setClaim = (i: number, patch: Partial<PostOutline["claims"][number]>) => setO((cur) => ({ ...cur, claims: cur.claims.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const setSec = (i: number, patch: Partial<PostOutline["sections"][number]>) => setO((cur) => ({ ...cur, sections: cur.sections.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  function recheck(kind: "claim" | "sec", i: number, comment: string) {
    const next = kind === "claim" ? { ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, check: true, comment } : x)) } : { ...o, sections: o.sections.map((x, k) => (k === i ? { ...x, check: true, comment } : x)) };
    setO(next);
    void (kind === "claim" ? verify([i], [], next) : verify([], [i], next));
  }
  const personal = (u?: string) => !!u && /(blog\.naver\.com|cafe\.naver\.com|tistory\.com|brunch\.co\.kr|velog\.io|blog\.daum\.net|cafe\.daum\.net|medium\.com|blogspot\.|wordpress\.com|kin\.naver\.com|instagram\.com|youtube\.com)/i.test(u);
  return (
    <div className="card card-pad stack" style={{ gap: 12, borderColor: "var(--accent)" }}>
      <div className="row between">
        <b className="small">📋 기획안 확인 · 내 승인 필요{outline.ai ? <span className="tiny muted"> · {outline.ai.provider}/{outline.ai.model}</span> : null}</b>
        <button className="btn btn-sm btn-ghost" onClick={onRedo}>🔄 다시 만들기</button>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>목차 (소제목 · 들어갈 내용 — 고쳐도 돼요 · ☑ 확인 필요 = AI가 확인할 내용)</span>
          <div className="row" style={{ gap: 6 }}>
            {needSec.length > 0 && <button className="btn btn-sm" disabled={verifying !== null} onClick={() => verify([], needSec)}>{verifying === "secall" ? <><span className="spinner" /> 확인 중…</> : `🔎 확인 필요 ${needSec.length}개 모두 AI 확인`}</button>}
            {selSec.length > 0 && <button className="btn btn-sm btn-danger" onClick={() => { setO({ ...o, sections: o.sections.map((x, k) => (selSec.includes(k) ? { ...x, removed: true } : x)) }); setSelSec([]); }}>🗑 선택한 {selSec.length}개 삭제</button>}
          </div>
        </div>
        {o.sections.map((sec, i) => sec.removed ? null : (
          <div key={i} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <input type="checkbox" style={{ marginTop: 14, flexShrink: 0 }} checked={selSec.includes(i)} onChange={() => setSelSec(selSec.includes(i) ? selSec.filter((x) => x !== i) : [...selSec, i])} aria-label={`소제목 ${i + 1} 선택 (삭제)`} />
            <div className={`card card-pad stack claim-box${sec.verify ? ` ${sec.verify.status}` : ""}`} style={{ gap: 4, padding: 8, flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <input className="input" style={{ fontWeight: 700 }} value={sec.heading} onChange={(ev) => setO({ ...o, sections: o.sections.map((x, k) => (k === i ? { ...x, heading: ev.target.value, verify: undefined } : x)) })} aria-label={`소제목 ${i + 1}`} />
                <label className="tiny row" style={{ gap: 4, flexShrink: 0 }}><input type="checkbox" checked={!!sec.check} onChange={(ev) => setO({ ...o, sections: o.sections.map((x, k) => (k === i ? { ...x, check: ev.target.checked } : x)) })} />확인 필요</label>
              </div>
              <textarea className="textarea" style={{ minHeight: 44, fontSize: 13 }} value={sec.points.join("\n")} onChange={(ev) => setO({ ...o, sections: o.sections.map((x, k) => (k === i ? { ...x, points: ev.target.value.split("\n"), verify: undefined } : x)) })} aria-label={`소제목 ${i + 1} 내용`} />
              {(sec.check || sec.verify) && (
                <div className="row" style={{ gap: 6 }}>
                  {sec.verify && <span className={`badge ${sec.verify.status === "verified" ? "badge-ok" : "badge-bad"}`}>{sec.verify.status === "verified" ? "✅ 확인완료" : "❌ 확인안됨"}</span>}
                  {sec.verify && <span className="tiny muted" style={{ flex: 1 }}>{sec.verify.note}{sec.verify.source ? <> · <a href={sec.verify.source} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>출처</a></> : null}</span>}
                  {sec.check && <button className="btn btn-sm" disabled={verifying !== null} onClick={() => verify([], [i])}>{verifying === `s${i}` ? <span className="spinner" /> : sec.verify ? "🔎 다시 확인" : "🔎 확인 요청"}</button>}
                </div>
              )}
              {sec.verify?.source && personal(sec.verify.source) && <span className="tiny" style={{ color: "var(--warn, #b26b00)" }}>⚠️ 근거가 개인 블로그·커뮤니티예요. 공식 자료로 다시 확인해 보세요.</span>}
              {(sec.check || sec.verify || sec.comment) && <CommentBox value={sec.comment} disabled={verifying !== null} onSave={(v) => setSec(i, { comment: v })} onRun={(v) => recheck("sec", i, v)} />}
            </div>
          </div>
        ))}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>핵심 주장 · 근거 · 출처 (☑ 확인 필요 = AI가 확인할 사실)</span>
          <div className="row" style={{ gap: 6 }}>
            {needCheck.length > 0 && <button className="btn btn-sm" disabled={verifying !== null} onClick={() => verify(needCheck)}>{verifying === "all" ? <><span className="spinner" /> 확인 중…</> : `🔎 확인 필요 ${needCheck.length}개 모두 AI 확인`}</button>}
            {sel.length > 0 && <button className="btn btn-sm btn-danger" onClick={() => { setO({ ...o, claims: o.claims.map((x, k) => (sel.includes(k) ? { ...x, removed: true } : x)) }); setSel([]); }}>🗑 선택한 {sel.length}개 삭제</button>}
          </div>
        </div>
        {o.claims.map((c, i) => c.removed ? null : (
          <div key={i} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <input type="checkbox" style={{ marginTop: 14, flexShrink: 0 }} checked={sel.includes(i)} onChange={() => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i])} aria-label={`주장 ${i + 1} 선택 (삭제)`} />
            <div className={`card card-pad stack claim-box${c.verify ? ` ${c.verify.status}` : ""}`} style={{ gap: 4, padding: 8, flex: 1, minWidth: 0 }}>
              <input className="input" value={c.claim} onChange={(ev) => setO({ ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, claim: ev.target.value, verify: undefined } : x)) })} aria-label={`주장 ${i + 1}`} />
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <input className="input" style={{ fontSize: 13 }} value={c.evidence} onChange={(ev) => setO({ ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, evidence: ev.target.value } : x)) })} placeholder="근거" aria-label={`근거 ${i + 1}`} />
                <input className="input" style={{ fontSize: 13 }} value={c.source} onChange={(ev) => setO({ ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, source: ev.target.value } : x)) })} placeholder="출처 주소 (있으면)" aria-label={`출처 ${i + 1}`} />
                <label className="tiny row" style={{ gap: 4, flexShrink: 0 }}><input type="checkbox" checked={c.check} onChange={(ev) => setO({ ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, check: ev.target.checked } : x)) })} />확인 필요</label>
              </div>
              {(c.check || c.verify) && (
                <div className="row" style={{ gap: 6 }}>
                  {c.verify && <span className={`badge ${c.verify.status === "verified" ? "badge-ok" : "badge-bad"}`}>{c.verify.status === "verified" ? "✅ 확인완료" : "❌ 확인안됨"}</span>}
                  {c.verify && <span className="tiny muted" style={{ flex: 1 }}>{c.verify.note}{c.verify.status === "verified" && /^https?:/.test(c.source) ? <> · <a href={c.source} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>출처</a></> : null}</span>}
                  {c.check && <button className="btn btn-sm" disabled={verifying !== null} onClick={() => verify([i])}>{verifying === String(i) ? <span className="spinner" /> : c.verify ? "🔎 다시 확인" : "🔎 확인 요청"}</button>}
                </div>
              )}
              {personal(c.source) && <span className="tiny" style={{ color: "var(--warn, #b26b00)" }}>⚠️ 출처가 개인 블로그·커뮤니티예요. 공식 자료로 다시 확인해 보세요.</span>}
              {(c.check || c.verify || c.comment || personal(c.source)) && <CommentBox value={c.comment} disabled={verifying !== null} onSave={(v) => setClaim(i, { comment: v })} onRun={(v) => recheck("claim", i, v)} />}
            </div>
          </div>
        ))}
      </div>
      {!!o.images.length && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">이미지 계획</span>
          {o.images.map((m, i) => (
            <input key={i} className="input" style={{ fontSize: 13 }} value={m.what} onChange={(ev) => setO({ ...o, images: o.images.map((x, k) => (k === i ? { ...x, what: ev.target.value } : x)) })} aria-label={`이미지 ${m.n}`} />
          ))}
        </div>
      )}
      {checks > 0 && <div className="notice notice-warn small">출처 없이 &apos;확인 필요&apos;인 사실 {checks}개 — 🔎 AI 확인을 눌러 보세요. 확인완료면 출처가 채워지고, 확인안됨은 지우거나 그대로 두면 글에서 단정하지 않고 [확인 필요]로 남겨요.</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={() => onApprove({ ...o, sections: o.sections.map((sec) => ({ ...sec, points: sec.points.map((x) => x.trim()).filter(Boolean) })) })}>✅ 승인하고 글 쓰기{e?.write.total != null ? ` · 약 ${fmtUsd(e.write.total)}` : ""}</button>
        {removed.length + removedSec.length > 0 && <button className="btn" onClick={() => setShowRemoved(true)}>🗑 삭제한 내용 ({removed.length + removedSec.length})</button>}
      </div>
      {showRemoved && (
        <Modal title={`삭제한 내용 ${removed.length + removedSec.length}개`} onClose={() => setShowRemoved(false)}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="tiny muted">삭제한 목차·주장은 글에 들어가지 않아요. 되살리려면 원상복구를 누르세요.</span>
            {removedSec.map(({ x, i }) => (
              <div key={`s${i}`} className="row between" style={{ gap: 8, flexWrap: "nowrap", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="small"><span className="badge">목차</span> <b>{x.heading}</b></span>
                  {x.points.length > 0 && <span className="tiny muted">{x.points.join(" · ")}</span>}
                </div>
                <button className="btn btn-sm" onClick={() => setO({ ...o, sections: o.sections.map((y, k) => (k === i ? { ...y, removed: false } : y)) })}>↩ 원상복구</button>
              </div>
            ))}
            {removed.map(({ c, i }) => (
              <div key={i} className="row between" style={{ gap: 8, flexWrap: "nowrap", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="small"><span className="badge">주장</span> {c.claim}</span>
                  {c.verify && <span className="tiny muted">{c.verify.status === "verified" ? "✅ 확인완료" : "❌ 확인안됨"} · {c.verify.note}</span>}
                </div>
                <button className="btn btn-sm" onClick={() => setO({ ...o, claims: o.claims.map((x, k) => (k === i ? { ...x, removed: false } : x)) })}>↩ 원상복구</button>
              </div>
            ))}
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setO({ ...o, claims: o.claims.map((x) => ({ ...x, removed: false })), sections: o.sections.map((x) => ({ ...x, removed: false })) }); setShowRemoved(false); }}>모두 원상복구</button>
          </div>
        </Modal>
      )}
      <span className="tiny muted">승인하면 자동으로 이어져요: {estLine(e?.write) || "불러오는 중…"}</span>
    </div>
  );
}

/** 💬 확인사항 코멘트 칸 (예: 공식 자료로 다시 확인) → 반영해서 다시 확인 */
function CommentBox({ value, disabled, onSave, onRun }: { value?: string; disabled: boolean; onSave: (v: string) => void; onRun: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const run = (text = v) => text.trim() && onRun(text.trim());
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <input className="input" style={{ fontSize: 13, flex: 1, minWidth: 200 }} value={v} onChange={(ev) => setV(ev.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} onKeyDown={(ev) => ev.key === "Enter" && run()} placeholder="💬 확인 코멘트 (예: 공식 자료로 다시 확인해줘 · 2026년 기준으로)" aria-label="확인 코멘트" />
      {!v.includes("공식") && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { const t = [v.trim(), "공식 자료(정부·기관·기업 공식 사이트·언론)로 다시 확인해줘"].filter(Boolean).join(" · "); setV(t); onSave(t); }}>🏛 공식 자료로</button>}
      <button type="button" className="btn btn-sm" disabled={disabled || !v.trim()} onClick={() => run()}>💬 코멘트 반영해서 다시 확인</button>
    </div>
  );
}

/** 🔍 누르면 크게 보는 이미지 (바깥 누르기·Esc 로 닫기) */
function ZoomImg({ src, alt, style, referrerPolicy }: { src: string; alt: string; style?: React.CSSProperties; referrerPolicy?: React.HTMLAttributeReferrerPolicy }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} referrerPolicy={referrerPolicy} style={{ ...style, cursor: "zoom-in" }} onClick={() => setOpen(true)} title="눌러서 크게 보기" />
      {open && (
        <div role="dialog" aria-modal="true" aria-label="이미지 크게 보기" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} referrerPolicy={referrerPolicy} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, background: "#fff" }} />
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기" style={{ position: "fixed", top: 14, right: 16, border: 0, borderRadius: 999, width: 36, height: 36, background: "rgba(255,255,255,.9)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </>
  );
}
