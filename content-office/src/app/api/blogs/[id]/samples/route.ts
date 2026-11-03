import { q, newId } from "@/lib/db";
import { getBlog } from "@/lib/repo";
import { body, Ctx, fail, handle, ok } from "@/lib/api";

const MAX_FILE_CHARS = 100_000; // 파일 1개 최대 글자 수
const MAX_FILES = 20;

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    return ok(
      await q(
        "SELECT id, filename, content, enabled, LENGTH(content) AS chars, created_at FROM blog_samples WHERE blog_id=$1 ORDER BY created_at",
        [id],
      ),
    );
  });
}

/** 말투 예시 파일 업로드 (브라우저에서 읽은 텍스트를 전송) */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    if (!(await getBlog(id))) return fail("블로그 없음", 404);
    const b = await body<{ files: { filename: string; content: string }[] }>(req);
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length) return fail("업로드할 파일이 없습니다.");
    const count = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM blog_samples WHERE blog_id=$1", [id]);
    if (Number(count[0]?.n ?? 0) + files.length > MAX_FILES) return fail(`블로그당 예시 파일은 최대 ${MAX_FILES}개입니다.`);
    for (const f of files) {
      const name = String(f.filename ?? "").trim();
      const content = String(f.content ?? "").replace(/\r\n/g, "\n").trim();
      if (!/\.(md|markdown|txt)$/i.test(name)) return fail(`${name}: .md, .markdown, .txt 파일만 올릴 수 있습니다.`);
      if (!content) return fail(`${name}: 내용이 비어 있습니다.`);
      if (content.length > MAX_FILE_CHARS) return fail(`${name}: 파일이 너무 깁니다 (최대 ${MAX_FILE_CHARS.toLocaleString()}자).`);
    }
    for (const f of files) {
      await q("INSERT INTO blog_samples (id, blog_id, filename, content) VALUES ($1,$2,$3,$4)", [
        newId("smp_"),
        id,
        String(f.filename).trim().slice(0, 200),
        String(f.content).replace(/\r\n/g, "\n").trim(),
      ]);
    }
    return ok({ ok: true, added: files.length }, 201);
  });
}
