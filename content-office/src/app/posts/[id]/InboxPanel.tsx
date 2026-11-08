"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/client-utils";

type Item = { id: string; kind: "text" | "image"; html: string; text: string; image_url: string; source: { site?: string; url?: string; title?: string }; used_at: string | null; created_at: string };
const SITE: Record<string, string> = { chatgpt: "ChatGPT", gemini: "제미나이" };
const when = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * 📥 받은 내용 (크롬 확장 프로그램으로 ChatGPT·제미나이에서 보낸 글·사진)
 * kind=text (④ 글): 커서 위치에 넣기 / 선택한 부분 바꾸기 · kind=image (⑤ 이미지): N번 자리에 쓰기 / 본문 커서 위치에 넣기
 */
export default function InboxPanel({ projectId, kind, slots = 0, onChanged }: { projectId: string; kind: "text" | "image"; slots?: number; onChanged?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Item[] }>(`/api/posts/${projectId}/inbox`)).items);
    } catch {
      /* 다음에 */
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    // 확장 프로그램으로 보내면 바로 보이게 (10초마다, 화면을 보고 있을 때만)
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 10000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const mine = items.filter((i) => (kind === "text" ? i.kind === "text" : i.kind === "image"));
  const fresh = mine.filter((i) => !i.used_at).length;

  async function post(body: Record<string, unknown>) {
    try {
      setItems((await api<{ items: Item[] }>(`/api/posts/${projectId}/inbox`, "POST", body)).items);
      return true;
    } catch (e) {
      setNote((e as Error).message);
      return false;
    }
  }
  function insert(it: Item) {
    const html = it.kind === "image" ? `<p><img src="${it.image_url}" alt="${SITE[it.source.site ?? ""] ?? "받은"} 사진"></p>` : it.html;
    window.dispatchEvent(new CustomEvent("co-editor-insert", { detail: { html, done: (how: string) => { void post({ action: "used", itemId: it.id, how }); setNote(`${how} · 작업 기록에 남겼어요.`); } } }));
  }

  return (
    <details className="card card-pad inbox" style={{ padding: 10, marginBottom: 10 }} open={fresh > 0}>
      <summary className="small" style={{ cursor: "pointer" }}>
        <b>📥 받은 {kind === "text" ? "글" : "사진"}</b> <span className="tiny muted">크롬 확장 프로그램으로 ChatGPT·제미나이에서 보낸 것</span>
        {fresh > 0 && <span className="badge badge-accent" style={{ marginLeft: 6 }}>새로 {fresh}</span>}
      </summary>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        {!mine.length && <div className="tiny muted">아직 받은 {kind === "text" ? "글" : "사진"}이 없어요. ChatGPT·제미나이 화면에서 &apos;📥 콘텐츠 오피스로&apos; 버튼이나 오른쪽 클릭 메뉴로 보내 보세요. (설치: 설정 → 🧩 크롬 확장 프로그램)</div>}
        {mine.map((it) => (
          <div key={it.id} className="card card-pad stack" style={{ gap: 6, padding: 8, opacity: it.used_at ? 0.65 : 1 }}>
            <div className="tiny muted row" style={{ gap: 6 }}>
              <span>{SITE[it.source.site ?? ""] ?? "확장 프로그램"} · {when(it.created_at)}</span>
              {it.source.title && <span className="ellipsis" style={{ maxWidth: 260 }}>· {it.source.title}</span>}
              {it.source.url && <a href={it.source.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>대화 열기</a>}
              {it.used_at && <span className="badge badge-ok">씀</span>}
            </div>
            {it.kind === "image" ? (
              <img src={it.image_url} alt="받은 사진" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, alignSelf: "flex-start" }} />
            ) : open === it.id ? (
              <div className="prose" style={{ fontSize: 13, maxHeight: 320, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: it.html }} />
            ) : (
              <div className="small" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{it.text}</div>
            )}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {it.kind === "text" && <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === it.id ? null : it.id)}>{open === it.id ? "접기" : "전체 보기"}</button>}
              <button className="btn btn-sm btn-primary" onClick={() => insert(it)} title="편집기에서 넣을 곳을 클릭하거나, 바꿀 부분을 드래그해 고른 뒤 누르세요">
                {it.kind === "text" ? "📝 커서 위치에 넣기 / 선택한 부분 바꾸기" : "📝 본문 커서 위치에 넣기"}
              </button>
              {it.kind === "image" && Array.from({ length: slots }, (_, s) => (
                <button key={s} className="btn btn-sm" onClick={async () => { if (await post({ action: "slot", itemId: it.id, slot: s })) { setNote(`이미지 ${s + 1}번 자리에 넣었어요.`); onChanged?.(); } }}>{s + 1}번 자리에 쓰기</button>
              ))}
              {it.kind === "text" && <button className="btn btn-sm btn-ghost" onClick={async () => { await navigator.clipboard.writeText(it.text); setNote("복사했어요."); }}>복사</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => confirm("받은 내용에서 지울까요?") && void post({ action: "delete", itemId: it.id })}>✕</button>
            </div>
          </div>
        ))}
        {note && <div className="tiny muted">{note}</div>}
        {kind === "text" && !!mine.length && <div className="tiny muted">넣을 곳을 편집기에서 한 번 클릭(또는 바꿀 부분을 드래그)한 다음 버튼을 누르세요. 넣은 뒤에도 ↶ 실행 취소·버전 기록으로 되돌릴 수 있어요.</div>}
      </div>
    </details>
  );
}
