"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AiRoles, Blog, RoleKey } from "@/lib/types";
import { PROVIDERS, api } from "./client-utils";

const ROLES: [RoleKey, string, string][] = [
  ["planner", "기획 담당", "SEO 제목·키워드·목차 기획"],
  ["writer", "원고 작성", "블로그 문체로 본문 작성·수정"],
  ["reviewer", "교차 검수", "사실관계·출처·규칙 점검 (작성 AI와 다르게 권장)"],
  ["editor", "부분 수정", "에디터에서 선택한 문단 수정"],
  ["ideas", "글감 추천", "연구소의 AI 글감 추천"],
  ["prompter", "프롬프트 수정", "프롬프트 수정실에서 프롬프트 다듬기"],
];

const DEFAULT_ROLES: AiRoles = {
  planner: { provider: "google", model: "gemini-3.5-flash" },
  writer: { provider: "anthropic", model: "claude-sonnet-5-5" },
  reviewer: { provider: "openai", model: "gpt-5" },
  editor: { provider: "anthropic", model: "claude-sonnet-5-5" },
  ideas: { provider: "google", model: "gemini-3.5-flash" },
  prompter: { provider: "google", model: "gemini-3.5-flash" },
};

export default function BlogForm({ blog, connections }: { blog?: Blog; connections: { provider: string; connected: boolean }[] }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: blog?.name ?? "",
    platform: blog?.platform ?? "naver",
    url: blog?.url ?? "",
    category: blog?.category ?? "",
    description: blog?.description ?? "",
    color: blog?.color ?? "#7c3aed",
    style_guide: blog?.style_guide ?? "",
    review_rules: (blog?.review_rules ?? ["확인되지 않은 수치·통계를 단정적으로 쓰지 않는다", "출처가 필요한 주장에는 출처를 표기하거나 '확인 필요'로 남긴다"]).join("\n"),
    image_style: blog?.image_style ?? "",
    image_source: (blog?.image_source ?? "ai") as "ai" | "official",
    ai_roles: { ...DEFAULT_ROLES, ...(blog?.ai_roles ?? {}) } as AiRoles,
    archived: blog?.archived ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const conn = (p: string) => p === "template" || connections.find((c) => c.provider === p)?.connected;

  async function submit() {
    setBusy(true);
    setMsg(null);
    const payload = { ...f, review_rules: f.review_rules.split("\n").map((s) => s.trim()).filter(Boolean) };
    try {
      if (blog) {
        await api(`/api/blogs/${blog.id}`, "PUT", payload);
        setMsg({ ok: true, text: "저장했습니다. 이후 작업부터 적용됩니다." });
        router.refresh();
      } else {
        const r = await api<{ id: string }>("/api/blogs", "POST", payload);
        router.push(`/blogs/${r.id}`);
        router.refresh();
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad grid grid-2">
        <div className="field"><label className="label">블로그 이름 *</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field">
          <label className="label">플랫폼</label>
          <select className="select" value={f.platform} onChange={(e) => set("platform", e.target.value)}>
            <option value="naver">네이버 블로그</option><option value="tistory">티스토리</option><option value="wordpress">워드프레스</option><option value="other">기타</option>
          </select>
        </div>
        <div className="field"><label className="label">블로그 주소</label><input className="input" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></div>
        <div className="field"><label className="label">주제 분야</label><input className="input" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="예: 여행·숙소 후기" /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label className="label">설명</label><input className="input" value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="field"><label className="label">구분 색상</label><input type="color" className="input" style={{ height: 40, padding: 4 }} value={f.color} onChange={(e) => set("color", e.target.value)} /></div>
        {blog && (
          <label className="check small" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={f.archived} onChange={(e) => set("archived", e.target.checked)} /> 보관(운영 중지) — 목록에서 숨김
          </label>
        )}
      </section>

      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>작성 문체</h3>
        <textarea className="textarea" style={{ minHeight: 110 }} value={f.style_guide} onChange={(e) => set("style_guide", e.target.value)} placeholder="말투, 문단 길이, 금지 표현, 자주 쓰는 구성 등" />
        <h3 style={{ fontSize: 15 }}>검수 규칙 (한 줄에 하나)</h3>
        <textarea className="textarea" style={{ minHeight: 110 }} value={f.review_rules} onChange={(e) => set("review_rules", e.target.value)} />
        <h3 style={{ fontSize: 15 }}>이미지 방식</h3>
        <select className="select" value={f.image_source} onChange={(e) => set("image_source", e.target.value)} aria-label="이미지 방식">
          <option value="ai">AI로 생성 (Higgsfield) — 요리·일상처럼 연출 사진이 필요한 글</option>
          <option value="official">공식 홈페이지 이미지 — 실제 제품을 다루는 글 (출처 표기)</option>
        </select>
        <h3 style={{ fontSize: 15 }}>이미지 스타일 {f.image_source === "official" && <span className="tiny muted">(공식 이미지 방식에서는 쓰지 않음)</span>}</h3>
        <textarea className="textarea" value={f.image_style} onChange={(e) => set("image_style", e.target.value)} placeholder="톤, 구도, 비율 등 (이미지 스튜디오·기획안에 사용)" />
      </section>

      {msg && <div className={`notice small ${msg.ok ? "notice-ok" : "notice-bad"}`}>{msg.text}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={submit}>{busy ? <span className="spinner" /> : blog ? "설정 저장" : "블로그 추가"}</button>
      </div>
    </div>
  );
}
