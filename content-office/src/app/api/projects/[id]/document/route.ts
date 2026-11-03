import { getDocument, saveUserDocument } from "@/lib/repo";
import { body, Ctx, handle, ok } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => ok(await getDocument((await params).id)));
}

/** 에디터 자동 저장 (revision 으로 동시 수정 충돌 감지) */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await body<{ html: string; title: string; revision: number }>(req);
    const res = await saveUserDocument(id, { html: String(b.html ?? ""), title: String(b.title ?? ""), revision: Number(b.revision ?? 0) });
    if (!res.ok) {
      return NextResponse.json(
        { error: "다른 곳(AI 작업 또는 다른 창)에서 원고가 변경되었습니다.", conflict: true, current: res.current },
        { status: 409 },
      );
    }
    return ok(res);
  });
}
