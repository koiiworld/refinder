import "server-only";
import { q } from "./db";
import { activeJobs, getBlog, getDocument, getProject } from "./repo";
import { connectionStatus } from "./ai/providers";

/** 프로젝트 화면에 필요한 모든 데이터 */
export async function projectBundle(id: string) {
  const project = await getProject(id);
  if (!project) return null;
  const [blog, document, versions, approvals, reviews, events, jobs, runs] = await Promise.all([
    getBlog(project.blog_id),
    getDocument(id),
    q(
      `SELECT id, kind, number, title, source, label, provider, model, created_at, LENGTH(content) AS size
       FROM versions WHERE project_id=$1 ORDER BY kind, number DESC`,
      [id],
    ),
    q("SELECT * FROM approvals WHERE project_id=$1 ORDER BY created_at DESC", [id]),
    q("SELECT * FROM reviews WHERE project_id=$1 ORDER BY created_at DESC", [id]),
    q("SELECT * FROM events WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100", [id]),
    activeJobs(id),
    q("SELECT * FROM ai_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50", [id]),
  ]);
  return { project, blog, document, versions, approvals, reviews, events, jobs, runs, connections: connectionStatus() };
}

export type ProjectBundle = NonNullable<Awaited<ReturnType<typeof projectBundle>>>;
