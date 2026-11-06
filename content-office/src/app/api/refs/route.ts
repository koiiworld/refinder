import { fail, handle, ok } from "@/lib/api";
import { refFromUrl, saveRefImage } from "@/lib/image-refs";

/** 🎨 레퍼런스 사진 저장: 폼 'files'(최대 5장) 또는 JSON { url } (만든 이미지에서 고르기) → { ids } */
export async function POST(req: Request) {
  return handle(async () => {
    try {
      if ((req.headers.get("content-type") ?? "").includes("application/json")) {
        const b = (await req.json().catch(() => ({}))) as { url?: string };
        if (!b.url) return fail("이미지 주소가 없어요.");
        return ok({ ids: [await refFromUrl(String(b.url))] });
      }
      const form = await req.formData().catch(() => null);
      const files = (form?.getAll("files") ?? []).filter((f): f is File => typeof f !== "string").slice(0, 5);
      if (!files.length) return fail("사진을 골라 주세요.");
      const ids: string[] = [];
      for (const f of files) ids.push(await saveRefImage(Buffer.from(await f.arrayBuffer()), f.type || "image/jpeg", f.name));
      return ok({ ids });
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
