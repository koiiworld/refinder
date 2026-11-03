import type { MetadataRoute } from "next";

// 휴대폰 '홈 화면에 추가' 시 앱처럼 실행
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI 콘텐츠 오피스",
    short_name: "콘텐츠오피스",
    description: "멀티 블로그 AI 콘텐츠 제작 오피스",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#3355ff",
    lang: "ko",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
