import "server-only";
import { q, q1, newId, j } from "./db";
import type { Blog, DocumentRow, Idea, Job, Project, Version } from "./types";
import { isAfterDraftApproval } from "./stages";

export async function listBlogs(includeArchived = false) {
  return q<Blog>(
    `SELECT * FROM blogs ${includeArchived ? "" : "WHERE archived = FALSE"} ORDER BY created_at, name`,
  );
}

export async function getBlog(id: string) {
  return q1<Blog>("SELECT * FROM blogs WHERE id=$1", [id]);
}

/** 말투 예시 파일(사용 중인 것)을 붙인 블로그 — AI 작업 전용 */
export async function getBlogForAi(id: string) {
  const blog = await getBlog(id);
  if (!blog) return null;
  blog.style_samples = await q<{ filename: string; content: string }>(
    "SELECT filename, content FROM blog_samples WHERE blog_id=$1 AND enabled=TRUE ORDER BY created_at",
    [id],
  );
  return blog;
}

export async function getProject(id: string) {
  return q1<Project>("SELECT * FROM projects WHERE id=$1", [id]);
}

export async function getDocument(projectId: string) {
  return q1<DocumentRow>("SELECT * FROM documents WHERE project_id=$1", [projectId]);
}

export async function getVersion(id: string) {
  return q1<Version>("SELECT * FROM versions WHERE id=$1", [id]);
}

export async function listVersions(projectId: string, kind?: "plan" | "draft") {
  return q<Version>(
    `SELECT * FROM versions WHERE project_id=$1 ${kind ? "AND kind=$2" : ""} ORDER BY kind, number DESC`,
    kind ? [projectId, kind] : [projectId],
  );
}

export async function listIdeas(blogId?: string) {
  return q<Idea>(
    `SELECT * FROM ideas ${blogId ? "WHERE blog_id=$1" : ""} ORDER BY created_at DESC`,
    blogId ? [blogId] : [],
  );
}

export async function activeJobs(projectId: string) {
  return q<Job>(
    "SELECT * FROM jobs WHERE project_id=$1 AND status IN ('queued','running') ORDER BY created_at",
    [projectId],
  );
}

export async function addEvent(projectId: string | null, type: string, message: string) {
  await q("INSERT INTO events (id, project_id, type, message) VALUES ($1,$2,$3,$4)", [
    newId("ev_"),
    projectId,
    type,
    message,
  ]);
}

export async function updateProject(id: string, patch: Partial<Record<keyof Project, unknown>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const jsonKeys = new Set(["plan", "review", "sources", "package"]);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const vals = keys.map((k) => (jsonKeys.has(k) ? j((patch as Record<string, unknown>)[k]) : (patch as Record<string, unknown>)[k]));
  await q(`UPDATE projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, [id, ...vals]);
}

export async function createVersion(v: {
  projectId: string;
  kind: "plan" | "draft";
  title: string;
  content: string;
  source: string;
  label?: string;
  provider?: string | null;
  model?: string | null;
}): Promise<Version> {
  const row = await q1<{ n: number }>(
    "SELECT COALESCE(MAX(number),0)::int AS n FROM versions WHERE project_id=$1 AND kind=$2",
    [v.projectId, v.kind],
  );
  const id = newId("ver_");
  const rows = await q<Version>(
    `INSERT INTO versions (id, project_id, kind, number, title, content, source, label, provider, model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, v.projectId, v.kind, Number(row?.n ?? 0) + 1, v.title, v.content, v.source, v.label ?? "", v.provider ?? null, v.model ?? null],
  );
  return rows[0];
}

/**
 * AI가 만든 원고 반영 — 사용자 수정 보호 규칙:
 * 사용자가 마지막 AI 작성 이후 원고를 직접 고쳤다면 덮어쓰지 않고 '제안 버전'으로 보관합니다.
 */
