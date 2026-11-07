import { body, fail, handle, ok } from "@/lib/api";
import { extractJson, runStep } from "@/lib/ai/run";
import { AiError } from "@/lib/ai/providers";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * 수익 화면 캡처(애드포스트 등) → AI가 화면의 수익 숫자를 읽어 돌려줌
 * - 저장은 하지 않음: 입력칸에 채워 주고 사용자가 확인 후 '저장'
 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ channel?: string; month?: string; images?: string[] }>(req);
    const images = (Array.isArray(b.images) ? b.images : []).filter((s) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(String(s))).slice(0, 3);
    if (!images.length) return fail("PNG·JPG·WEBP 캡처 이미지를 올려 주세요.");
    if (images.some((s) => (s.length * 3) / 4 > MAX_BYTES)) return fail("이미지가 너무 큽니다 (한 장에 6MB 이하).");
    const name = b.channel === "adsense" ? "구글 애드센스" : b.channel === "coupang" ? "쿠팡파트너스" : "네이버 애드포스트";
    const month = /^\d{4}-\d{2}$/.test(String(b.month)) ? String(b.month) : "";
    const system = `당신은 광고 수익 화면을 읽어 숫자를 옮겨 적는 도우미입니다. 화면에 실제로 보이는 숫자만 옮기고, 보이지 않는 값은 절대 지어내지 않습니다. 반드시 JSON 객체 하나만 출력합니다.`;
    const prompt = `첨부한 캡처는 ${name} 수익 화면입니다.${month ? ` 찾는 달: ${month}` : ""}
- krw: ${month ? "그 달의" : "이번 달(또는 화면에 보이는 가장 최근 달)의"} 수익 합계(원). 일별 표만 있으면 그 달 날짜들을 더하세요. 원화가 아니면 0.
- usd: 달러로 표시된 경우 그 금액, 아니면 null
- period: 그 숫자의 기간 (예: "2026-11-01~2026-11-06", 모르면 빈 문자열)
- metric: 화면에 보이는 노출·클릭 수 등을 짧게 (예: "노출 12,300 · 클릭 210"), 없으면 빈 문자열
- days: 날짜별 수익 표가 보이면 [{"date":"YYYY-MM-DD","krw":숫자}] 로 보이는 날짜 전부 (연도가 안 보이면 ${(month || new Date().toISOString().slice(0, 7)).slice(0, 4)}년), 표가 없으면 []
- found: 수익 숫자를 찾았으면 true, 못 찾았으면 false
형식: {"krw": 0, "usd": null, "period": "", "metric": "", "days": [], "found": true}`;
    try {
      const res = await runStep({ step: "keywords", purpose: "revenue-capture", blog: null, system, prompt, images, json: true, maxTokens: 800 });
      const raw = extractJson<{ krw?: number; usd?: number | null; period?: string; metric?: string; days?: { date?: string; krw?: number }[]; found?: boolean }>(res.text);
      const days = (Array.isArray(raw.days) ? raw.days : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.date))).map((d) => ({ date: String(d.date), krw: Math.max(0, Math.round(Number(d.krw) || 0)) })).slice(0, 62);
      if (raw.found === false) return fail("캡처에서 수익 숫자를 찾지 못했어요. 수익 금액이 보이는 화면으로 다시 올려 주세요.", 422);
      return ok({ krw: Math.max(0, Math.round(Number(raw.krw) || 0)), usd: raw.usd == null ? null : Number(raw.usd) || null, period: String(raw.period ?? ""), metric: String(raw.metric ?? "").slice(0, 120), days, provider: res.provider, model: res.model });
    } catch (e) {
      if (e instanceof AiError) return fail(e.message, 502);
      throw e;
    }
  });
}
