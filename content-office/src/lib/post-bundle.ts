import "server-only";
import { q } from "./db";
import { activeJobs, getBlog, getDocument, getProject } from "./repo";
import { refreshMediaJob } from "./media";
import { setImage } from "./workflow";
import { connectionStatus } from "./ai/providers";
import type { PostExtras } from "./posts-types";

/** 글 상세 화면 데이터. 생성 중인 이미지는 Higgsfield 에 상태를 물어 갱신 */
export async function postBundle(id: string) {
  let project = await getProject(id);
  if (!project) return null;
  const extras = project.package as unknown as PostExtras | null;
  let changed = false;
  for (const [i, im] of (extras?.images ?? []).entries()) {
    if (im.mediaJobId && !im.url) {
      const mj = await refreshMediaJob(im.mediaJobId);
      if (mj?.status === "completed" && mj.urls[0]) {
        await setImage(id, i, { url: mj.urls[0] });
        changed = true;
      }
    }
  }
  if (changed) project = (await getProject(id))!;
  const [blog, document, reviews, events, jobs, media] = await Promise.all([
    getBlog(project.blog_id),
    getDocument(id),
    q("SELECT * FROM reviews WHERE project_id=$1 ORDER BY created_at DESC LIMIT 5", [id]),
    q("SELECT * FROM events WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50", [id]),
    activeJobs(id),
    q("SELECT id, status, error, urls FROM media_jobs WHERE project_id=$1", [id]),
  ]);
  return { project, blog, document, reviews, events, jobs, media, connections: connectionStatus() };
}

export type PostBundle = NonNullable<Awaited<ReturnType<typeof postBundle>>>;