export async function writeAiDraft(
  projectId: string,
  html: string,
  meta: { provider: string; model: string; label: string },
): Promise<{ version: Version; applied: boolean }> {
  const project = await getProject(projectId);
  const doc = await getDocument(projectId);
  const title = doc?.title || project?.plan?.selectedTitle || project?.title || "";
  const version = await createVersion({
    projectId,
    kind: "draft",
    title,
    content: html,
    source: "ai",
    label: meta.label,
    provider: meta.provider,
    model: meta.model,
  });
  const userEdited =
    !!doc &&
    doc.last_editor === "user" &&
    doc.content_html.trim() !== "" &&
    (!doc.ai_written_at || (doc.user_edited_at ?? "") > doc.ai_written_at);

  if (userEdited) {
    await q("UPDATE documents SET pending_proposal_id=$2, updated_at=NOW() WHERE project_id=$1", [projectId, version.id]);
    await addEvent(projectId, "protect", `사용자 수정 내용 보호: AI 원고 v${version.number}을(를) 제안으로 보관했습니다.`);
    return { version, applied: false };
  }
  if (doc) {
    await q(
      `UPDATE documents SET content_html=$2, title=$3, last_editor='ai', ai_written_at=NOW(),
         pending_proposal_id=NULL, revision=revision+1, updated_at=NOW() WHERE project_id=$1`,
      [projectId, html, title],
    );
  } else {
    await q(
      `INSERT INTO documents (project_id, title, content_html, last_editor, ai_written_at, revision)
       VALUES ($1,$2,$3,'ai',NOW(),1)`,
      [projectId, title, html],
    );
  }
  return { version, applied: true };
}

/** 사용자 저장 (에디터 자동 저장) */
export async function saveUserDocument(
  projectId: string,
  input: { html: string; title: string; revision: number },
): Promise<{ ok: true; revision: number; needsRereview: boolean } | { ok: false; conflict: true; current: DocumentRow }> {
  const doc = await getDocument(projectId);
  if (doc && doc.revision !== input.revision) return { ok: false, conflict: true, current: doc };
  let revision: number;
  if (doc) {
    const rows = await q<{ revision: number }>(
      `UPDATE documents SET content_html=$2, title=$3, last_editor='user', user_edited_at=NOW(),
         revision=revision+1, updated_at=NOW() WHERE project_id=$1 AND revision=$4 RETURNING revision`,
      [projectId, input.html, input.title, input.revision],
    );
    if (!rows.length) return { ok: false, conflict: true, current: (await getDocument(projectId))! };
    revision = rows[0].revision;
  } else {
    await q(
      `INSERT INTO documents (project_id, title, content_html, last_editor, user_edited_at, revision)
       VALUES ($1,$2,$3,'user',NOW(),1)`,
      [projectId, input.title, input.html],
    );
    revision = 1;
  }

  // 자동 버전 스냅샷: 마지막 원고 버전 후 10분 이상 지났고 내용이 바뀌었으면 저장
  const last = await q1<Version & { age: number }>(
    `SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age FROM versions
     WHERE project_id=$1 AND kind='draft' ORDER BY number DESC LIMIT 1`,
    [projectId],
  );
  if (!last || (last.content !== input.html && Number(last.age) > 600)) {
    await createVersion({ projectId, kind: "draft", title: input.title, content: input.html, source: "autosave", label: "자동 저장" });
  }

  // 승인 이후 변경 감지 → 재검수 필요 표시
  const project = await getProject(projectId);
  let needsRereview = false;
  if (project && project.approved_version_id && isAfterDraftApproval(project.stage)) {
    const approved = await getVersion(project.approved_version_id);
    needsRereview = !!approved && approved.content !== input.html;
    if (needsRereview !== project.needs_rereview) {
      await updateProject(projectId, { needs_rereview: needsRereview });
      if (needsRereview) await addEvent(projectId, "rereview", "승인된 원고가 수정되어 재검수가 필요합니다.");
    }
  }
  if (project) await q("UPDATE projects SET updated_at=NOW() WHERE id=$1", [projectId]);
  return { ok: true, revision, needsRereview };
}

export async function recordApproval(projectId: string, stage: string, decision: string, comment = "", versionId: string | null = null) {
  await q(
    "INSERT INTO approvals (id, project_id, stage, decision, comment, version_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [newId("apv_"), projectId, stage, decision, comment, versionId],
  );
}
