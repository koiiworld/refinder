import { body, fail, handle, ok } from "@/lib/api";
import { getBlogForAi } from "@/lib/repo";
import { runStep } from "@/lib/ai/run";
import { AiError } from "@/lib/ai/providers";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * 크리에이터 어드바이저 캡처 → AI가 화면의 유입 검색어 목록을 읽어 붙여넣기 형식(한 줄에 하나)으로 돌려줌
 * - 저장은 하지 않음: 사용자가 결과를 확인·수정한 뒤 '저장'
 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ blogId?: string; images?: string[] }>(req);
    const images = (Array.isArray(b.images) ? b.images : []).filter((s) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(String(s))).slice(0, 4);
    if (!images.length) return fail("PNG·JPG·WEBP 캡처 이미지를 올려 주세요.");
    if (images.some((s) => (s.length * 3) / 4 > MAX_BYTES)) return fail("이미지가 너무 큽니다 (한 장에 6MB 이하).");
    const blog = b.blogId ? await getBlogForAi(b.blogId) : null;
    const system = `당신은 네이버 크리에이터 어드바이저 화면을 읽어 옮겨 적는 도우미입니다. 화면에 실제로 보이는 글자만 옮기고, 보이지 않는 내용은 절대 지어내지 않습니다.`;
    const prompt = `첨부한 캡처는 네이버 크리에이터 어드바이저의 '유입 검색어' 또는 '트렌드' 화면입니다.
화면에 보이는 검색어 목록을 순위대로 한 줄에 하나씩 옮겨 적으세요.
- 형식: "순위 검색어 변동" (예: "1 김장 양념 비율", "2 절임배추 ▲3", "3 굴보쌈 NEW"). 변동 표시(▲숫자, ▼숫자, NEW)가 보일 때만 붙이세요.
- 순위 숫자가 화면에 없으면 위에서부터 1, 2, 3… 으로 매기세요.
- 메뉴·날짜·설명 문구·조회수 숫자는 빼고 검색어만.
- 여러 장이면 이어서 적되 같은 검색어는 한 번만.
- 목록 말고 다른 설명은 쓰지 마세요. 검색어가 안 보이면 "(검색어 없음)"만 쓰세요.`;
    try {
      const res = await runStep({
        step: "keywords", purpose: "creator-image", blog: blog ?? null, system, prompt, images, maxTokens: 2000,
        template: () => "",
      });
      const text = res.text.replace(/```[a-z]*\n?|```/g, "").trim();
      return ok({ text: /검색어 없음/.test(text) ? "" : text, provider: res.provider, model: res.model, substitutedFor: res.substitutedFor ?? null });
    } catch (e) {
      if (e instanceof AiError) return fail(e.message, 502);
      throw e;
    }
  });
}
