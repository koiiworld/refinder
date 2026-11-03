import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite(내장 PostgreSQL)는 WASM 파일을 사용하므로 서버 번들에서 제외합니다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
