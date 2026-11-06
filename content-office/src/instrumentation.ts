// 서버 시작 시 작업 큐 워커를 기동합니다 (Node.js 런타임에서만).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureWorker } = await import("./lib/jobs");
    ensureWorker();
    const { startKeySync } = await import("./lib/keystore");
    startKeySync();
  }
}
