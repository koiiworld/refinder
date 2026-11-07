import "server-only";
import { q, q1 } from "./db";
import { kstToday } from "./todos";
export type LearningTask = { id:string; ref_id:string; title:string; detail:string; kind:string; done:boolean; todo_id:string|null; idea_id:string|null; source_url:string; source_title:string };
export const TASK_KINDS = { required:"꼭 할 일", study:"더 공부할 것", setup:"설정할 것", direction:"시도할 방향" };
export async function listLearningTasks() { return q<LearningTask>("SELECT t.*, r.source_url, r.title AS source_title FROM ai_learning_tasks t JOIN ai_learning_refs r ON r.id=t.ref_id ORDER BY t.done, t.created_at DESC"); }
export async function learningTaskAction(ids: unknown, action: unknown, done: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.length>50 || !ids.every(x=>typeof x==="string")) throw new Error("과제를 선택해 주세요 (최대 50개).");
  if (!["complete","todo","idea"].includes(String(action))) throw new Error("알 수 없는 과제 작업이에요.");
  for (const id of new Set(ids)) {
    if (!(await q1("SELECT id FROM ai_learning_tasks WHERE id=$1",[id]))) throw new Error("과제를 찾지 못했어요.");
  }
  for (const id of new Set(ids)) {
    if (action === "complete") { await q("UPDATE ai_learning_tasks SET done=$2 WHERE id=$1",[id,done===true]); continue; }
    // 한 SQL 문장으로 등록·연결. 동시 클릭도 결정적인 ID로 중복 생성 방지.
    if (action === "todo") await q(`WITH added AS (
      INSERT INTO todos (id,title,due_date,memo,notify,category)
      SELECT 'todo_'||t.id, LEFT(t.title,200), $2, t.detail || E'\\n출처: ' || r.source_url, FALSE, 'personal'
      FROM ai_learning_tasks t JOIN ai_learning_refs r ON r.id=t.ref_id WHERE t.id=$1 AND t.todo_id IS NULL
      ON CONFLICT (id) DO NOTHING RETURNING id
    ) UPDATE ai_learning_tasks SET todo_id=(SELECT id FROM added) WHERE id=$1 AND EXISTS (SELECT 1 FROM added)`,[id,kstToday()]);
    else await q(`WITH added AS (
      INSERT INTO ideas_notes (id,memo,link,source,category,detail)
      SELECT 'idea_'||t.id, LEFT(t.title || E'\\n' || t.detail,500), r.source_url, 'ai-learning:'||t.ref_id, 'etc', 'AI 학습 과제'
      FROM ai_learning_tasks t JOIN ai_learning_refs r ON r.id=t.ref_id WHERE t.id=$1 AND t.idea_id IS NULL
      ON CONFLICT (id) DO NOTHING RETURNING id
    ) UPDATE ai_learning_tasks SET idea_id=(SELECT id FROM added) WHERE id=$1 AND EXISTS (SELECT 1 FROM added)`,[id]);
  }
  return listLearningTasks();
}
