import { body, fail, handle, ok } from "@/lib/api";
import { createSoul, refreshSouls, removeSoul } from "@/lib/image-refs";
import { HiggsfieldError } from "@/lib/higgsfield";

/** Higgsfield Soul ID(내 캐릭터) 목록 — 학습 중이면 상태를 새로 물어봄 */
export async function GET() {
  return handle(async () => ok(await refreshSouls()));
}

/** 만들기: { name, version, refIds, confirm: true } — 학습 비용이 공식 문서에 없어서 화면에서 확인한 요청만 보냄 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ name?: string; version?: string; refIds?: string[]; confirm?: boolean; remove?: string }>(req);
    if (b.remove) {
      await removeSoul(String(b.remove));
      return ok(await refreshSouls());
    }
    if (b.confirm !== true) return fail("비용 확인 후 만들 수 있어요.");
    try {
      return ok(await createSoul(String(b.name ?? ""), String(b.version ?? "v1"), b.refIds ?? []));
    } catch (e) {
      return fail((e as Error).message, e instanceof HiggsfieldError ? 502 : 400);
    }
  });
}
