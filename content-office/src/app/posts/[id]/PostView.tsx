"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PostBundle } from "@/lib/post-bundle";
import type { PostExtras, PostPlan } from "@/lib/posts-types";
import { stageLabel, stageStep } from "@/lib/steps";
import { api, useToast } from "@/components/client-utils";
import { BlogTag, fmtDate, Steps } from "@/components/ui";
import DocEditor from "@/components/DocEditor";

type Review = {
  summary: string;
  score: number | null;
  issues: { type: string; severity: string; quote: string; comment: string; suggestion: string }[];
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
  const generating = extras.images.some((im) => im.mediaJobId && !im.url);
  const doc = b.document;
  const title = doc?.title || plan?.selectedTitle || p.title;

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
        <Section n={3} title="SEO 제목" ai={plan?.ai} right={plan && !running && <button className="btn btn-sm" onClick={() => confirm("제목부터 다시 만들까요? 글·검수도 다시 진행됩니다.") && act({ action: "rerun", step: "titles" }, "제목부터 다시 진행합니다.")}>제목부터 다시</button>}>
          {!plan ? (
            <p className="small muted">{running ? "AI가 네이버 연관 키워드 검색량을 보고 제목 후보를 만들고 있습니다…" : "아직 제목이 없습니다."}</p>
          ) : (
            <TitlePicker plan={plan} current={title} disabled={running} onPick={(payload) => act({ action: "select_title", ...payload }, "제목을 바꿨습니다.")} />
          )}
        </Section>

        {/* ④ 글 */}
        <Section n={4} title="글 (해시태그 포함)" ai={extras.writer}>
          {doc || plan ? (
            <div className="stack">
              <DocEditor
                key={p.id}
                projectId={p.id}
                serverDoc={doc}
                locked={running}
                lockedReason="AI 작업 중에는 편집이 잠깁니다. 끝나면 자동으로 풀립니다."
                connections={b.connections}
                onSaved={() => void refresh()}
              />
              <Hashtags tags={extras.hashtags} disabled={running} onSave={(hashtags) => act({ action: "hashtags", hashtags }, "해시태그를 저장했습니다.")} />
              {doc?.content_html && !running && <Rewrite onRun={(feedback) => act({ action: "rerun", step: "write", feedback }, "글을 다시 씁니다.")} />}
            </div>
          ) : (
            <p className="small muted">제목이 정해지면 AI가 글을 씁니다.</p>
          )}
        </Section>

        {/* ⑤ 이미지 */}
        <Section n={5} title="이미지 (Higgsfield)">
          {!extras.images.length ? (
            <p className="small muted">글이 완성되면 AI가 이미지 프롬프트를 만들어 둡니다.</p>
          ) : (
            <div className="stack">
              <p className="small muted">
                AI가 글 내용에 맞는 이미지 프롬프트를 만들었습니다. <b>생성은 자동으로 하지 않습니다</b>. 필요한 것만 "생성"을 누르세요(Higgsfield 크레딧 차감). 생성되면 "본문에 넣기"로 글의 [이미지 N] 자리에 넣습니다.
                {!higgsfield && " · 지금은 Higgsfield가 연결되지 않아 프롬프트를 복사해서 Higgsfield 사이트에서 만들 수 있습니다."}
              </p>
              {extras.images.map((im, i) => (
                <ImageCard key={i} index={i} im={im} higgsfield={higgsfield} disabled={running} act={act} copy={copy} />
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
            <ReviewView review={review} rereview={p.needs_rereview} imagesNow={extras.images.filter((i) => i.url).length} />
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
            if (!confirm("이 글을 삭제할까요? 키워드는 다시 선택할 수 있게 돌아갑니다.")) return;
            await api(`/api/posts/${p.id}`, "DELETE");
            router.push("/posts");
            router.refresh();
          }}
        >
          글 삭제
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

function TitlePicker({ plan, current, disabled, onPick }: { plan: PostPlan; current: string; disabled: boolean; onPick: (p: { index?: number; title?: string }) => void }) {
  const [own, setOwn] = useState("");
  return (
    <div className="stack" style={{ gap: 8 }}>
      {plan.candidates.map((c, i) => (
        <label key={i} className="card card-pad row" style={{ flexWrap: "nowrap", alignItems: "flex-start", cursor: disabled ? "default" : "pointer", borderColor: c.title === current ? "var(--accent)" : undefined, background: c.title === current ? "var(--accent-soft)" : undefined, padding: 10 }}>
          <input type="radio" name="title" checked={c.title === current} disabled={disabled} onChange={() => onPick({ index: i })} style={{ marginTop: 3 }} />
          <div>
            <div className="strong small">{c.title} {i === plan.best && <span className="badge badge-accent">AI 선택</span>}</div>
            <div className="tiny muted">{c.reason}</div>
          </div>
        </label>
      ))}
      {plan.bestReason && <p className="tiny muted">AI가 고른 이유: {plan.bestReason}</p>}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" placeholder="제목 직접 입력" value={own} disabled={disabled} onChange={(e) => setOwn(e.target.value)} />
        <button className="btn btn-sm" disabled={disabled || !own.trim()} onClick={() => { onPick({ title: own }); setOwn(""); }}>이 제목으로</button>
      </div>
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

function ImageCard({ index, im, higgsfield, disabled, act, copy }: { index: number; im: PostExtras["images"][number]; higgsfield: boolean; disabled: boolean; act: (p: Record<string, unknown>, m?: string) => Promise<boolean>; copy: (t: string, w: string) => void }) {
  const [prompt, setPrompt] = useState(im.prompt);
  useEffect(() => setPrompt(im.prompt), [im.prompt]);
  const generating = !!im.mediaJobId && !im.url;
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between">
        <span className="strong small">이미지 {index + 1} · {im.alt}</span>
        <div className="row" style={{ gap: 4 }}>
          <select className="select" style={{ width: 90 }} value={im.aspect} disabled={disabled || generating} onChange={(e) => act({ action: "image_prompt", index, aspect: e.target.value })} aria-label="비율">
            {["1:1", "4:3", "3:4", "16:9", "9:16"].map((a) => <option key={a}>{a}</option>)}
          </select>
          {im.inserted && <span className="badge badge-ok">본문에 넣음</span>}
        </div>
      </div>
      <textarea className="textarea mono" style={{ minHeight: 64, fontSize: 12 }} value={prompt} disabled={disabled || generating} onChange={(e) => setPrompt(e.target.value)} aria-label="이미지 프롬프트" />
      <div className="row">
        {prompt !== im.prompt && <button className="btn btn-sm" onClick={() => act({ action: "image_prompt", index, prompt }, "프롬프트를 저장했습니다.")}>프롬프트 저장</button>}
        <button className="btn btn-sm" onClick={() => copy(prompt, "프롬프트")}>프롬프트 복사</button>
        {higgsfield && (
          <button
            className="btn btn-sm btn-primary"
            disabled={disabled || generating || prompt !== im.prompt}
            onClick={() => confirm(`이미지 ${index + 1}을 Higgsfield로 생성할까요? 크레딧이 차감됩니다.`) && act({ action: "generate_image", index }, "이미지 생성을 시작했습니다.")}
          >
            {generating ? <><span className="spinner" /> 생성 중…</> : im.url ? "다시 생성" : "Higgsfield로 생성"}
          </button>
        )}
        {im.url && <button className="btn btn-sm btn-ok" disabled={disabled} onClick={() => act({ action: "insert_image", index }, "본문에 넣었습니다.")}>{im.inserted ? "다시 넣기" : "본문에 넣기"}</button>}
      </div>
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

function ReviewView({ review, rereview, imagesNow }: { review: Review; rereview: boolean; imagesNow: number }) {
  const sev: Record<string, string> = { high: "badge-bad", medium: "badge-warn", low: "" };
  return (
    <div className="stack" style={{ gap: 10 }}>
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
