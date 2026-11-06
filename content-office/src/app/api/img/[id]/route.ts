import { getGeneratedImage } from "@/lib/image-gen";

/** ChatGPT·Gemini로 만든 이미지 (로그인 없이 공개 — 블로그 글에 넣어도 보이도록. 아이디는 추측하기 어려움) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.(jpe?g|png|webp)$/i, "");
  if (!/^img_[0-9a-f]{24}$/.test(id)) return new Response("not found", { status: 404 });
  const img = await getGeneratedImage(id);
  if (!img || (img as { provider?: string }).provider === "capture") return new Response("not found", { status: 404 }); // 루틴 캡처는 비공개
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "public, max-age=31536000, immutable" } });
}
