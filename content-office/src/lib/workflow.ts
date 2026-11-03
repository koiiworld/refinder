import "server-only";
import { q, newId, j } from "./db";
import type { Plan, RoleAssignment, Source } from "./types";
import {
  addEvent,
  createVersion,
  getDocument,
  getProject,
  getVersion,
  recordApproval,
  updateProject,
} from "./repo";
import { enqueue } from "./jobs";
import { stageDef } from "./stages";

export class WorkflowError extends Error {}

export async function createProject(input: {
  blogId: string;
  title: string;
  topic?: string;
  brief?: string;
  sources?: Source[];
  scheduledDate?: string | null;
  ideaId?: string | null;
  autoApproveTopic?: boolean;
}) {
  if (!input.title?.trim()) throw new WorkflowError("제목(주제)을 입력하세요.");
  const id = newId("prj_");
  await q(
    `INSERT INTO projects (id, blog_id, idea_id, title, topic, brief, sources, scheduled_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.blogId,
      input.ideaId ?? null,
      input.title.trim(),
      (input.topic ?? input.title).trim(),
      input.brief ?? "",
      j(input.sources ?? []),
      input.scheduledDate || null,
    ],
  );
  await addEvent(id, "create", "프로젝트 생성");
  if (input.autoApproveTopic) {
    await approve(id, "글감 연구소에서 주제 승인");
  }
  return id;
}

/** 각 단계의 '승인' */
export async function approve(projectId: string, comment = "", opts: { acknowledgeChanges?: boolean } = {}) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  if (p.status === "running") throw new WorkflowError("AI 작업이 진행 중입니다. 완료 후 승인하세요.");

  switch (p.stage) {
    case "topic_approval":
      await recordApproval(p.id, p.stage, "approved", comment);
      await updateProject(p.id, { stage: "planning", status: "running", status_message: "" });
      await enqueue("plan", { projectId: p.id });
      break;
    case "plan_approval": {
      if (!p.plan) throw new WorkflowError("기획안이 없습니다.");
      const ver = await q<{ id: string }>(
        "SELECT id FROM versions WHERE project_id=$1 AND kind='plan' ORDER BY number DESC LIMIT 1",
        [p.id],
      );
      await recordApproval(p.id, p.stage, "approved", comment, ver[0]?.id ?? null);
      await updateProject(p.id, { stage: "drafting", status: "running", status_message: "" });
      await enqueue("draft", { projectId: p.id });
      break;
    }
    case "draft_approval": {
      const doc = await getDocument(p.id);
      if (!doc?.content_html.trim()) throw new WorkflowError("원고가 비어 있습니다.");
      if (doc.pending_proposal_id) throw new WorkflowError("보류 중인 AI 제안 원고가 있습니다. 적용 또는 폐기 후 승인하세요.");
      const ver = await createVersion({
        projectId: p.id,
        kind: "draft",
        title: doc.title,
        content: doc.content_html,
        source: "user",
        label: "원고 승인본",
      });
      await recordApproval(p.id, p.stage, "approved", comment, ver.id);
      await updateProject(p.id, { stage: "images", approved_version_id: ver.id, needs_rereview: false, status: "waiting" });
      break;
    }
    case "image_approval":
      await recordApproval(p.id, p.stage, "approved", comment);
      await updateProject(p.id, { stage: "packaging", status: "running" });
      await enqueue("package", { projectId: p.id });
      break;
    case "final_approval": {
      if (p.needs_rereview && !opts.acknowledgeChanges) {
        throw new WorkflowError("원고 승인 이후 변경된 내용이 있습니다. 재검수를 실행하거나 '변경 내용 확인함'을 체크하세요.");
      }
      await recordApproval(
        p.id,
        p.stage,
        "approved",
        comment + (p.needs_rereview ? " [재검수 없이 변경 내용 확인 후 승인]" : ""),
        p.package?.versionId ?? null,
      );
      await updateProject(p.id, { stage: "done", status: "done", status_message: "" });
      break;
    }
    default:
      throw new WorkflowError(`'${stageDef(p.stage).label}' 단계는 승인 대상이 아닙니다.`);
  }
  await addEvent(p.id, "approval", `${stageDef(p.stage).label} 승인${comment ? `: ${comment}` : ""}`);
}

/** 수정 요청 → 해당 AI 작업 재실행 (피드백 반영) */
export async function requestChanges(projectId: string, feedback: string, override?: RoleAssignment | null) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  if (!feedback.trim()) throw new WorkflowError("수정 요청 내용을 입력하세요.");
  if (p.status === "running") throw new WorkflowError("AI 작업이 진행 중입니다.");
  await recordApproval(p.id, p.stage, "changes_requested", feedback);
  switch (p.stage) {
    case "topic_approval":
      await updateProject(p.id, { brief: [p.brief, `[수정 요청] ${feedback}`].filter(Boolean).join("\n") });
      break;
    case "plan_approval":
      await updateProject(p.id, { stage: "planning", status: "running" });
      await enqueue("plan", { projectId: p.id, payload: { feedback, override } });
      break;
    case "draft_approval":
      await updateProject(p.id, { stage: "drafting", status: "running" });
      await enqueue("draft", { projectId: p.id, payload: { feedback, override } });
      break;
    case "image_approval":
      await updateProject(p.id, { stage: "images", status: "waiting" });
      break;
    case "final_approval":
      await updateProject(p.id, { stage: "draft_approval", status: "waiting" });
      break;
    default:
      throw new WorkflowError("이 단계에서는 수정 요청을 할 수 없습니다.");
  }
  await addEvent(p.id, "approval", `${stageDef(p.stage).label} 수정 요청: ${feedback}`);
}

export async function reject(projectId: string, comment: string) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  await recordApproval(p.id, p.stage, "rejected", comment);
  await updateProject(p.id, { stage: "rejected", status: "done", status_message: comment });
  await addEvent(p.id, "approval", `${stageDef(p.stage).label}에서 반려${comment ? `: ${comment}` : ""}`);
}

/** 작업 재실행 (실패했거나 다시 돌리고 싶을 때) */
export async function rerun(projectId: string, step: "plan" | "draft" | "review" | "package", override?: RoleAssignment | null) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  const running = await q("SELECT id FROM jobs WHERE project_id=$1 AND status IN ('queued','running')", [p.id]);
  if (running.length) throw new WorkflowError("이미 진행 중인 작업이 있습니다.");
  const stageFor = { plan: "planning", draft: "drafting", review: null, package: "packaging" }[step];
  if (step === "draft" && !p.plan) throw new WorkflowError("기획안이 먼저 필요합니다.");
  if (step === "review") {
    const doc = await getDocument(p.id);
    if (!doc?.content_html.trim()) throw new WorkflowError("검수할 원고가 없습니다.");
  }
  // 재검수는 단계를 바꾸지 않음 (원고 승인 전이면 검수 단계로)
  const patch: Record<string, unknown> = { status: "running", status_message: "" };
  if (stageFor) patch.stage = stageFor;
  else if (p.stage === "draft_approval" || p.stage === "reviewing") patch.stage = "reviewing";
  await updateProject(p.id, patch);
  await enqueue(step, { projectId: p.id, payload: { override } });
  await addEvent(
    p.id,
    "rerun",
    `${{ plan: "기획안", draft: "원고", review: "검수", package: "패키지" }[step]} 재실행${override ? ` (${override.provider}/${override.model})` : ""}`,
  );
}

/** 2차 기능 단계(이미지·캐러셀)를 수동 완료/건너뛰기 */
export async function completeManualStage(projectId: string) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  if (p.stage === "images") {
    await recordApproval(p.id, "images", "skipped", "이미지 수동 작업 완료 처리");
    await updateProject(p.id, { stage: "image_approval" });
  } else if (p.stage === "carousel") {
    await recordApproval(p.id, "carousel", "skipped", "캐러셀 제작 건너뜀 (2차 기능)");
    await updateProject(p.id, { stage: "final_approval" });
  } else throw new WorkflowError("수동 완료할 수 있는 단계가 아닙니다.");
  await addEvent(p.id, "stage", `${stageDef(p.stage).label} 완료 처리`);
}

/** 이전 버전 복원 — 복원 전 현재 상태를 버전으로 백업 */
export async function restoreVersion(projectId: string, versionId: string) {
  const p = await getProject(projectId);
  const v = await getVersion(versionId);
  if (!p || !v || v.project_id !== projectId) throw new WorkflowError("버전을 찾을 수 없습니다.");
  if (v.kind === "plan") {
    if (p.plan) {
      await createVersion({ projectId, kind: "plan", title: p.plan.selectedTitle, content: JSON.stringify(p.plan), source: "user", label: "복원 전 백업" });
    }
    const plan = JSON.parse(v.content) as Plan;
    await updateProject(projectId, { plan });
    await createVersion({ projectId, kind: "plan", title: plan.selectedTitle, content: v.content, source: "restore", label: `v${v.number} 복원` });
  } else {
    const doc = await getDocument(projectId);
    if (doc?.content_html) {
      await createVersion({ projectId, kind: "draft", title: doc.title, content: doc.content_html, source: "user", label: "복원 전 백업" });
    }
    await q(
      `INSERT INTO documents (project_id, title, content_html, last_editor, user_edited_at, revision)
       VALUES ($1,$2,$3,'user',NOW(),1)
       ON CONFLICT (project_id) DO UPDATE SET title=EXCLUDED.title, content_html=EXCLUDED.content_html,
         last_editor='user', user_edited_at=NOW(), revision=documents.revision+1, updated_at=NOW()`,
      [projectId, v.title, v.content],
    );
    await createVersion({ projectId, kind: "draft", title: v.title, content: v.content, source: "restore", label: `v${v.number} 복원` });
    if (p.approved_version_id) {
      const approved = await getVersion(p.approved_version_id);
      if (approved && approved.content !== v.content && p.stage !== "draft_approval") await updateProject(projectId, { needs_rereview: true });
    }
  }
  await addEvent(projectId, "restore", `${v.kind === "plan" ? "기획안" : "원고"} v${v.number} 복원`);
}

/** 사용자 수정 보호로 보류된 AI 제안 원고 적용/폐기 */
export async function resolveProposal(projectId: string, apply: boolean) {
  const doc = await getDocument(projectId);
  if (!doc?.pending_proposal_id) throw new WorkflowError("보류 중인 제안이 없습니다.");
  const v = await getVersion(doc.pending_proposal_id);
  if (apply && v) {
    await createVersion({ projectId, kind: "draft", title: doc.title, content: doc.content_html, source: "user", label: "AI 제안 적용 전 백업" });
    await q(
      `UPDATE documents SET content_html=$2, last_editor='ai', ai_written_at=NOW(), pending_proposal_id=NULL,
         revision=revision+1, updated_at=NOW() WHERE project_id=$1`,
      [projectId, v.content],
    );
    await addEvent(projectId, "proposal", `AI 제안 원고 v${v.number} 적용`);
  } else {
    await q("UPDATE documents SET pending_proposal_id=NULL WHERE project_id=$1", [projectId]);
    await addEvent(projectId, "proposal", "AI 제안 원고 폐기 (사용자 원고 유지)");
  }
}

export async function savePlan(projectId: string, plan: Plan) {
  const p = await getProject(projectId);
  if (!p) throw new WorkflowError("프로젝트 없음");
  await updateProject(projectId, { plan });
  const v = await createVersion({ projectId, kind: "plan", title: plan.selectedTitle, content: JSON.stringify(plan), source: "user", label: "직접 수정" });
  await addEvent(projectId, "edit", `기획안 직접 수정 (v${v.number})`);
}
