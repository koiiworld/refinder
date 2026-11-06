import { body, fail, handle, ok } from "@/lib/api";
import { keyStatus, removeKey, saveKey } from "@/lib/keystore";

/** API 키 상태 (키 값은 돌려주지 않음, 끝 4자리만) */
export async function GET() {
  return handle(async () => ok(await keyStatus()));
}

/** { env, value } 저장 · { env, remove: true } 지우기 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ env?: string; value?: string; remove?: boolean }>(req);
    try {
      if (b.remove) await removeKey(String(b.env ?? ""));
      else await saveKey(String(b.env ?? ""), String(b.value ?? ""));
      return ok(await keyStatus());
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
