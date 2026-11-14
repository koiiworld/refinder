import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { body, handle, ok } from "@/lib/api";
import { STEP_AI_LABEL } from "@/lib/steps";

export async function GET() {
  return handle(async () => ok(await getSettings()));
}

export async function PUT(req: Request) {
  return handle(async () => {
    const b = await body<Partial<AppSettings>>(req);
    const patch: Partial<AppSettings> = {};
    if (typeof b.fallbackToTemplate === "boolean") patch.fallbackToTemplate = b.fallbackToTemplate;
    if (b.stepAi && typeof b.stepAi === "object") {
      const ok = ["openai", "anthropic", "google"];
      const clean: Partial<AppSettings["stepAi"]> = {};
      for (const [k, v] of Object.entries(b.stepAi)) {
        // 모든 단계 저장 (예전엔 키워드·제목·글 작성·검수 4개만 받아 나머지가 조용히 빠졌음)
        if (k in STEP_AI_LABEL && v && ok.includes(v.provider) && String(v.model ?? "").trim()) {
          clean[k as keyof AppSettings["stepAi"]] = { provider: v.provider, model: String(v.model).trim() };
        }
      }
      patch.stepAi = { ...(await getSettings()).stepAi, ...clean };
    }
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
