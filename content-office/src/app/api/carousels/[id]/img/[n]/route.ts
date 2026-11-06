import { getCarousel } from "@/lib/carousel";
import { checkImageUrl } from "@/lib/official-images";

/**
 * 캐러셀 사진을 같은 주소로 전달 (브라우저 캔버스에 그려 저장하려면 같은 출처여야 함)
 * - 이 캐러셀에 등록된 사진만, 공개 주소만
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const c = await getCarousel(id);
  const img = c?.images?.[Number(n)];
  if (!img?.url) return new Response("not found", { status: 404 });
  if (img.url.startsWith("/")) return Response.redirect(new URL(img.url, _req.url), 302);
  try {
    const url = await checkImageUrl(img.url);
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)" }, signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("not an image", { status: 502 });
    return new Response(await res.arrayBuffer(), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("blocked", { status: 502 });
  }
}
