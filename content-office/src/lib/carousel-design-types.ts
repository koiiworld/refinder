// 캐러셀 디자인 참고함과 실제 캔버스에 적용하는 값 (브라우저·서버 공용)
export type DesignRecipe = {
  layout: "editorial" | "split" | "poster";
  background: string; foreground: string; accent: string;
  spacing: "airy" | "compact"; typography: "calm" | "strong";
};
export type DesignAnalysis = { summary: string; principles: string[]; avoid: string[]; recipe: DesignRecipe };
export type DesignReference = {
  id: string; source_url: string; title: string; note: string;
  images: string[]; analysis: DesignAnalysis | null; favorite: boolean; enabled: boolean;
  created_at: string; analyzed_at: string | null;
};
export const BASE_RECIPE: DesignRecipe = { layout: "editorial", background: "#f6f1e8", foreground: "#172a28", accent: "#c44832", spacing: "airy", typography: "strong" };
export function cleanRecipe(value: unknown): DesignRecipe {
  const v = (value && typeof value === "object" ? value : {}) as Partial<DesignRecipe>;
  const color = (x: unknown, fallback: string) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x : fallback;
  const bg = color(v.background, BASE_RECIPE.background);
  const fg = color(v.foreground, BASE_RECIPE.foreground);
  const lum = (c: string) => { const a = [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4); return a[0]*0.2126+a[1]*0.7152+a[2]*0.0722; };
  const contrast = (a:string,b:string) => (Math.max(lum(a),lum(b))+0.05)/(Math.min(lum(a),lum(b))+0.05);
  return {
    layout: v.layout === "split" || v.layout === "poster" ? v.layout : "editorial",
    background: bg, foreground: contrast(bg,fg)>=4.5 ? fg : contrast(bg,"#ffffff")>contrast(bg,"#111111") ? "#ffffff" : "#111111", accent: color(v.accent, BASE_RECIPE.accent),
    spacing: v.spacing === "compact" ? "compact" : "airy", typography: v.typography === "calm" ? "calm" : "strong",
  };
}

export const LEARN_CATEGORIES = [
  { id: "hook", label: "후킹 문구", description: "구체적인 도움을 약속하는 표지와 제목 · 과장 금지" },
  { id: "image", label: "이미지 생성", description: "구도·빛·색·질감과 이미지 프롬프트" },
  { id: "design", label: "디자인", description: "캐러셀의 여백·글자 크기·배치·색" },
  { id: "blog", label: "블로그", description: "도입·구성·설명 방식과 근거 제시" },
  { id: "other", label: "기타", description: "어디에 쓸지 애매한 자료 · AI가 필요한 분야에 배정" },
] as const;
export type LearnCategory = typeof LEARN_CATEGORIES[number]["id"];
export type LearningAnalysis = DesignAnalysis & {
  categories: Exclude<LearnCategory, "other">[]; reason: string;
  lessons: Partial<Record<Exclude<LearnCategory, "other">, string[]>>;
  hooks: { quote: string; why: string; pattern: string }[];
};
export type LearningRef = Omit<DesignReference, "analysis"> & { category: LearnCategory; analysis: LearningAnalysis | null };
