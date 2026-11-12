import { body, fail, handle, ok } from "@/lib/api";
import { uploadThumbImage } from "@/lib/thumbs";

/** 사진·스티커 올리기 { dataUrl, kind: photo|sticker } → { url } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ dataUrl?: string; kind?: string }>(req);
    try { return ok({ url: await uploadThumbImage(String(b.dataUrl ?? ""), b.kind === "sticker" ? "sticker" : "photo") }); } catch (e) { return fail((e as Error).message); }
  });
}
