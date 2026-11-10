import { getCarousel } from "@/lib/carousel";
import { checkImageUrl } from "@/lib/official-images";

/**
 * 카드 AI 영상을 같은 주소로 전달 (브라우저 캔버스에 그려 MP4로 내보내려면 같은 출처여야 함)
 * - 이 캐러셀 카드에 저장된 완성 영상만 · Higgsfield 결과 주소는 시간이 지나면 만료될 수 있음
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; job: string }> }) {
  const { id, job } = await params;
  const c = await getCarousel(id);
  const url = c?.slides?.find((s) => s.video?.jobId === job)?.video?.url;
  if (!url) return new Response("not found", { status: 404 });
  try {
    const range = req.headers.get("range");
    const res = await fetch(await checkImageUrl(url), { headers: { "user-agent": "Mozilla/5.0 (compatible; ContentOffice/1.0)", ...(range ? { range } : {}) }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok && res.status !== 206) return new Response("expired", { status: 410 });
    const h = new Headers({ "content-type": res.headers.get("content-type") || "video/mp4", "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
    for (const k of ["content-length", "content-range"]) { const v = res.headers.get(k); if (v) h.set(k, v); }
    return new Response(res.body, { status: res.status, headers: h });
  } catch {
    return new Response("blocked", { status: 502 });
  }
}
