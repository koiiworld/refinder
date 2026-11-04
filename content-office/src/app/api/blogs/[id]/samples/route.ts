import { q, newId } from "@/lib/db";
import { getBlog } from "@/lib/repo";
import { body, Ctx, fail, handle, ok } from "@/lib/api";
import { fetchNaverPostHtml, findNaverPost, importPostFromUrl, isHtmlFile, sampleHtmlToText } from "@/lib/sample-html";

const MAX_FILE_CHARS = 100_000; // 파일 1개 최대 글자 수
const MAX_FILES = 20;
const MAX_HTML_BYTES = 8_000_000; // 저장한 웹페이지 원본 최대 크기

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

/** HTML에서 뽑은 글이 이보다 짧으면 네이버 글 번호로 본문을 다시 찾아봄 */
const TRY_FETCH_BELOW = 120;
/** 이보다 짧으면 본문을 못 찾은 것으로 봄 (제목만 들어간 경우 등) */
const MIN_HTML_TEXT = 60;

/** 말투 예시 추가: 파일 업로드(브라우저에서 읽은 텍스트) 또는 블로그 글 주소(url)로 가져오기 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const blog = await getBlog(id);
    if (!blog) return fail("블로그 없음", 404);
    const b = await body<{ files?: { filename: string; content: string }[]; url?: string }>(req);
    const count = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM blog_samples WHERE blog_id=$1", [id]);
    const used = Number(count[0]?.n ?? 0);

    // 블로그 글 주소로 가져오기
    if (b.url) {
      if (used + 1 > MAX_FILES) return fail(`블로그당 예시는 최대 ${MAX_FILES}개입니다.`);
      const hosts = (await q<{ url: string }>("SELECT url FROM blogs WHERE COALESCE(url,'') <> ''")).map((r) => { try { return new URL(r.url).hostname.toLowerCase(); } catch { return ""; } }).filter(Boolean);
      let got: { title: string; text: string };
      try {
        got = await importPostFromUrl(b.url, hosts);
      } catch (e) {
        return fail((e as Error).message);
      }
      if (got.text.length < MIN_HTML_TEXT) return fail("이 주소에서 본문 글을 찾지 못했습니다. 공개 글인지 확인해 주세요.");
      const content = got.text.slice(0, MAX_FILE_CHARS);
      await q("INSERT INTO blog_samples (id, blog_id, filename, content) VALUES ($1,$2,$3,$4)", [newId("smp_"), id, `${got.title || "블로그 글"}.md`.slice(0, 200), content]);
      return ok({ ok: true, added: 1, title: got.title, chars: content.length }, 201);
    }

    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length) return fail("업로드할 파일이 없습니다.");
    if (used + files.length > MAX_FILES) return fail(`블로그당 예시 파일은 최대 ${MAX_FILES}개입니다.`);
    const ready: { name: string; content: string }[] = [];
    for (const f of files) {
      const name = String(f.filename ?? "").trim();
      const raw = String(f.content ?? "");
      if (!/\.(md|markdown|txt|html?)$/i.test(name)) return fail(`${name}: .md, .txt, .html 파일만 올릴 수 있습니다.`);
      if (isHtmlFile(name) && raw.length > MAX_HTML_BYTES) return fail(`${name}: HTML 파일이 너무 큽니다.`);
      let content = (isHtmlFile(name) ? sampleHtmlToText(raw) : raw).replace(/\r\n/g, "\n").trim();
      if (isHtmlFile(name) && content.length < TRY_FETCH_BELOW) {
        // 네이버 블로그 화면을 저장하면 본문이 안쪽 창(mainFrame)에 있어 파일에 안 들어감 → 글 번호로 본문을 직접 가져옴
        const naver = findNaverPost(raw);
        if (naver) {
          try {
            const fetched = sampleHtmlToText(await fetchNaverPostHtml(naver));
            if (fetched.length > content.length) content = fetched;
          } catch {
            /* 아래에서 안내 */
          }
        }
        if (content.length < MIN_HTML_TEXT)
          return fail(`${name}: HTML에서 본문 글을 찾지 못했습니다. 네이버 블로그는 화면 저장 시 본문이 빠질 수 있어요 — 아래 '글 주소로 가져오기'에 글 주소를 넣어 주세요.`);
      }
      if (!content) return fail(`${name}: 내용이 비어 있습니다.`);
      if (content.length > MAX_FILE_CHARS) return fail(`${name}: 글이 너무 깁니다 (최대 ${MAX_FILE_CHARS.toLocaleString()}자).`);
      ready.push({ name, content });
    }
    for (const f of ready) {
      await q("INSERT INTO blog_samples (id, blog_id, filename, content) VALUES ($1,$2,$3,$4)", [newId("smp_"), id, f.name.slice(0, 200), f.content]);
    }
    return ok({ ok: true, added: files.length }, 201);
  });
}
