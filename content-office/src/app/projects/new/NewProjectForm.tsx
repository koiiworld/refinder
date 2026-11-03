"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewProjectForm({ blogs, defaultBlog }: { blogs: { id: string; name: string; color: string }[]; defaultBlog?: string }) {
  const router = useRouter();
  const [blogId, setBlogId] = useState(defaultBlog ?? blogs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [urls, setUrls] = useState("");
  const [date, setDate] = useState("");
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blogId, title, brief, urls: urls.split(/\s+/).filter(Boolean), scheduledDate: date || null, autoApproveTopic: auto }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "생성 실패");
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form className="card card-pad stack" onSubmit={submit}>
      <div className="field">
        <label className="label">블로그</label>
        <div className="row">
          {blogs.map((b) => (
            <button type="button" key={b.id} onClick={() => setBlogId(b.id)} className={`btn btn-sm ${blogId === b.id ? "btn-primary" : ""}`}>
              <span className="blog-dot" style={{ background: b.color }} /> {b.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="t">주제 / 가제목 *</label>
        <input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 갤럭시 버즈3 프로 3개월 사용 후기" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="b">요청사항 (AI에게 전달)</label>
        <textarea id="b" className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="강조할 내용, 직접 경험한 사실, 꼭 넣을 정보 등" />
      </div>
      <div className="field">
        <label className="label" htmlFor="u">참고·근거 자료 URL (줄바꿈으로 구분)</label>
        <textarea id="u" className="textarea" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://..." style={{ minHeight: 64 }} />
        <span className="tiny muted" style={{ marginTop: 4 }}>서버가 페이지 제목·설명을 실제로 수집하고 수집일을 함께 저장합니다. AI는 이 출처만 인용할 수 있습니다.</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="d">발행 예정일 (캘린더 표시)</label>
        <input id="d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
      </div>
      <label className="check small">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        주제를 바로 승인하고 기획안 작성 시작
      </label>
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          {busy ? <span className="spinner" /> : "프로젝트 만들기"}
        </button>
      </div>
    </form>
  );
}
