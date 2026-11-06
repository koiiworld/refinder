import { body, handle, ok } from "@/lib/api";
import { getBrand, saveBrand, DEFAULT_BRAND, type Brand } from "@/lib/brand";

export async function GET() {
  return handle(async () => ok(await getBrand()));
}

/** { name, mark, color } 저장 · { reset: true } 기본값으로 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<Partial<Brand> & { reset?: boolean }>(req);
    return ok(await saveBrand(b.reset ? DEFAULT_BRAND : b));
  });
}
