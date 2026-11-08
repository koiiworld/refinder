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
    // 직접 올린 사진(base64)은 따로 저장하고 본문에는 주소만 (글이 가벼워지고 검수 AI 가 사진도 봄)
    const { externalizeImages } = await import("@/lib/inline-images");
    const ext = await externalizeImages(String(b.html ?? ""), id);
    const res = await saveUserDocument(id, { html: ext.html, title: String(b.title ?? ""), revision: Number(b.revision ?? 0) });
    if (!res.ok) {
      return NextResponse.json(
        { error: "다른 곳(AI 작업 또는 다른 창)에서 원고가 변경되었습니다.", conflict: true, current: res.current },
        { status: 409 },
      );
    }
    return ok(res);
  });
}
