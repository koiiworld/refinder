import { q1 } from "@/lib/db";

/** 루틴 캡처 (비공개: 로그인한 사람만 — /api/img 와 달리 비밀번호 확인을 거침) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.(jpe?g|png|webp)$/i, "");
  const img = await q1<{ mime: string; data: Buffer | Uint8Array }>("SELECT mime, data FROM generated_images WHERE id=$1 AND provider='capture'", [id]);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "private, max-age=3600" } });
}
