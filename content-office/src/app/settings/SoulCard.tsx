"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client-utils";
import RefPicker from "@/components/RefPicker";

type Soul = { id: string; name: string; version: string; status: string; created_at: string; error?: string | null };
const STATUS: Record<string, string> = { not_ready: "준비 중", queued: "대기 중", in_progress: "학습 중", completed: "사용 가능", failed: "실패" };

/** Higgsfield Soul ID(내 캐릭터): 같은 인물 사진으로 한 번 학습 → SOUL 모델에서 같은 캐릭터로 계속 생성 */
export default function SoulCard({ initial, connected }: { initial: Soul[]; connected: boolean }) {
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("v1");
  const [refs, setRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const training = list.some((s) => !["completed", "failed"].includes(s.status));
  useEffect(() => {
    if (!training) return;
    const t = setInterval(async () => setList(await api<Soul[]>("/api/souls").catch(() => list)), 15000);
    return () => clearInterval(t);
  }, [training]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!confirm(`'${name}' 캐릭터를 Higgsfield에서 학습시킬까요?\n\n⚠️ 학습 비용은 Higgsfield 공식 문서에 나와 있지 않아요. 크레딧이 차감될 수 있으니, 만든 뒤 Higgsfield 사이트에서 사용량을 꼭 확인해 주세요.\n사진 ${refs.length}장을 보냅니다.`)) return;
    setBusy(true);
    setErr("");
    try {
      setList(await api<Soul[]>("/api/souls", "POST", { name, version, refIds: refs, confirm: true }));
      setName("");
      setRefs([]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <section id="souls" className="card">
      <div className="card-head"><h2>내 캐릭터 (Higgsfield Soul ID)</h2></div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <p className="tiny muted">같은 인물(또는 캐릭터) 사진을 올려 한 번 학습시키면, SOUL · SOUL V2 · SOUL Cinema 모델에서 그 캐릭터를 계속 같은 얼굴로 그려요. 블로그 컨셉 키트의 &apos;기본 캐릭터&apos;로 고르거나 이미지마다 고를 수 있어요. 학습 비용은 공식 문서에 없어서 만들 때 한 번 더 확인해요.</p>
        {list.map((s) => (
          <div key={s.id} className="row between" style={{ flexWrap: "nowrap", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="small"><b>{s.name}</b> <span className="tiny muted">{s.version} · {new Date(s.created_at).toLocaleDateString("ko-KR")}{s.error ? ` · ${s.error}` : ""}</span></span>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${s.status === "completed" ? "badge-ok" : s.status === "failed" ? "badge-bad" : ""}`}>{STATUS[s.status] ?? s.status}</span>
              <button className="btn btn-sm btn-ghost" onClick={async () => confirm("목록에서 지울까요? (Higgsfield 계정의 캐릭터는 그대로 남아요)") && setList(await api<Soul[]>("/api/souls", "POST", { remove: s.id }))}>빼기</button>
            </div>
          </div>
        ))}
        <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <b className="small">새 캐릭터 만들기</b>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ maxWidth: 220 }} value={name} maxLength={100} placeholder="이름 (예: 모찌)" onChange={(e) => setName(e.target.value)} aria-label="캐릭터 이름" />
            <select className="select" style={{ width: 150 }} value={version} onChange={(e) => setVersion(e.target.value)} aria-label="모델 종류">
              <option value="v1">SOUL용</option>
              <option value="v2">SOUL V2용</option>
              <option value="cinema">SOUL Cinema용</option>
            </select>
          </div>
          <RefPicker ids={refs} max={20} label="캐릭터 사진 (같은 인물, 여러 각도)" onChange={setRefs} />
          {err && <div className="notice notice-bad small">{err}</div>}
          <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={!connected || busy || !name.trim() || !refs.length} onClick={create}>{busy ? <span className="spinner" /> : "캐릭터 학습시키기"}</button>
          {!connected && <span className="tiny muted">Higgsfield 키를 먼저 연결하세요.</span>}
        </div>
      </div>
    </section>
  );
}
