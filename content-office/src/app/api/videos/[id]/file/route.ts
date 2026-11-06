import { getVideo } from "@/lib/videos";
import { dbFile, signedUrl } from "@/lib/video-store";

/**
 * 영상·썸네일 파일: Supabase 저장소면 1시간짜리 서명 주소로 보냄, DB 보관이면 직접 전송 (구간 재생 지원)
 * ?kind=video|thumb|original &download=1
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sp = new URL(req.url).searchParams;
  const v = await getVideo((await params).id);
  const kind = sp.get("kind") ?? "video";
  const p = kind === "thumb" ? v?.thumb_path : kind === "original" ? v?.original_path : v?.path;
  if (!v || !p) return new Response("not found", { status: 404 });
  const name = `${(v.title || v.id).replace(/[\\/:*?"<>|\n\r]+/g, " ").slice(0, 60).trim() || v.id}${kind === "thumb" ? ".jpg" : ".mp4"}`;
  const signed = await signedUrl(p, sp.get("download") ? name : undefined);
  if (signed) return Response.redirect(signed, 302);
  const f = await dbFile(p);
  if (!f) return new Response("not found", { status: 404 });
  const data = Buffer.from(f.data);
  const headers: Record<string, string> = { "content-type": f.mime, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  if (sp.get("download")) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(data.length) } });
}
