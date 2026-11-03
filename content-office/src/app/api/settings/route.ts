import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { body, handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => ok(await getSettings()));
}

export async function PUT(req: Request) {
  return handle(async () => {
    const b = await body<Partial<AppSettings>>(req);
    const patch: Partial<AppSettings> = {};
    if (typeof b.fallbackToTemplate === "boolean") patch.fallbackToTemplate = b.fallbackToTemplate;
    if (b.pricing && typeof b.pricing === "object") {
      const clean: AppSettings["pricing"] = {};
      for (const [k, v] of Object.entries(b.pricing)) {
        const input = Number(v?.input ?? 0);
        const output = Number(v?.output ?? 0);
        if (k && (input > 0 || output > 0)) clean[k] = { input, output };
      }
      patch.pricing = clean;
    }
    return ok(await saveSettings(patch));
  });
}
