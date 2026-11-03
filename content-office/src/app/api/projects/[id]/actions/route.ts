import { approve, completeManualStage, reject, requestChanges, rerun, resolveProposal, restoreVersion, WorkflowError } from "@/lib/workflow";
import { projectBundle } from "@/lib/bundle";
import { q } from "@/lib/db";
import type { ProviderId, RoleAssignment } from "@/lib/types";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

/**
 * 승인형 워크플로 액션
 * approve | request_changes | reject | rerun | rereview | complete_stage | restore | apply_proposal | discard_proposal | cancel_jobs
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{
      action: string;
      comment?: string;
      step?: "plan" | "draft" | "review" | "package";
      provider?: ProviderId;
      model?: string;
      versionId?: string;
      acknowledgeChanges?: boolean;
    }>(req);
    const override: RoleAssignment | null = b.provider && b.model ? { provider: b.provider, model: b.model } : null;
    switch (b.action) {
      case "approve":
        await approve(id, b.comment ?? "", { acknowledgeChanges: b.acknowledgeChanges });
        break;
      case "request_changes":
        await requestChanges(id, b.comment ?? "", override);
        break;
      case "reject":
        await reject(id, b.comment ?? "");
        break;
      case "rerun":
        if (!b.step) throw new WorkflowError("재실행할 단계를 지정하세요.");
        await rerun(id, b.step, override);
        break;
      case "rereview":
        await rerun(id, "review", override);
        break;
      case "complete_stage":
        await completeManualStage(id);
        break;
      case "restore":
        if (!b.versionId) throw new WorkflowError("버전을 선택하세요.");
        await restoreVersion(id, b.versionId);
        break;
      case "apply_proposal":
        await resolveProposal(id, true);
        break;
      case "discard_proposal":
        await resolveProposal(id, false);
        break;
      case "cancel_jobs":
        await q("UPDATE jobs SET status='canceled', finished_at=NOW() WHERE project_id=$1 AND status='queued'", [id]);
        await q(
          `UPDATE projects SET status='error', status_message='사용자가 작업을 취소했습니다. 재실행할 수 있습니다.', updated_at=NOW()
           WHERE id=$1 AND status='running' AND NOT EXISTS (SELECT 1 FROM jobs WHERE project_id=$1 AND status='running')`,
          [id],
        );
        break;
      default:
        return fail("알 수 없는 액션");
    }
    return ok(await projectBundle(id));
  });
}
