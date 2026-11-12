import { body, fail, handle, ok } from "@/lib/api";
import { saveThumbs, thumbState } from "@/lib/thumbs";
import type { ThumbState } from "@/lib/thumb-types";

/** 썸네일 공장: 사진 목록·스티커·템플릿 */
export async function GET() {
  return handle(async () => ok(await thumbState()));
}

/** 바뀐 목록 저장 { items? stickers? templates? } (지우기는 deletedAt → 30일 휴지통) */
export async function PUT(req: Request) {
  return handle(async () => {
    const b = await body<Partial<ThumbState>>(req);
    try { return ok(await saveThumbs(b)); } catch (e) { return fail((e as Error).message); }
  });
}
