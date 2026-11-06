import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 무중단 반영용: 새 버전을 다른 폴더(NEXT_DIST_DIR)에 빌드한 뒤 바꿔 끼움 (~/.ai-content-office/restart-app.sh)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PGlite(내장 PostgreSQL)는 WASM 파일을 사용하므로 서버 번들에서 제외합니다.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "ffmpeg-static"],
  // 내 영상 올리기(릴스 편집기 '내 파일')가 비밀번호 확인(proxy)을 거쳐도 잘리지 않게
  experimental: { proxyClientMaxBodySize: "300mb" },
};

export default nextConfig;
